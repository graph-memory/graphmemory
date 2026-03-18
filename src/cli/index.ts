#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { loadMultiConfig, GRAPH_NAMES, embeddingFingerprint, type ProjectConfig, type ServerConfig, type GraphName } from '@/lib/multi-config';
import { ProjectManager } from '@/lib/project-manager';
import { loadModel, embed, embedQuery } from '@/lib/embedder';
import { loadGraph, saveGraph } from '@/graphs/docs';
import { loadCodeGraph, saveCodeGraph } from '@/graphs/code';
import { loadKnowledgeGraph, saveKnowledgeGraph } from '@/graphs/knowledge';
import { loadFileIndexGraph, saveFileIndexGraph } from '@/graphs/file-index';
import { loadTaskGraph, saveTaskGraph } from '@/graphs/task';
import { loadSkillGraph } from '@/graphs/skill';
import { startStdioServer, startMultiProjectHttpServer } from '@/api/index';
import type { EmbedFnMap, McpSessionContext } from '@/api/index';
import { createProjectIndexer } from '@/cli/indexer';
import { startWatcher } from '@/lib/watcher';

const program = new Command();

program
  .name('mcp-graph-memory')
  .description('MCP server for semantic graph memory from markdown docs and source code')
  .version('1.0.0');

const parseIntArg = (v: string) => parseInt(v, 10);

// ---------------------------------------------------------------------------
// Helper: resolve a single project from YAML config + --project flag
// ---------------------------------------------------------------------------

function resolveProject(configPath: string, projectId?: string): { id: string; project: ProjectConfig; server: ServerConfig } {
  const mc = loadMultiConfig(configPath);
  const ids = Array.from(mc.projects.keys());

  if (ids.length === 0) {
    process.stderr.write('[cli] No projects defined in config\n');
    process.exit(1);
  }

  const id = projectId ?? ids[0];
  const project = mc.projects.get(id);
  if (!project) {
    process.stderr.write(`[cli] Project "${id}" not found in config. Available: ${ids.join(', ')}\n`);
    process.exit(1);
  }

  return { id, project, server: mc.server };
}

async function loadAllModels(projectId: string, config: ProjectConfig, modelsDir: string): Promise<void> {
  for (const gn of GRAPH_NAMES) {
    if (!config.graphConfigs[gn].enabled) continue;
    await loadModel(config.graphConfigs[gn].embedding, modelsDir, config.embedMaxChars, `${projectId}:${gn}`);
  }
}

function buildEmbedFns(projectId: string): EmbedFnMap {
  const pair = (gn: GraphName) => ({
    document: (q: string) => embed(q, '', `${projectId}:${gn}`),
    query:    (q: string) => embedQuery(q, `${projectId}:${gn}`),
  });
  return {
    docs: pair('docs'), code: pair('code'), knowledge: pair('knowledge'),
    tasks: pair('tasks'), files: pair('files'), skills: pair('skills'),
  };
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
      const mc = loadMultiConfig(opts.config);
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

      // Load models (workspaces first, then projects)
      for (const wsId of manager.listWorkspaces()) {
        await manager.loadWorkspaceModels(wsId);
      }
      for (const id of ids) {
        await manager.loadModels(id);
      }

      // Index all projects
      for (const id of ids) {
        process.stderr.write(`[index] Indexing project "${id}"...\n`);
        await manager.startIndexing(id);
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
// Command: mcp — single-project stdio mode
// ---------------------------------------------------------------------------

program
  .command('mcp')
  .description('Index one project (or workspace), keep watching for changes, and start MCP server on stdio')
  .option('--config <path>', 'Path to graph-memory.yaml', 'graph-memory.yaml')
  .option('--project <id>', 'Project ID (defaults to first project)')
  .option('--workspace <id>', 'Workspace ID (loads all workspace projects with shared graphs)')
  .option('--reindex', 'Discard persisted graphs and re-index from scratch')
  .action(async (opts: { config: string; project?: string; workspace?: string; reindex?: boolean }) => {
    // Workspace mode: load all projects in the workspace with shared graphs
    if (opts.workspace) {
      const mc = loadMultiConfig(opts.config);
      const wsConfig = mc.workspaces.get(opts.workspace);
      if (!wsConfig) {
        process.stderr.write(`[mcp] Workspace "${opts.workspace}" not found in config. Available: ${Array.from(mc.workspaces.keys()).join(', ')}\n`);
        process.exit(1);
      }

      const fresh = !!opts.reindex;
      if (fresh) process.stderr.write(`[mcp] Re-indexing workspace "${opts.workspace}" from scratch\n`);

      const manager = new ProjectManager(mc.server);
      await manager.addWorkspace(opts.workspace, wsConfig, fresh);

      for (const projId of wsConfig.projects) {
        const projConfig = mc.projects.get(projId);
        if (!projConfig) {
          process.stderr.write(`[mcp] Project "${projId}" referenced by workspace not found\n`);
          process.exit(1);
        }
        await manager.addProject(projId, projConfig, fresh, opts.workspace);
      }

      // Use specified project (or first) for stdio server
      const targetId = opts.project ?? wsConfig.projects[0];
      if (!wsConfig.projects.includes(targetId)) {
        process.stderr.write(`[mcp] Project "${targetId}" is not part of workspace "${opts.workspace}"\n`);
        process.exit(1);
      }
      const instance = manager.getProject(targetId)!;
      const sessionCtx: McpSessionContext = {
        projectId: targetId,
        workspaceId: opts.workspace,
        workspaceProjects: wsConfig.projects,
      };
      await startStdioServer(
        instance.docGraph, instance.codeGraph,
        instance.knowledgeGraph, instance.fileIndexGraph,
        instance.taskGraph, instance.embedFns,
        instance.config.projectDir, instance.skillGraph,
        sessionCtx,
      );

      // Load models and index in background
      (async () => {
        await manager.loadWorkspaceModels(opts.workspace!);
        for (const projId of wsConfig.projects) {
          await manager.loadModels(projId);
          await manager.startIndexing(projId);
        }
        await manager.startWorkspaceMirror(opts.workspace!);
        process.stderr.write(`[mcp] Workspace "${opts.workspace}" fully indexed\n`);
      })().catch((err: unknown) => {
        process.stderr.write(`[mcp] Workspace indexer error: ${err}\n`);
      });

      let shuttingDown = false;
      async function shutdown(): Promise<void> {
        if (shuttingDown) { process.stderr.write('[mcp] Force exit\n'); process.exit(1); }
        shuttingDown = true;
        process.stderr.write('[mcp] Shutting down...\n');
        const forceTimer = setTimeout(() => { process.stderr.write('[mcp] Shutdown timeout, force exit\n'); process.exit(1); }, 5000);
        try { await manager.shutdown(); } catch { /* ignore */ }
        clearTimeout(forceTimer);
        // Let event loop drain naturally — avoids ONNX global thread pool destructor crash on macOS
      }

      process.on('SIGINT',  () => { void shutdown(); });
      process.on('SIGTERM', () => { void shutdown(); });
      return;
    }

    const { id, project, server } = resolveProject(opts.config, opts.project);
    const projectDir = path.resolve(project.projectDir);
    const fresh = !!opts.reindex;
    if (fresh) process.stderr.write(`[mcp] Re-indexing project "${id}" from scratch\n`);

    const gc = project.graphConfigs;

    // Load persisted graphs (or create fresh ones if reindexing / model changed) and start MCP server immediately
    const docGraph  = gc.docs.enabled ? loadGraph(project.graphMemory, fresh, embeddingFingerprint(gc.docs.embedding)) : undefined;
    const codeGraph = gc.code.enabled ? loadCodeGraph(project.graphMemory, fresh, embeddingFingerprint(gc.code.embedding)) : undefined;
    const knowledgeGraph = gc.knowledge.enabled ? loadKnowledgeGraph(project.graphMemory, fresh, embeddingFingerprint(gc.knowledge.embedding)) : undefined;
    const fileIndexGraph = gc.files.enabled ? loadFileIndexGraph(project.graphMemory, fresh, embeddingFingerprint(gc.files.embedding)) : undefined;
    const taskGraph = gc.tasks.enabled ? loadTaskGraph(project.graphMemory, fresh, embeddingFingerprint(gc.tasks.embedding)) : undefined;
    const skillGraph = gc.skills.enabled ? loadSkillGraph(project.graphMemory, fresh, embeddingFingerprint(gc.skills.embedding)) : undefined;

    const embedFns = buildEmbedFns(id);
    const sessionCtx: McpSessionContext = { projectId: id };
    await startStdioServer(docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph, embedFns, project.projectDir, skillGraph, sessionCtx);

    // Load models and start watcher in the background
    let watcher: ReturnType<ReturnType<typeof createProjectIndexer>['watch']> | undefined;
    let indexer: ReturnType<typeof createProjectIndexer> | undefined;

    async function startIndexing(): Promise<void> {
      await loadAllModels(id, project, server.modelsDir);

      indexer = createProjectIndexer(docGraph, codeGraph, {
        projectDir,
        docsPattern:         gc.docs.enabled ? gc.docs.pattern : undefined,
        codePattern:         gc.code.enabled ? gc.code.pattern : undefined,
        docsExcludePattern:  gc.docs.excludePattern ?? project.excludePattern ?? undefined,
        codeExcludePattern:  gc.code.excludePattern ?? project.excludePattern ?? undefined,
        filesExcludePattern: gc.files.excludePattern ?? project.excludePattern ?? undefined,
        chunkDepth:          project.chunkDepth,
        tsconfig:            project.tsconfig,
        docsModelName:       `${id}:docs`,
        codeModelName:       `${id}:code`,
        filesModelName:      `${id}:files`,
      }, knowledgeGraph, fileIndexGraph, taskGraph, skillGraph);

      watcher = indexer.watch();
      await watcher.whenReady;
      await indexer.drain();

      if (docGraph) {
        saveGraph(docGraph, project.graphMemory, embeddingFingerprint(gc.docs.embedding));
        process.stderr.write(`[mcp] Docs indexed. ${docGraph.order} nodes, ${docGraph.size} edges.\n`);
      }

      if (codeGraph) {
        saveCodeGraph(codeGraph, project.graphMemory, embeddingFingerprint(gc.code.embedding));
        process.stderr.write(`[mcp] Code indexed. ${codeGraph.order} nodes, ${codeGraph.size} edges.\n`);
      }

      if (fileIndexGraph) {
        saveFileIndexGraph(fileIndexGraph, project.graphMemory, embeddingFingerprint(gc.files.embedding));
        process.stderr.write(`[mcp] File index done. ${fileIndexGraph.order} nodes, ${fileIndexGraph.size} edges.\n`);
      }
    }

    startIndexing().catch((err: unknown) => {
      process.stderr.write(`[mcp] Indexer error: ${err}\n`);
    });

    let shuttingDown = false;
    async function shutdown(): Promise<void> {
      if (shuttingDown) {
        process.stderr.write('[mcp] Force exit\n');
        process.exit(1);
      }
      shuttingDown = true;
      process.stderr.write('[mcp] Shutting down...\n');
      const forceTimer = setTimeout(() => {
        process.stderr.write('[mcp] Shutdown timeout, force exit\n');
        process.exit(1);
      }, 5000);
      try {
        if (watcher) await watcher.close();
        if (indexer) await indexer.drain();
        if (docGraph) saveGraph(docGraph, project.graphMemory, embeddingFingerprint(gc.docs.embedding));
        if (codeGraph) saveCodeGraph(codeGraph, project.graphMemory, embeddingFingerprint(gc.code.embedding));
        if (knowledgeGraph) saveKnowledgeGraph(knowledgeGraph, project.graphMemory, embeddingFingerprint(gc.knowledge.embedding));
        if (fileIndexGraph) saveFileIndexGraph(fileIndexGraph, project.graphMemory, embeddingFingerprint(gc.files.embedding));
        if (taskGraph) saveTaskGraph(taskGraph, project.graphMemory, embeddingFingerprint(gc.tasks.embedding));
      } catch { /* ignore */ }
      clearTimeout(forceTimer);
      // Let event loop drain naturally — avoids ONNX global thread pool destructor crash on macOS
    }

    process.on('SIGINT',  () => { void shutdown(); });
    process.on('SIGTERM', () => { void shutdown(); });
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
  .action(async (opts: { config: string; host?: string; port?: number; reindex?: boolean }) => {
    const mc = loadMultiConfig(opts.config);
    const host = opts.host ?? mc.server.host;
    const port = opts.port ?? mc.server.port;
    const sessionTimeoutMs = mc.server.sessionTimeout * 1000;

    const reindex = !!opts.reindex;
    if (reindex) process.stderr.write('[serve] Re-indexing all projects from scratch\n');

    const manager = new ProjectManager(mc.server);

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

    // Start HTTP server immediately (before models are loaded)
    const httpServer = await startMultiProjectHttpServer(host, port, sessionTimeoutMs, manager);

    // Track open connections for graceful shutdown
    const openSockets = new Set<import('net').Socket>();
    httpServer.on('connection', (socket) => {
      openSockets.add(socket);
      socket.on('close', () => openSockets.delete(socket));
    });

    // Start auto-save
    manager.startAutoSave();

    // Load models and start indexing in background (workspaces first, then projects)
    async function initProjects(): Promise<void> {
      // Load workspace models
      for (const wsId of manager.listWorkspaces()) {
        try {
          await manager.loadWorkspaceModels(wsId);
        } catch (err: unknown) {
          process.stderr.write(`[serve] Failed to load workspace "${wsId}" models: ${err}\n`);
        }
      }

      // Load project models and start indexing
      for (const id of manager.listProjects()) {
        try {
          await manager.loadModels(id);
          await manager.startIndexing(id);
        } catch (err: unknown) {
          process.stderr.write(`[serve] Failed to initialize project "${id}": ${err}\n`);
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
    }

    initProjects().catch((err: unknown) => {
      process.stderr.write(`[serve] Init error: ${err}\n`);
    });

    // Watch YAML config for hot-reload
    let reloading = false;
    const configWatcher = startWatcher(
      path.dirname(path.resolve(opts.config)),
      {
        onAdd:    () => {},
        onChange: async (f) => {
          if (path.resolve(f) !== path.resolve(opts.config)) return;
          if (reloading) return;
          reloading = true;
          try {
            process.stderr.write('[serve] Config changed, reloading...\n');
            const newMc = loadMultiConfig(opts.config);
            const currentIds = new Set(manager.listProjects());
            const newIds = new Set(newMc.projects.keys());

            // Remove projects no longer in config
            for (const id of currentIds) {
              if (!newIds.has(id)) {
                await manager.removeProject(id);
              }
            }

            // Add new projects
            for (const [id, config] of newMc.projects) {
              if (!currentIds.has(id)) {
                await manager.addProject(id, config);
                await manager.loadModels(id);
                await manager.startIndexing(id);
              }
            }

            // Re-add changed projects
            for (const [id, config] of newMc.projects) {
              if (currentIds.has(id)) {
                const existing = manager.getProject(id);
                if (existing && JSON.stringify(existing.config) !== JSON.stringify(config)) {
                  await manager.removeProject(id);
                  await manager.addProject(id, config);
                  await manager.loadModels(id);
                  await manager.startIndexing(id);
                }
              }
            }

            process.stderr.write('[serve] Config reload complete\n');
          } catch (err: unknown) {
            process.stderr.write(`[serve] Config reload error: ${err}\n`);
          } finally {
            reloading = false;
          }
        },
        onUnlink: () => {},
      },
      path.basename(opts.config),
    );

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
      }, 5000);
      try {
        httpServer.close();
        // Destroy all open connections (including WebSocket) so the server can close
        for (const socket of openSockets) {
          socket.destroy();
        }
        openSockets.clear();
        await configWatcher.close();
        await manager.shutdown();
      } catch { /* ignore */ }
      clearTimeout(forceTimer);
      // Let event loop drain naturally — avoids ONNX global thread pool destructor crash on macOS
    }

    process.on('SIGINT',  () => { void shutdown(); });
    process.on('SIGTERM', () => { void shutdown(); });
  });

program.parse();
