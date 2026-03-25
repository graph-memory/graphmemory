#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';
import { loadMultiConfig, defaultConfig, type MultiConfig } from '@/lib/multi-config';
import { hashPassword } from '@/lib/jwt';
import { ProjectManager } from '@/lib/project-manager';
import { loadModel, RedisEmbeddingCache, type EmbeddingCacheFactory } from '@/lib/embedder';
import { startMultiProjectHttpServer, setDebugMode } from '@/api/index';
import { GRACEFUL_SHUTDOWN_TIMEOUT_MS, MIN_PASSWORD_LEN, MAX_PASSWORD_LEN } from '@/lib/defaults';
import { getRedisClient, closeRedis, parseRedisTtl } from '@/lib/redis';
import { RedisSessionStore } from '@/lib/session-store';
import type { SessionStore } from '@/lib/session-store';

const program = new Command();

const pkgJsonPath = path.resolve(__dirname, '../../package.json');
const pkgVersion: string = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')).version;

program
  .name('graphmemory')
  .description('MCP server for semantic graph memory from markdown docs and source code')
  .version(pkgVersion);

const parseIntArg = (v: string) => parseInt(v, 10);

// ---------------------------------------------------------------------------
// Helper: load config from file, or fall back to default (cwd as single project)
// ---------------------------------------------------------------------------

function loadConfigOrDefault(configPath: string): MultiConfig {
  if (fs.existsSync(configPath)) {
    return loadMultiConfig(configPath);
  }
  process.stderr.write(`[cli] Config "${configPath}" not found, using current directory as project\n`);
  return defaultConfig(process.cwd());
}

// ---------------------------------------------------------------------------
// Command: index — scan one project and exit
// ---------------------------------------------------------------------------

program
  .command('index')
  .description('Scan and embed all matching files, then exit (all projects or one with --project)')
  .option('--config <path>', 'Path to graph-memory.yaml', 'graph-memory.yaml')
  .option('--project <id>', 'Project ID to index (omit to index all)')
  .option('--reindex', 'Discard persisted graphs and re-index from scratch')
  .action((opts: { config: string; project?: string; reindex?: boolean }) => {
    (async () => {
      const mc = loadConfigOrDefault(opts.config);
      const reindex = !!opts.reindex;
      if (reindex) process.stderr.write('[index] Re-indexing from scratch\n');

      const manager = new ProjectManager(mc.server);

      // Build workspace membership lookup
      const projectWorkspace = new Map<string, string>();
      for (const [wsId, wsConfig] of mc.workspaces) {
        for (const projId of wsConfig.projects) {
          projectWorkspace.set(projId, wsId);
        }
      }

      // Add workspaces first
      for (const [wsId, wsConfig] of mc.workspaces) {
        await manager.addWorkspace(wsId, wsConfig, reindex);
      }

      // Add projects (workspace projects share knowledge/task/skill graphs)
      const ids = opts.project ? [opts.project] : Array.from(mc.projects.keys());
      if (ids.length === 0) {
        process.stderr.write('[index] No projects defined in config\n');
        process.exit(1);
      }

      for (const id of ids) {
        const project = mc.projects.get(id);
        if (!project) {
          process.stderr.write(`[index] Project "${id}" not found in config. Available: ${Array.from(mc.projects.keys()).join(', ')}\n`);
          process.exit(1);
        }
        await manager.addProject(id, project, reindex, projectWorkspace.get(id));
      }

      // Register models for lazy loading (workspaces first, then projects)
      for (const wsId of manager.listWorkspaces()) {
        await manager.loadWorkspaceModels(wsId);
      }
      for (const id of ids) {
        await manager.loadModels(id);
      }

      // Create indexers for all projects
      for (const id of ids) {
        manager.ensureIndexer(id);
      }

      // Three-phase sequential indexing: docs → files → code
      // Models load lazily on first embed, so only one ONNX pipeline at a time.
      const phases = [
        { phase: 'docs' as const, label: '1/3 docs' },
        { phase: 'files' as const, label: '2/3 files' },
        { phase: 'code' as const, label: '3/3 code' },
      ];
      for (const { phase, label } of phases) {
        for (const id of ids) {
          process.stderr.write(`[index] Phase ${label} for "${id}"...\n`);
          await manager.startIndexingPhase(id, phase);
        }
      }

      // Finalize all projects (drain edges, start watchers, save, mirror)
      for (const id of ids) {
        await manager.finalizeIndexing(id);
        const instance = manager.getProject(id)!;
        if (instance.docGraph) {
          process.stderr.write(`[index] "${id}" docs: ${instance.docGraph.order} nodes, ${instance.docGraph.size} edges\n`);
        }
        if (instance.codeGraph) {
          process.stderr.write(`[index] "${id}" code: ${instance.codeGraph.order} nodes, ${instance.codeGraph.size} edges\n`);
        }
        if (instance.fileIndexGraph) {
          process.stderr.write(`[index] "${id}" files: ${instance.fileIndexGraph.order} nodes, ${instance.fileIndexGraph.size} edges\n`);
        }
      }

      // Save workspaces
      for (const wsId of manager.listWorkspaces()) {
        const ws = manager.getWorkspace(wsId)!;
        process.stderr.write(`[index] Workspace "${wsId}" knowledge: ${ws.knowledgeGraph.order} nodes, tasks: ${ws.taskGraph.order} nodes, skills: ${ws.skillGraph.order} nodes\n`);
      }

      await manager.shutdown();
      process.stderr.write(`[index] Done. Indexed ${ids.length} project${ids.length > 1 ? 's' : ''}.\n`);
    })().catch((err: unknown) => {
      process.stderr.write(`[index] Fatal: ${err}\n`);
      process.exit(1);
    });
  });

// ---------------------------------------------------------------------------
// Command: serve — multi-project HTTP mode
// ---------------------------------------------------------------------------

program
  .command('serve')
  .description('Start multi-project MCP server over HTTP')
  .option('--config <path>', 'Path to graph-memory.yaml', 'graph-memory.yaml')
  .option('--host <addr>', 'HTTP server bind address')
  .option('--port <n>', 'HTTP server port', parseIntArg)
  .option('--reindex', 'Discard persisted graphs and re-index from scratch')
  .option('--debug', 'Log MCP tool calls and responses to stderr')
  .action(async (opts: { config: string; host?: string; port?: number; reindex?: boolean; debug?: boolean }) => {
    const mc = loadConfigOrDefault(opts.config);
    const host = opts.host ?? mc.server.host;
    const port = opts.port ?? mc.server.port;
    const sessionTimeoutMs = mc.server.sessionTimeout * 1000;

    // Validate jwtSecret when users are defined
    const hasUsers = Object.keys(mc.users).length > 0;
    if (hasUsers && !mc.server.jwtSecret) {
      process.stderr.write('[serve] Warning: users are defined but server.jwtSecret is not set. UI password login will not work (API key auth still works).\n');
    }

    const reindex = !!opts.reindex;
    if (reindex) process.stderr.write('[serve] Re-indexing all projects from scratch\n');

    if (opts.debug) setDebugMode(true);

    // Connect to Redis if configured
    let sessionStore: SessionStore | undefined;
    let cacheFactory: EmbeddingCacheFactory | undefined;
    const redisConfig = mc.server.redis;
    if (redisConfig?.enabled) {
      try {
        const client = await getRedisClient(redisConfig);
        sessionStore = new RedisSessionStore(client, `${redisConfig.prefix}session:`);
        const ttlSeconds = parseRedisTtl(redisConfig.embeddingCacheTtl);
        // Per-model cache: same model shares one cache, different models get separate Redis key prefixes
        const cacheInstances = new Map<string, RedisEmbeddingCache>();
        cacheFactory = (modelFingerprint: string) => {
          let cache = cacheInstances.get(modelFingerprint);
          if (!cache) {
            // Sanitize fingerprint for use as Redis key segment
            const safeKey = modelFingerprint.replace(/[^a-zA-Z0-9_.-]/g, '_');
            cache = new RedisEmbeddingCache(client, `${redisConfig.prefix}emb:${safeKey}:`, ttlSeconds);
            cacheInstances.set(modelFingerprint, cache);
          }
          return cache;
        };
        process.stderr.write(`[serve] Redis enabled: session store + embedding cache (TTL: ${redisConfig.embeddingCacheTtl})\n`);
      } catch (err: unknown) {
        process.stderr.write(`[serve] Redis connection failed, falling back to in-memory: ${err}\n`);
      }
    }

    const manager = new ProjectManager(mc.server, cacheFactory);

    // Build workspace membership lookup
    const projectWorkspace = new Map<string, string>();
    for (const [wsId, wsConfig] of mc.workspaces) {
      for (const projId of wsConfig.projects) {
        projectWorkspace.set(projId, wsId);
      }
    }

    // Add workspaces first (loads shared knowledge/task/skill graphs)
    for (const [wsId, wsConfig] of mc.workspaces) {
      await manager.addWorkspace(wsId, wsConfig, reindex);
    }

    // Add all projects (workspace projects share knowledge/task/skill graphs)
    for (const [id, config] of mc.projects) {
      await manager.addProject(id, config, reindex, projectWorkspace.get(id));
    }

    // Embedding API model names (loaded in background with other models)
    const embeddingApiModelNames = mc.server.embeddingApi?.enabled
      ? { default: '__server__', code: '__server_code__' } : undefined;

    // Load models and index all projects before starting HTTP
    // Load embedding API models if enabled (default + code)
    if (embeddingApiModelNames) {
      try {
        await loadModel(mc.server.model, mc.server.embedding, mc.server.modelsDir, embeddingApiModelNames.default, cacheFactory);
        const codeModel = mc.server.codeModel ?? mc.server.model;
        await loadModel(codeModel, mc.server.embedding, mc.server.modelsDir, embeddingApiModelNames.code, cacheFactory);
        process.stderr.write(`[serve] Embedding API models ready (default + code)\n`);
      } catch (err: unknown) {
        process.stderr.write(`[serve] Failed to load embedding API model: ${err}\n`);
      }
    }

    // Register models for lazy loading (workspaces first, then projects)
    for (const wsId of manager.listWorkspaces()) {
      try {
        await manager.loadWorkspaceModels(wsId);
      } catch (err: unknown) {
        process.stderr.write(`[serve] Failed to register workspace "${wsId}" models: ${err}\n`);
      }
    }

    const projectIds = manager.listProjects();
    for (const id of projectIds) {
      try {
        await manager.loadModels(id);
      } catch (err: unknown) {
        process.stderr.write(`[serve] Failed to register project "${id}" models: ${err}\n`);
      }
    }

    // Three-phase sequential indexing: docs → files → code
    for (const id of projectIds) {
      try { manager.ensureIndexer(id); } catch (err: unknown) {
        process.stderr.write(`[serve] Failed to create indexer for "${id}": ${err}\n`);
      }
    }
    const phases = [
      { phase: 'docs' as const, label: '1/3 docs' },
      { phase: 'files' as const, label: '2/3 files' },
      { phase: 'code' as const, label: '3/3 code' },
    ];
    for (const { phase, label } of phases) {
      for (const id of projectIds) {
        try {
          process.stderr.write(`[serve] Phase ${label} for "${id}"...\n`);
          await manager.startIndexingPhase(id, phase);
        } catch (err: unknown) {
          process.stderr.write(`[serve] Failed phase ${label} for "${id}": ${err}\n`);
        }
      }
    }
    for (const id of projectIds) {
      try {
        await manager.finalizeIndexing(id);
      } catch (err: unknown) {
        process.stderr.write(`[serve] Failed to finalize "${id}": ${err}\n`);
      }
    }

    // Start workspace mirror watchers (after all projects are indexed)
    for (const wsId of manager.listWorkspaces()) {
      try {
        await manager.startWorkspaceMirror(wsId);
      } catch (err: unknown) {
        process.stderr.write(`[serve] Failed to start workspace "${wsId}" mirror: ${err}\n`);
      }
    }

    // Start auto-save
    manager.startAutoSave();

    // Start HTTP server (all models loaded, all projects indexed)
    const httpServer = await startMultiProjectHttpServer(host, port, sessionTimeoutMs, manager, {
      serverConfig: mc.server,
      users: mc.users,
      embeddingApiModelNames,
      sessionStore,
    });

    // Track open connections for graceful shutdown
    const openSockets = new Set<import('net').Socket>();
    httpServer.on('connection', (socket) => {
      openSockets.add(socket);
      socket.on('close', () => openSockets.delete(socket));
    });

    let shuttingDown = false;
    async function shutdown(): Promise<void> {
      if (shuttingDown) {
        process.stderr.write('[serve] Force exit\n');
        process.exit(1);
      }
      shuttingDown = true;
      process.stderr.write('[serve] Shutting down...\n');
      // Force exit after 5s if graceful shutdown hangs
      const forceTimer = setTimeout(() => {
        process.stderr.write('[serve] Shutdown timeout, force exit\n');
        process.exit(1);
      }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
      try {
        httpServer.close();
        // Destroy all open connections (including WebSocket) so the server can close
        for (const socket of openSockets) {
          socket.destroy();
        }
        openSockets.clear();
        await manager.shutdown();
        await closeRedis();
      } catch { /* ignore */ }
      clearTimeout(forceTimer);
      // Let event loop drain naturally — avoids ONNX global thread pool destructor crash on macOS
    }

    process.on('SIGINT',  () => { void shutdown(); });
    process.on('SIGTERM', () => { void shutdown(); });
  });

// ---------------------------------------------------------------------------
// Command: users — manage users in config
// ---------------------------------------------------------------------------

const usersCmd = program
  .command('users')
  .description('Manage users in graph-memory.yaml');

usersCmd
  .command('add')
  .description('Add a new user interactively')
  .option('--config <path>', 'Path to graph-memory.yaml', 'graph-memory.yaml')
  .action(async (opts: { config: string }) => {
    const configPath = path.resolve(opts.config);

    // Read raw YAML to preserve formatting
    let yamlContent: string;
    try {
      yamlContent = fs.readFileSync(configPath, 'utf-8');
    } catch {
      process.stderr.write(`[users] Cannot read config: ${configPath}\n`);
      process.exit(1);
    }

    // Validate config loads
    const mc = loadMultiConfig(configPath);

    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve));
    const askHidden = (q: string): Promise<string> => new Promise(resolve => {
      process.stderr.write(q);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      if (stdin.isTTY) stdin.setRawMode(true);
      let input = '';
      const onData = (ch: Buffer) => {
        const c = ch.toString();
        if (c === '\n' || c === '\r') {
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          stdin.removeListener('data', onData);
          process.stderr.write('\n');
          resolve(input);
        } else if (c === '\u0003') {
          // Ctrl+C
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          process.exit(0);
        } else if (c === '\u007f' || c === '\b') {
          input = input.slice(0, -1);
        } else {
          input += c;
        }
      };
      stdin.on('data', onData);
    });

    try {
      const userId = await ask('User ID (e.g. "user"): ');
      if (!userId.trim()) { process.stderr.write('User ID is required\n'); process.exit(1); }
      const id = userId.trim();

      if (mc.users[id]) {
        process.stderr.write(`[users] User "${id}" already exists in config\n`);
        process.exit(1);
      }

      const name = (await ask('Name: ')).trim();
      if (!name) { process.stderr.write('Name is required\n'); process.exit(1); }

      const email = (await ask('Email: ')).trim();
      if (!email) { process.stderr.write('Email is required\n'); process.exit(1); }

      const password = await askHidden('Password: ');
      if (!password) { process.stderr.write('Password is required\n'); process.exit(1); }

      const password2 = await askHidden('Confirm password: ');
      if (password !== password2) { process.stderr.write('Passwords do not match\n'); process.exit(1); }

      // Validate inputs
      if (/[\x00-\x1f\x7f]/.test(name)) { process.stderr.write('Name contains invalid characters\n'); process.exit(1); }
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { process.stderr.write('Invalid email format\n'); process.exit(1); }
      if (password.length < MIN_PASSWORD_LEN) { process.stderr.write(`Password too short (min ${MIN_PASSWORD_LEN} characters)\n`); process.exit(1); }
      if (password.length > MAX_PASSWORD_LEN) { process.stderr.write(`Password too long (max ${MAX_PASSWORD_LEN})\n`); process.exit(1); }

      const pwHash = await hashPassword(password);
      const apiKey = `mgm-${crypto.randomBytes(24).toString('base64url')}`;

      // Build YAML block for the new user — escape quotes to prevent YAML injection
      const safeName = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const safeEmail = email.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const userBlock = [
        `  ${id}:`,
        `    name: "${safeName}"`,
        `    email: "${safeEmail}"`,
        `    apiKey: "${apiKey}"`,
        `    passwordHash: "${pwHash}"`,
      ].join('\n');

      // Insert into YAML — find existing `users:` section or add one
      if (yamlContent.includes('\nusers:')) {
        // Append under existing users: section
        yamlContent = yamlContent.replace(/\nusers:\s*\n/, (match) => {
          return match + userBlock + '\n';
        });
      } else if (yamlContent.startsWith('users:')) {
        yamlContent = yamlContent.replace(/^users:\s*\n/, (match) => {
          return match + userBlock + '\n';
        });
      } else {
        // Add users section at the end
        yamlContent = yamlContent.trimEnd() + '\n\nusers:\n' + userBlock + '\n';
      }

      fs.writeFileSync(configPath, yamlContent, 'utf-8');

      // Validate the result
      try {
        loadMultiConfig(configPath);
      } catch (err) {
        process.stderr.write(`[users] Warning: config validation failed after edit: ${err}\n`);
      }

      process.stderr.write(`\nUser "${id}" added successfully.\n`);
      process.stderr.write(`  API Key: ${apiKey}\n`);
      process.stderr.write(`  (save this key — it cannot be recovered)\n`);
    } finally {
      rl.close();
    }
  });

program.parse();
