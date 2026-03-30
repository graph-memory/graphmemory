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
import { startMultiProjectHttpServer } from '@/api/index';
import { GRACEFUL_SHUTDOWN_TIMEOUT_MS, MIN_PASSWORD_LEN, MAX_PASSWORD_LEN } from '@/lib/defaults';
import { getRedisClient, closeRedis, parseRedisTtl } from '@/lib/redis';
import { RedisSessionStore } from '@/lib/session-store';
import type { SessionStore } from '@/lib/session-store';
import { createLogger, setLogLevel } from '@/lib/logger';

const program = new Command();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkgVersion: string = require(path.resolve(__dirname, '../../package.json')).version;

program
  .name('graphmemory')
  .description('MCP server for semantic graph memory from markdown docs and source code')
  .version(pkgVersion);

const parseIntArg = (v: string) => parseInt(v, 10);

// ---------------------------------------------------------------------------
// Helper: load config from file, or fall back to default (cwd as single project)
// ---------------------------------------------------------------------------

const log = createLogger('cli');

function loadConfigOrDefault(configPath: string): MultiConfig {
  if (fs.existsSync(configPath)) {
    return loadMultiConfig(configPath);
  }
  log.warn({ configPath }, 'Config not found, using current directory as project');
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
      if (reindex) log.info('Re-indexing from scratch');

      const hasUsers = Object.keys(mc.users).length > 0;
      const manager = new ProjectManager(mc.server, undefined, hasUsers);

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
        log.error('No projects defined in config');
        process.exit(1);
      }

      for (const id of ids) {
        const project = mc.projects.get(id);
        if (!project) {
          log.error({ projectId: id, available: Array.from(mc.projects.keys()) }, 'Project not found in config');
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
          log.info({ phase: label, projectId: id }, 'Starting indexing phase');
          await manager.startIndexingPhase(id, phase);
        }
      }

      // Finalize all projects (drain edges, start watchers, save, mirror)
      for (const id of ids) {
        await manager.finalizeIndexing(id);
        const instance = manager.getProject(id)!;
        if (instance.docGraph) {
          log.info({ projectId: id, graph: 'docs', nodes: instance.docGraph.order, edges: instance.docGraph.size }, 'Indexed docs');
        }
        if (instance.codeGraph) {
          log.info({ projectId: id, graph: 'code', nodes: instance.codeGraph.order, edges: instance.codeGraph.size }, 'Indexed code');
        }
        if (instance.fileIndexGraph) {
          log.info({ projectId: id, graph: 'files', nodes: instance.fileIndexGraph.order, edges: instance.fileIndexGraph.size }, 'Indexed files');
        }
      }

      // Save workspaces
      for (const wsId of manager.listWorkspaces()) {
        const ws = manager.getWorkspace(wsId)!;
        log.info({ workspaceId: wsId, knowledge: ws.knowledgeGraph.order, tasks: ws.taskGraph.order, skills: ws.skillGraph.order }, 'Workspace stats');
      }

      await manager.shutdown();
      log.info({ count: ids.length }, 'Indexing complete');
    })().catch((err: unknown) => {
      log.fatal({ err }, 'Fatal error');
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
  .option('--log-level <level>', 'Log level: fatal/error/warn/info/debug/trace', 'info')
  .action(async (opts: { config: string; host?: string; port?: number; reindex?: boolean; logLevel?: string }) => {
    const mc = loadConfigOrDefault(opts.config);
    const host = opts.host ?? mc.server.host;
    const port = opts.port ?? mc.server.port;
    const sessionTimeoutMs = mc.server.sessionTimeout * 1000;

    if (opts.logLevel) setLogLevel(opts.logLevel);

    // Validate jwtSecret when users are defined
    const hasUsers = Object.keys(mc.users).length > 0;
    if (hasUsers && !mc.server.jwtSecret) {
      log.warn('Users are defined but server.jwtSecret is not set. UI password login will not work (API key auth still works).');
    }

    const reindex = !!opts.reindex;
    if (reindex) log.info('Re-indexing all projects from scratch');

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
        log.info({ ttl: redisConfig.embeddingCacheTtl }, 'Redis enabled: session store + embedding cache');
      } catch (err: unknown) {
        log.warn({ err }, 'Redis connection failed, falling back to in-memory');
      }
    }

    const manager = new ProjectManager(mc.server, cacheFactory, hasUsers);

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
        log.info('Embedding API models ready (default + code)');
      } catch (err: unknown) {
        log.error({ err }, 'Failed to load embedding API model');
      }
    }

    // Register models for lazy loading (workspaces first, then projects)
    for (const wsId of manager.listWorkspaces()) {
      try {
        await manager.loadWorkspaceModels(wsId);
      } catch (err: unknown) {
        log.error({ err, workspaceId: wsId }, 'Failed to register workspace models');
      }
    }

    const projectIds = manager.listProjects();
    for (const id of projectIds) {
      try {
        await manager.loadModels(id);
      } catch (err: unknown) {
        log.error({ err, projectId: id }, 'Failed to register project models');
      }
    }

    // Three-phase sequential indexing: docs → files → code
    for (const id of projectIds) {
      try { manager.ensureIndexer(id); } catch (err: unknown) {
        log.error({ err, projectId: id }, 'Failed to create indexer');
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
          log.info({ phase: label, projectId: id }, 'Starting indexing phase');
          await manager.startIndexingPhase(id, phase);
        } catch (err: unknown) {
          log.error({ err, phase: label, projectId: id }, 'Failed indexing phase');
        }
      }
    }
    for (const id of projectIds) {
      try {
        await manager.finalizeIndexing(id);
      } catch (err: unknown) {
        log.error({ err, projectId: id }, 'Failed to finalize indexing');
      }
    }

    // Start workspace mirror watchers (after all projects are indexed)
    for (const wsId of manager.listWorkspaces()) {
      try {
        await manager.startWorkspaceMirror(wsId);
      } catch (err: unknown) {
        log.error({ err, workspaceId: wsId }, 'Failed to start workspace mirror');
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
        log.warn('Force exit');
        process.exit(1);
      }
      shuttingDown = true;
      log.info('Shutting down...');
      // Force exit after 5s if graceful shutdown hangs
      const forceTimer = setTimeout(() => {
        log.warn('Shutdown timeout, force exit');
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
      log.error({ configPath }, 'Cannot read config');
      process.exit(1);
    }

    // Validate config loads
    const mc = loadMultiConfig(configPath);

    let rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve));
    const askHidden = (q: string): Promise<string> => new Promise(resolve => {
      // Close readline completely so it cannot echo characters
      rl.close();
      process.stderr.write(q);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      if (stdin.isTTY) stdin.setRawMode(true);
      stdin.resume();
      let input = '';
      const onData = (ch: Buffer) => {
        const c = ch.toString();
        if (c === '\n' || c === '\r') {
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          stdin.removeListener('data', onData);
          process.stderr.write('\n');
          // Recreate readline for any subsequent ask() calls
          rl = readline.createInterface({ input: process.stdin, output: process.stderr });
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
        log.error({ userId: id }, 'User already exists in config');
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
        log.warn({ err }, 'Config validation failed after edit');
      }

      process.stderr.write(`\nUser "${id}" added successfully.\n`);
      process.stderr.write(`  API Key: ${apiKey}\n`);
      process.stderr.write(`  (save this key — it cannot be recovered)\n`);
    } finally {
      rl.close();
    }
  });

// ---------------------------------------------------------------------------
// Command: backup — export graph data and mirror files
// ---------------------------------------------------------------------------

program
  .command('backup')
  .description('Backup graph data and mirror files to a tar.gz archive')
  .requiredOption('--config <path>', 'Path to graph-memory.yaml')
  .requiredOption('--output <path>', 'Output path for backup archive (e.g. backup.tar.gz)')
  .action(async (opts: { config: string; output: string }) => {
    const configPath = path.resolve(opts.config);
    const outputPath = path.resolve(opts.output);

    if (!fs.existsSync(configPath)) {
      log.error({ configPath }, 'Config not found');
      process.exit(1);
    }

    const mc = loadMultiConfig(configPath);
    const dirs: Array<{ src: string; label: string }> = [];

    // Collect graph data and mirror dirs from all projects
    for (const [id, project] of mc.projects) {
      const graphMemory = project.graphMemory ?? path.join(project.projectDir, '.graph-memory');
      if (fs.existsSync(graphMemory)) {
        dirs.push({ src: graphMemory, label: `${id}/.graph-memory` });
      }
      for (const mirrorDir of ['.notes', '.tasks', '.skills']) {
        const dir = path.join(project.projectDir, mirrorDir);
        if (fs.existsSync(dir)) {
          dirs.push({ src: dir, label: `${id}/${mirrorDir}` });
        }
      }
    }

    // Collect workspace mirror dirs
    for (const [id, ws] of mc.workspaces) {
      const mirrorDir = ws.mirrorDir;
      if (mirrorDir) {
        for (const sub of ['.notes', '.tasks', '.skills']) {
          const dir = path.join(mirrorDir, sub);
          if (fs.existsSync(dir)) {
            dirs.push({ src: dir, label: `workspace-${id}/${sub}` });
          }
        }
        const graphMemory = ws.graphMemory ?? path.join(mirrorDir, '.graph-memory');
        if (fs.existsSync(graphMemory)) {
          dirs.push({ src: graphMemory, label: `workspace-${id}/.graph-memory` });
        }
      }
    }

    if (dirs.length === 0) {
      log.error('No data directories found to backup');
      process.exit(1);
    }

    log.info({ count: dirs.length }, 'Backing up directories');
    for (const d of dirs) {
      log.info({ label: d.label, src: d.src }, 'Including directory');
    }

    // Create tar.gz using Node.js child_process (tar is available on all supported platforms)
    const { execSync } = require('child_process');
    const tarArgs = dirs.map(d => `-C "${path.dirname(d.src)}" "${path.basename(d.src)}"`).join(' ');
    try {
      execSync(`tar czf "${outputPath}" ${tarArgs}`, { stdio: 'pipe' });
      const size = fs.statSync(outputPath).size;
      log.info({ outputPath, sizeMb: (size / 1024 / 1024).toFixed(1) }, 'Backup complete');
    } catch (err) {
      log.error({ err }, 'Failed to create archive');
      process.exit(1);
    }
  });

program.parse();
