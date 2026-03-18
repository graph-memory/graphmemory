import { EventEmitter } from 'events';
import { loadModel, embed, embedQuery } from '@/lib/embedder';
import { loadGraph, saveGraph, type DocGraph, DocGraphManager } from '@/graphs/docs';
import { loadCodeGraph, saveCodeGraph, type CodeGraph, CodeGraphManager } from '@/graphs/code';
import { loadKnowledgeGraph, saveKnowledgeGraph, KnowledgeGraphManager } from '@/graphs/knowledge';
import { loadFileIndexGraph, saveFileIndexGraph, FileIndexGraphManager } from '@/graphs/file-index';
import { loadTaskGraph, saveTaskGraph, TaskGraphManager } from '@/graphs/task';
import { loadSkillGraph, saveSkillGraph, SkillGraphManager } from '@/graphs/skill';
import { createProjectIndexer, type ProjectIndexer } from '@/cli/indexer';
import { PromiseQueue } from '@/lib/promise-queue';
import type { ProjectConfig, ServerConfig, WorkspaceConfig, GraphName } from '@/lib/multi-config';
import { GRAPH_NAMES, formatAuthor, embeddingFingerprint } from '@/lib/multi-config';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import type { FileIndexGraph } from '@/graphs/file-index-types';
import type { TaskGraph } from '@/graphs/task-types';
import type { SkillGraph } from '@/graphs/skill-types';
import type { EmbedFnMap } from '@/api/index';
import type { WatcherHandle } from '@/lib/watcher';
import type { GraphManagerContext, ExternalGraphs } from '@/graphs/manager-types';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MirrorWriteTracker, scanMirrorDirs, startMirrorWatcher } from '@/lib/mirror-watcher';
import { ensureAuthorInTeam } from '@/lib/team';
import path from 'path';

// ---------------------------------------------------------------------------
// ProjectInstance
// ---------------------------------------------------------------------------

export interface ProjectInstance {
  id: string;
  config: ProjectConfig;
  docGraph?: DocGraph;
  codeGraph?: CodeGraph;
  knowledgeGraph?: KnowledgeGraph;
  fileIndexGraph?: FileIndexGraph;
  taskGraph?: TaskGraph;
  skillGraph?: SkillGraph;
  docManager?: DocGraphManager;
  codeManager?: CodeGraphManager;
  knowledgeManager?: KnowledgeGraphManager;
  fileIndexManager?: FileIndexGraphManager;
  taskManager?: TaskGraphManager;
  skillManager?: SkillGraphManager;
  indexer?: ProjectIndexer;
  watcher?: WatcherHandle;
  embedFns: EmbedFnMap;
  mutationQueue: PromiseQueue;
  dirty: boolean;
  mirrorTracker?: MirrorWriteTracker;
  mirrorWatcher?: WatcherHandle;
  /** Lazy MCP client for tools explorer (created on first request) */
  mcpClient?: Client;
  mcpClientCleanup?: () => Promise<void>;
  /** If set, this project belongs to a workspace (shared knowledge/tasks/skills). */
  workspaceId?: string;
}

// ---------------------------------------------------------------------------
// WorkspaceInstance
// ---------------------------------------------------------------------------

export interface WorkspaceInstance {
  id: string;
  config: WorkspaceConfig;
  knowledgeGraph: KnowledgeGraph;
  taskGraph: TaskGraph;
  skillGraph: SkillGraph;
  knowledgeManager: KnowledgeGraphManager;
  taskManager: TaskGraphManager;
  skillManager: SkillGraphManager;
  mirrorTracker: MirrorWriteTracker;
  mirrorWatcher?: WatcherHandle;
  mutationQueue: PromiseQueue;
  dirty: boolean;
}

// ---------------------------------------------------------------------------
// ProjectManager
// ---------------------------------------------------------------------------

export class ProjectManager extends EventEmitter {
  private projects = new Map<string, ProjectInstance>();
  private workspaces = new Map<string, WorkspaceInstance>();
  private autoSaveInterval: ReturnType<typeof setInterval> | undefined;

  constructor(private serverConfig: ServerConfig) {
    super();
  }

  // ---------------------------------------------------------------------------
  // Workspaces
  // ---------------------------------------------------------------------------

  /**
   * Add a workspace: load shared knowledge/task/skill graphs.
   * Must be called before addProject for projects that belong to this workspace.
   */
  async addWorkspace(id: string, config: WorkspaceConfig, reindex = false): Promise<void> {
    if (this.workspaces.has(id)) {
      throw new Error(`Workspace "${id}" already exists`);
    }

    const gc = config.graphConfigs;

    const knowledgeGraph = loadKnowledgeGraph(config.graphMemory, reindex, embeddingFingerprint(gc.knowledge.embedding));
    const taskGraph = loadTaskGraph(config.graphMemory, reindex, embeddingFingerprint(gc.tasks.embedding));
    const skillGraph = loadSkillGraph(config.graphMemory, reindex, embeddingFingerprint(gc.skills.embedding));

    const mutationQueue = new PromiseQueue();
    const mirrorTracker = new MirrorWriteTracker();

    const wsInstance: WorkspaceInstance = {
      id,
      config,
      knowledgeGraph,
      taskGraph,
      skillGraph,
      mutationQueue,
      mirrorTracker,
      dirty: false,
    } as WorkspaceInstance;

    let _authorEnsured = false;
    const ctx: GraphManagerContext = {
      markDirty: () => {
        wsInstance.dirty = true;
        if (!_authorEnsured) {
          _authorEnsured = true;
          ensureAuthorInTeam(path.join(config.mirrorDir, '.team'), config.author);
        }
      },
      emit: (event: string, data: unknown) => { this.emit(event, data); },
      projectId: id,
      mirrorDir: config.mirrorDir,
      author: formatAuthor(config.author),
    };

    // ExternalGraphs for workspace — projectGraphs will be populated as projects are added
    const ext: ExternalGraphs = {
      knowledgeGraph,
      taskGraph,
      skillGraph,
      projectGraphs: new Map(),
    };

    const knowledgeEmbedFns = {
      document: (q: string) => embed(q, '', `${id}:knowledge`),
      query:    (q: string) => embedQuery(q, `${id}:knowledge`),
    };
    const taskEmbedFns = {
      document: (q: string) => embed(q, '', `${id}:tasks`),
      query:    (q: string) => embedQuery(q, `${id}:tasks`),
    };
    const skillEmbedFns = {
      document: (q: string) => embed(q, '', `${id}:skills`),
      query:    (q: string) => embedQuery(q, `${id}:skills`),
    };

    wsInstance.knowledgeManager = new KnowledgeGraphManager(knowledgeGraph, knowledgeEmbedFns, ctx, ext);
    wsInstance.taskManager = new TaskGraphManager(taskGraph, taskEmbedFns, ctx, ext);
    wsInstance.skillManager = new SkillGraphManager(skillGraph, skillEmbedFns, ctx, ext);

    wsInstance.knowledgeManager.setMirrorTracker(mirrorTracker);
    wsInstance.taskManager.setMirrorTracker(mirrorTracker);
    wsInstance.skillManager.setMirrorTracker(mirrorTracker);

    this.workspaces.set(id, wsInstance);
    process.stderr.write(`[project-manager] Added workspace "${id}"\n`);
  }

  /**
   * Load embedding models for a workspace. Call after addWorkspace.
   */
  async loadWorkspaceModels(id: string): Promise<void> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace "${id}" not found`);

    const gc = ws.config.graphConfigs;
    await loadModel(gc.knowledge.embedding, this.serverConfig.modelsDir, 2000, `${id}:knowledge`);
    await loadModel(gc.tasks.embedding, this.serverConfig.modelsDir, 2000, `${id}:tasks`);
    await loadModel(gc.skills.embedding, this.serverConfig.modelsDir, 2000, `${id}:skills`);
  }

  /**
   * Start mirror watcher for a workspace. Call after all workspace projects are indexed.
   */
  async startWorkspaceMirror(id: string): Promise<void> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace "${id}" not found`);

    const mirrorConfig = {
      projectDir: ws.config.mirrorDir,
      knowledgeManager: ws.knowledgeManager,
      taskManager: ws.taskManager,
      skillManager: ws.skillManager,
      mutationQueue: ws.mutationQueue,
      tracker: ws.mirrorTracker,
    };
    await scanMirrorDirs(mirrorConfig);
    ws.mirrorWatcher = startMirrorWatcher(mirrorConfig);
  }

  getWorkspace(id: string): WorkspaceInstance | undefined {
    return this.workspaces.get(id);
  }

  listWorkspaces(): string[] {
    return Array.from(this.workspaces.keys());
  }

  /** Find which workspace a project belongs to. */
  getProjectWorkspace(projectId: string): WorkspaceInstance | undefined {
    const project = this.projects.get(projectId);
    if (!project?.workspaceId) return undefined;
    return this.workspaces.get(project.workspaceId);
  }

  /**
   * Add a project: load graphs, load models, create indexer, start watcher.
   */
  async addProject(id: string, config: ProjectConfig, reindex = false, workspaceId?: string): Promise<void> {
    if (this.projects.has(id)) {
      throw new Error(`Project "${id}" already exists`);
    }

    const ws = workspaceId ? this.workspaces.get(workspaceId) : undefined;
    if (workspaceId && !ws) throw new Error(`Workspace "${workspaceId}" not found`);

    const gc = config.graphConfigs;

    // Load per-project graphs (gated by enabled flag)
    const docGraph  = gc.docs.enabled ? loadGraph(config.graphMemory, reindex, embeddingFingerprint(gc.docs.embedding)) : undefined;
    const codeGraph = gc.code.enabled ? loadCodeGraph(config.graphMemory, reindex, embeddingFingerprint(gc.code.embedding)) : undefined;
    const fileIndexGraph = gc.files.enabled ? loadFileIndexGraph(config.graphMemory, reindex, embeddingFingerprint(gc.files.embedding)) : undefined;

    // Knowledge/tasks/skills: shared from workspace or per-project (gated by enabled)
    const knowledgeGraph = ws ? ws.knowledgeGraph
      : gc.knowledge.enabled ? loadKnowledgeGraph(config.graphMemory, reindex, embeddingFingerprint(gc.knowledge.embedding)) : undefined;
    const taskGraph = ws ? ws.taskGraph
      : gc.tasks.enabled ? loadTaskGraph(config.graphMemory, reindex, embeddingFingerprint(gc.tasks.embedding)) : undefined;
    const skillGraph = ws ? ws.skillGraph
      : gc.skills.enabled ? loadSkillGraph(config.graphMemory, reindex, embeddingFingerprint(gc.skills.embedding)) : undefined;

    // Build embed functions (project-scoped model names)
    const embedFns = this.buildEmbedFns(id);

    const instance: ProjectInstance = {
      id,
      config,
      docGraph,
      codeGraph,
      knowledgeGraph,
      fileIndexGraph,
      taskGraph,
      skillGraph,
      embedFns,
      mutationQueue: ws ? ws.mutationQueue : new PromiseQueue(),
      dirty: false,
      workspaceId,
    } as ProjectInstance;

    // Build graph manager context
    let _authorEnsured = false;
    const ctx: GraphManagerContext = {
      markDirty: () => {
        instance.dirty = true;
        if (!_authorEnsured) {
          _authorEnsured = true;
          ensureAuthorInTeam(path.join(config.projectDir, '.team'), config.author);
        }
      },
      emit: (event: string, data: unknown) => { this.emit(event, data); },
      projectId: id,
      projectDir: config.projectDir,
      author: formatAuthor(config.author),
    };

    const ext: ExternalGraphs = { docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph, skillGraph };

    // In workspace mode, register this project's graphs for cross-graph resolution
    if (ws) {
      const wsExt = ws.knowledgeManager.externalGraphs;
      if (wsExt?.projectGraphs) {
        wsExt.projectGraphs.set(id, { docGraph, codeGraph, fileIndexGraph });
      }
    }

    instance.docManager = docGraph ? new DocGraphManager(docGraph, embedFns.docs, ext) : undefined;
    instance.codeManager = codeGraph ? new CodeGraphManager(codeGraph, embedFns.code, ext) : undefined;
    instance.fileIndexManager = fileIndexGraph ? new FileIndexGraphManager(fileIndexGraph, embedFns.files, ext) : undefined;

    if (ws) {
      // Use workspace-level shared managers
      instance.knowledgeManager = ws.knowledgeManager;
      instance.taskManager = ws.taskManager;
      instance.skillManager = ws.skillManager;
      instance.mirrorTracker = ws.mirrorTracker;
    } else {
      // Per-project managers (only if enabled)
      if (knowledgeGraph) {
        instance.knowledgeManager = new KnowledgeGraphManager(knowledgeGraph, embedFns.knowledge, ctx, ext);
      }
      if (taskGraph) {
        instance.taskManager = new TaskGraphManager(taskGraph, embedFns.tasks, ctx, ext);
      }
      if (skillGraph) {
        instance.skillManager = new SkillGraphManager(skillGraph, embedFns.skills, ctx, ext);
      }

      // Set up mirror write tracker for feedback loop prevention
      if (instance.knowledgeManager || instance.taskManager || instance.skillManager) {
        const mirrorTracker = new MirrorWriteTracker();
        instance.mirrorTracker = mirrorTracker;
        instance.knowledgeManager?.setMirrorTracker(mirrorTracker);
        instance.taskManager?.setMirrorTracker(mirrorTracker);
        instance.skillManager?.setMirrorTracker(mirrorTracker);
      }
    }

    this.projects.set(id, instance);
    process.stderr.write(`[project-manager] Added project "${id}" (${config.projectDir})${ws ? ` [workspace: ${workspaceId}]` : ''}\n`);
  }

  /**
   * Load embedding models for a project. Call after addProject.
   * Separated because model loading is slow and server can start before it's done.
   */
  async loadModels(id: string): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) throw new Error(`Project "${id}" not found`);

    const gc = instance.config.graphConfigs;
    // Skip knowledge/tasks/skills models for workspace projects (loaded by workspace)
    const skipGraphs = instance.workspaceId
      ? new Set<GraphName>(['knowledge', 'tasks', 'skills'])
      : new Set<GraphName>();

    for (const gn of GRAPH_NAMES) {
      if (skipGraphs.has(gn)) continue;
      if (!gc[gn].enabled) continue;
      await loadModel(gc[gn].embedding, this.serverConfig.modelsDir, instance.config.embedMaxChars, `${id}:${gn}`);
    }
  }

  /**
   * Start indexing + watching for a project. Call after loadModels.
   */
  async startIndexing(id: string): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) throw new Error(`Project "${id}" not found`);

    const gc = instance.config.graphConfigs;
    const indexer = createProjectIndexer(instance.docGraph, instance.codeGraph, {
      projectDir:          instance.config.projectDir,
      docsPattern:         gc.docs.enabled ? gc.docs.pattern : undefined,
      codePattern:         gc.code.enabled ? gc.code.pattern : undefined,
      docsExcludePattern:  gc.docs.excludePattern ?? instance.config.excludePattern ?? undefined,
      codeExcludePattern:  gc.code.excludePattern ?? instance.config.excludePattern ?? undefined,
      filesExcludePattern: gc.files.excludePattern ?? instance.config.excludePattern ?? undefined,
      chunkDepth:          instance.config.chunkDepth,
      docsModelName:       `${id}:docs`,
      codeModelName:       `${id}:code`,
      filesModelName:      `${id}:files`,
    }, instance.knowledgeGraph, instance.fileIndexGraph, instance.taskGraph, instance.skillGraph);

    instance.indexer = indexer;
    instance.watcher = indexer.watch();
    await instance.watcher.whenReady;
    await indexer.drain();

    // Save after initial scan
    this.saveProject(instance);
    instance.dirty = false;

    // Scan and watch .notes/ and .tasks/ for reverse import (skip for workspace projects — handled by workspace)
    if (instance.mirrorTracker && !instance.workspaceId && instance.knowledgeManager && instance.taskManager) {
      const mirrorConfig = {
        projectDir: instance.config.projectDir,
        knowledgeManager: instance.knowledgeManager,
        taskManager: instance.taskManager,
        skillManager: instance.skillManager,
        mutationQueue: instance.mutationQueue,
        tracker: instance.mirrorTracker,
      };
      await scanMirrorDirs(mirrorConfig);
      instance.mirrorWatcher = startMirrorWatcher(mirrorConfig);
    }

    this.emit('project:indexed', { projectId: id });
    process.stderr.write(`[project-manager] Project "${id}" indexed\n`);
  }

  /**
   * Remove a project: drain indexer, save graphs, close watcher.
   */
  async removeProject(id: string): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) return;

    if (instance.mirrorWatcher) await instance.mirrorWatcher.close();
    if (instance.watcher) await instance.watcher.close();
    if (instance.indexer) await instance.indexer.drain();
    if (instance.mcpClientCleanup) await instance.mcpClientCleanup();
    this.saveProject(instance);

    // Clean up workspace shared graphs: remove projectGraphs reference and orphaned proxies
    if (instance.workspaceId) {
      const ws = this.workspaces.get(instance.workspaceId);
      if (ws) {
        ws.knowledgeManager.externalGraphs?.projectGraphs?.delete(id);
        // Remove orphaned proxy nodes that reference this project
        for (const graph of [ws.knowledgeManager.graph, ws.taskManager?.graph, ws.skillManager?.graph]) {
          if (!graph) continue;
          const toRemove: string[] = [];
          graph.forEachNode((nodeId: string, attrs: any) => {
            if (attrs.proxyFor?.projectId === id) toRemove.push(nodeId);
          });
          for (const nodeId of toRemove) graph.dropNode(nodeId);
        }
      }
    }

    this.projects.delete(id);
    process.stderr.write(`[project-manager] Removed project "${id}"\n`);
  }

  getProject(id: string): ProjectInstance | undefined {
    return this.projects.get(id);
  }

  listProjects(): string[] {
    return Array.from(this.projects.keys());
  }

  markDirty(id: string): void {
    const instance = this.projects.get(id);
    if (instance) instance.dirty = true;
  }

  /**
   * Start auto-save interval (every intervalMs, save dirty projects).
   */
  startAutoSave(intervalMs = 30_000): void {
    this.autoSaveInterval = setInterval(() => {
      for (const instance of this.projects.values()) {
        if (instance.dirty) {
          try {
            this.saveProject(instance);
            instance.dirty = false;
          } catch (err) {
            process.stderr.write(`[project-manager] Auto-save error for "${instance.id}": ${err}\n`);
          }
        }
      }
      for (const ws of this.workspaces.values()) {
        if (ws.dirty) {
          try {
            this.saveWorkspace(ws);
            ws.dirty = false;
          } catch (err) {
            process.stderr.write(`[project-manager] Auto-save error for workspace "${ws.id}": ${err}\n`);
          }
        }
      }
    }, intervalMs);
    this.autoSaveInterval.unref();
  }

  /**
   * Save all projects and shut down.
   */
  async shutdown(): Promise<void> {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);

    for (const instance of this.projects.values()) {
      try {
        if (instance.mirrorWatcher) await instance.mirrorWatcher.close();
        if (instance.watcher) await instance.watcher.close();
        if (instance.indexer) await instance.indexer.drain();
        if (instance.mcpClientCleanup) await instance.mcpClientCleanup();
        this.saveProject(instance);
      } catch (err) {
        process.stderr.write(`[project-manager] Shutdown error for "${instance.id}": ${err}\n`);
      }
    }
    for (const ws of this.workspaces.values()) {
      try {
        if (ws.mirrorWatcher) await ws.mirrorWatcher.close();
        this.saveWorkspace(ws);
      } catch (err) {
        process.stderr.write(`[project-manager] Shutdown error for workspace "${ws.id}": ${err}\n`);
      }
    }
    this.projects.clear();
    this.workspaces.clear();
    process.stderr.write('[project-manager] Shutdown complete\n');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private saveProject(instance: ProjectInstance): void {
    const gc = instance.config.graphConfigs;
    if (instance.docGraph) saveGraph(instance.docGraph, instance.config.graphMemory, embeddingFingerprint(gc.docs.embedding));
    if (instance.codeGraph) saveCodeGraph(instance.codeGraph, instance.config.graphMemory, embeddingFingerprint(gc.code.embedding));
    if (instance.fileIndexGraph) saveFileIndexGraph(instance.fileIndexGraph, instance.config.graphMemory, embeddingFingerprint(gc.files.embedding));
    // Skip knowledge/tasks/skills for workspace projects (saved by workspace)
    if (!instance.workspaceId) {
      if (instance.knowledgeGraph) saveKnowledgeGraph(instance.knowledgeGraph, instance.config.graphMemory, embeddingFingerprint(gc.knowledge.embedding));
      if (instance.taskGraph) saveTaskGraph(instance.taskGraph, instance.config.graphMemory, embeddingFingerprint(gc.tasks.embedding));
      if (instance.skillGraph) saveSkillGraph(instance.skillGraph, instance.config.graphMemory, embeddingFingerprint(gc.skills.embedding));
    }
  }

  private saveWorkspace(ws: WorkspaceInstance): void {
    const gc = ws.config.graphConfigs;
    saveKnowledgeGraph(ws.knowledgeGraph, ws.config.graphMemory, embeddingFingerprint(gc.knowledge.embedding));
    saveTaskGraph(ws.taskGraph, ws.config.graphMemory, embeddingFingerprint(gc.tasks.embedding));
    saveSkillGraph(ws.skillGraph, ws.config.graphMemory, embeddingFingerprint(gc.skills.embedding));
  }

  private buildEmbedFns(projectId: string): EmbedFnMap {
    const pair = (gn: GraphName) => ({
      document: (q: string) => embed(q, '', `${projectId}:${gn}`),
      query:    (q: string) => embedQuery(q, `${projectId}:${gn}`),
    });
    return {
      docs: pair('docs'), code: pair('code'), knowledge: pair('knowledge'),
      tasks: pair('tasks'), files: pair('files'), skills: pair('skills'),
    };
  }
}
