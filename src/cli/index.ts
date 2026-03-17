#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { loadMultiConfig, type ProjectConfig, type ServerConfig } from '@/lib/multi-config';
import { ProjectManager } from '@/lib/project-manager';
import { loadModel, embed } from '@/lib/embedder';
import { loadGraph, saveGraph } from '@/graphs/docs';
import { loadCodeGraph, saveCodeGraph } from '@/graphs/code';
import { loadKnowledgeGraph, saveKnowledgeGraph } from '@/graphs/knowledge';
import { loadFileIndexGraph, saveFileIndexGraph } from '@/graphs/file-index';
import { loadTaskGraph, saveTaskGraph } from '@/graphs/task';
import { loadSkillGraph } from '@/graphs/skill';
import { startStdioServer, startMultiProjectHttpServer } from '@/api/index';
import type { EmbedFnMap } from '@/api/index';
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

function resolveModels(projectId: string, config: ProjectConfig): Record<string, string> {
  const fallback = config.embeddingModel;
  return {
    [`${projectId}:docs`]:      config.docsModel      ?? fallback,
    [`${projectId}:code`]:      config.codeModel      ?? fallback,
    [`${projectId}:knowledge`]: config.knowledgeModel ?? fallback,
    [`${projectId}:tasks`]:     config.taskModel      ?? fallback,
    [`${projectId}:files`]:     config.filesModel     ?? fallback,
    [`${projectId}:skills`]:    config.skillsModel    ?? fallback,
  };
}

async function loadAllModels(projectId: string, config: ProjectConfig, modelsDir: string): Promise<void> {
  const models = resolveModels(projectId, config);
  for (const [name, model] of Object.entries(models)) {
    await loadModel(model, modelsDir, config.embedMaxChars, name);
  }
}

function buildEmbedFns(projectId: string): EmbedFnMap {
  return {
    docs:      (q: string) => embed(q, '', `${projectId}:docs`),
    code:      (q: string) => embed(q, '', `${projectId}:code`),
    knowledge: (q: string) => embed(q, '', `${projectId}:knowledge`),
    tasks:     (q: string) => embed(q, '', `${projectId}:tasks`),
    files:     (q: string) => embed(q, '', `${projectId}:files`),
    skills:    (q: string) => embed(q, '', `${projectId}:skills`),
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

        const fresh = !!opts.reindex;
        if (fresh) process.stderr.write(`[index] Re-indexing project "${id}" from scratch...\n`);
        else process.stderr.write(`[index] Indexing project "${id}"...\n`);
        const projectDir = path.resolve(project.projectDir);
        await loadAllModels(id, project, mc.server.modelsDir);

        const models = resolveModels(id, project);
        const docGraph  = project.docsPattern ? loadGraph(project.graphMemory, fresh, models[`${id}:docs`]) : undefined;
        const codeGraph = project.codePattern ? loadCodeGraph(project.graphMemory, fresh, models[`${id}:code`]) : undefined;
        const knowledgeGraph = loadKnowledgeGraph(project.graphMemory, fresh, models[`${id}:knowledge`]);
        const fileIndexGraph = loadFileIndexGraph(project.graphMemory, fresh, models[`${id}:files`]);
        const taskGraph = loadTaskGraph(project.graphMemory, fresh, models[`${id}:tasks`]);
        const skillGraph = loadSkillGraph(project.graphMemory, fresh, models[`${id}:skills`]);

        const indexer = createProjectIndexer(docGraph, codeGraph, {
          projectDir,
          docsPattern:    project.docsPattern || undefined,
          codePattern:    project.codePattern || undefined,
          excludePattern: project.excludePattern || undefined,
          chunkDepth:     project.chunkDepth,
          tsconfig:       project.tsconfig,
          docsModelName:  `${id}:docs`,
          codeModelName:  `${id}:code`,
          filesModelName: `${id}:files`,
        }, knowledgeGraph, fileIndexGraph, taskGraph, skillGraph);

        indexer.scan();
        await indexer.drain();

        if (docGraph) {
          saveGraph(docGraph, project.graphMemory, models[`${id}:docs`]);
          process.stderr.write(`[index] "${id}" docs: ${docGraph.order} nodes, ${docGraph.size} edges\n`);
        }

        if (codeGraph) {
          saveCodeGraph(codeGraph, project.graphMemory, models[`${id}:code`]);
          process.stderr.write(`[index] "${id}" code: ${codeGraph.order} nodes, ${codeGraph.size} edges\n`);
        }

        saveKnowledgeGraph(knowledgeGraph, project.graphMemory, models[`${id}:knowledge`]);
        saveFileIndexGraph(fileIndexGraph, project.graphMemory, models[`${id}:files`]);
        saveTaskGraph(taskGraph, project.graphMemory, models[`${id}:tasks`]);
        process.stderr.write(`[index] "${id}" files: ${fileIndexGraph.order} nodes, ${fileIndexGraph.size} edges\n`);
      }

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
  .description('Index one project, keep watching for changes, and start MCP server on stdio')
  .option('--config <path>', 'Path to graph-memory.yaml', 'graph-memory.yaml')
  .option('--project <id>', 'Project ID (defaults to first project)')
  .option('--reindex', 'Discard persisted graphs and re-index from scratch')
  .action(async (opts: { config: string; project?: string; reindex?: boolean }) => {
    const { id, project, server } = resolveProject(opts.config, opts.project);
    const projectDir = path.resolve(project.projectDir);
    const fresh = !!opts.reindex;
    if (fresh) process.stderr.write(`[mcp] Re-indexing project "${id}" from scratch\n`);

    const models = resolveModels(id, project);

    // Load persisted graphs (or create fresh ones if reindexing / model changed) and start MCP server immediately
    const docGraph  = project.docsPattern ? loadGraph(project.graphMemory, fresh, models[`${id}:docs`]) : undefined;
    const codeGraph = project.codePattern ? loadCodeGraph(project.graphMemory, fresh, models[`${id}:code`]) : undefined;
    const knowledgeGraph = loadKnowledgeGraph(project.graphMemory, fresh, models[`${id}:knowledge`]);
    const fileIndexGraph = loadFileIndexGraph(project.graphMemory, fresh, models[`${id}:files`]);
    const taskGraph = loadTaskGraph(project.graphMemory, fresh, models[`${id}:tasks`]);
    const skillGraph = loadSkillGraph(project.graphMemory, fresh, models[`${id}:skills`]);

    const embedFns = buildEmbedFns(id);
    await startStdioServer(docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph, embedFns, project.projectDir, skillGraph);

    // Load models and start watcher in the background
    let watcher: ReturnType<ReturnType<typeof createProjectIndexer>['watch']> | undefined;
    let indexer: ReturnType<typeof createProjectIndexer> | undefined;

    async function startIndexing(): Promise<void> {
      await loadAllModels(id, project, server.modelsDir);

      indexer = createProjectIndexer(docGraph, codeGraph, {
        projectDir,
        docsPattern:    project.docsPattern || undefined,
        codePattern:    project.codePattern || undefined,
        excludePattern: project.excludePattern || undefined,
        chunkDepth:     project.chunkDepth,
        tsconfig:       project.tsconfig,
        docsModelName:  `${id}:docs`,
        codeModelName:  `${id}:code`,
        filesModelName: `${id}:files`,
      }, knowledgeGraph, fileIndexGraph, taskGraph, skillGraph);

      watcher = indexer.watch();
      await watcher.whenReady;
      await indexer.drain();

      if (docGraph) {
        saveGraph(docGraph, project.graphMemory, models[`${id}:docs`]);
        process.stderr.write(`[mcp] Docs indexed. ${docGraph.order} nodes, ${docGraph.size} edges.\n`);
      }

      if (codeGraph) {
        saveCodeGraph(codeGraph, project.graphMemory, models[`${id}:code`]);
        process.stderr.write(`[mcp] Code indexed. ${codeGraph.order} nodes, ${codeGraph.size} edges.\n`);
      }

      saveFileIndexGraph(fileIndexGraph, project.graphMemory, models[`${id}:files`]);
      process.stderr.write(`[mcp] File index done. ${fileIndexGraph.order} nodes, ${fileIndexGraph.size} edges.\n`);
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
      forceTimer.unref();
      try {
        if (watcher) await watcher.close();
        if (indexer) await indexer.drain();
        if (docGraph) saveGraph(docGraph, project.graphMemory, models[`${id}:docs`]);
        if (codeGraph) saveCodeGraph(codeGraph, project.graphMemory, models[`${id}:code`]);
        saveKnowledgeGraph(knowledgeGraph, project.graphMemory, models[`${id}:knowledge`]);
        saveFileIndexGraph(fileIndexGraph, project.graphMemory, models[`${id}:files`]);
        saveTaskGraph(taskGraph, project.graphMemory, models[`${id}:tasks`]);
      } catch { /* ignore */ }
      process.exit(0);
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

    // Add all projects (loads graphs from disk, or fresh if reindexing)
    for (const [id, config] of mc.projects) {
      await manager.addProject(id, config, reindex);
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

    // Load models and start indexing in background (per project, sequentially)
    async function initProjects(): Promise<void> {
      for (const id of manager.listProjects()) {
        try {
          await manager.loadModels(id);
          await manager.startIndexing(id);
        } catch (err: unknown) {
          process.stderr.write(`[serve] Failed to initialize project "${id}": ${err}\n`);
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
      forceTimer.unref();
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
      process.exit(0);
    }

    process.on('SIGINT',  () => { void shutdown(); });
    process.on('SIGTERM', () => { void shutdown(); });
  });

program.parse();
