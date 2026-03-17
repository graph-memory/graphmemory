import { EventEmitter } from 'events';
import { loadModel, embed } from '@/lib/embedder';
import { loadGraph, saveGraph, type DocGraph, DocGraphManager } from '@/graphs/docs';
import { loadCodeGraph, saveCodeGraph, type CodeGraph, CodeGraphManager } from '@/graphs/code';
import { loadKnowledgeGraph, saveKnowledgeGraph, KnowledgeGraphManager } from '@/graphs/knowledge';
import { loadFileIndexGraph, saveFileIndexGraph, FileIndexGraphManager } from '@/graphs/file-index';
import { loadTaskGraph, saveTaskGraph, TaskGraphManager } from '@/graphs/task';
import { loadSkillGraph, saveSkillGraph, SkillGraphManager } from '@/graphs/skill';
import { createProjectIndexer, type ProjectIndexer } from '@/cli/indexer';
import { PromiseQueue } from '@/lib/promise-queue';
import type { ProjectConfig, ServerConfig, WorkspaceConfig } from '@/lib/multi-config';
import { formatAuthor } from '@/lib/multi-config';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import type { FileIndexGraph } from '@/graphs/file-index-types';
import type { TaskGraph } from '@/graphs/task-types';
import type { SkillGraph } from '@/graphs/skill-types';
import type { EmbedFnMap } from '@/api/index';
import type { WatcherHandle } from '@/lib/watcher';
import type { GraphManagerContext, ExternalGraphs } from '@/graphs/manager-types';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MirrorWriteTracker, scanMirrorDirs, startMirrorWatcher } from '@/lib/mirror-watcher';

// ---------------------------------------------------------------------------
// ProjectInstance
// ---------------------------------------------------------------------------

export interface ProjectInstance {
  id: string;
  config: ProjectConfig;
  docGraph?: DocGraph;
  codeGraph?: CodeGraph;
  knowledgeGraph: KnowledgeGraph;
  fileIndexGraph: FileIndexGraph;
  taskGraph: TaskGraph;
  skillGraph: SkillGraph;
  docManager?: DocGraphManager;
  codeManager?: CodeGraphManager;
  knowledgeManager: KnowledgeGraphManager;
  fileIndexManager: FileIndexGraphManager;
  taskManager: TaskGraphManager;
  skillManager: SkillGraphManager;
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

    const globalModel = config.embeddingModel;
    const knowledgeModel = config.knowledgeModel ?? globalModel;
    const taskModel = config.taskModel ?? globalModel;
    const skillsModel = config.skillsModel ?? globalModel;

    const knowledgeGraph = loadKnowledgeGraph(config.graphMemory, reindex, knowledgeModel);
    const taskGraph = loadTaskGraph(config.graphMemory, reindex, taskModel);
    const skillGraph = loadSkillGraph(config.graphMemory, reindex, skillsModel);

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

    const ctx: GraphManagerContext = {
      markDirty: () => { wsInstance.dirty = true; },
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

    const knowledgeEmbedFn = (q: string) => embed(q, '', `${id}:knowledge`);
    const taskEmbedFn = (q: string) => embed(q, '', `${id}:tasks`);
    const skillEmbedFn = (q: string) => embed(q, '', `${id}:skills`);

    wsInstance.knowledgeManager = new KnowledgeGraphManager(knowledgeGraph, knowledgeEmbedFn, ctx, ext);
    wsInstance.taskManager = new TaskGraphManager(taskGraph, taskEmbedFn, ctx, ext);
    wsInstance.skillManager = new SkillGraphManager(skillGraph, skillEmbedFn, ctx, ext);

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

    const globalModel = ws.config.embeddingModel;
    const models: Record<string, string> = {
      [`${id}:knowledge`]: ws.config.knowledgeModel ?? globalModel,
      [`${id}:tasks`]:     ws.config.taskModel      ?? globalModel,
      [`${id}:skills`]:    ws.config.skillsModel    ?? globalModel,
    };
    for (const [name, model] of Object.entries(models)) {
      await loadModel(model, this.serverConfig.modelsDir, 2000, name);
    }
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

    // Resolve per-graph model names for model-change detection
    const models = this.resolveModels(id, config);

    // Load per-project graphs (docs, code, file-index are always per-project)
    const docGraph  = config.docsPattern ? loadGraph(config.graphMemory, reindex, models[`${id}:docs`]) : undefined;
    const codeGraph = config.codePattern ? loadCodeGraph(config.graphMemory, reindex, models[`${id}:code`]) : undefined;
    const fileIndexGraph = loadFileIndexGraph(config.graphMemory, reindex, models[`${id}:files`]);

    // Knowledge/tasks/skills: shared from workspace or per-project
    const knowledgeGraph = ws ? ws.knowledgeGraph : loadKnowledgeGraph(config.graphMemory, reindex, models[`${id}:knowledge`]);
    const taskGraph = ws ? ws.taskGraph : loadTaskGraph(config.graphMemory, reindex, models[`${id}:tasks`]);
    const skillGraph = ws ? ws.skillGraph : loadSkillGraph(config.graphMemory, reindex, models[`${id}:skills`]);

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
    const ctx: GraphManagerContext = {
      markDirty: () => { instance.dirty = true; },
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
    instance.fileIndexManager = new FileIndexGraphManager(fileIndexGraph, embedFns.files, ext);

    if (ws) {
      // Use workspace-level shared managers
      instance.knowledgeManager = ws.knowledgeManager;
      instance.taskManager = ws.taskManager;
      instance.skillManager = ws.skillManager;
      instance.mirrorTracker = ws.mirrorTracker;
    } else {
      // Per-project managers
      instance.knowledgeManager = new KnowledgeGraphManager(knowledgeGraph, embedFns.knowledge, ctx, ext);
      instance.taskManager = new TaskGraphManager(taskGraph, embedFns.tasks, ctx, ext);
      instance.skillManager = new SkillGraphManager(skillGraph, embedFns.skills, ctx, ext);

      // Set up mirror write tracker for feedback loop prevention
      const mirrorTracker = new MirrorWriteTracker();
      instance.mirrorTracker = mirrorTracker;
      instance.knowledgeManager.setMirrorTracker(mirrorTracker);
      instance.taskManager.setMirrorTracker(mirrorTracker);
      instance.skillManager.setMirrorTracker(mirrorTracker);
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

    const models = this.resolveModels(id, instance.config);
    // Skip knowledge/tasks/skills models for workspace projects (loaded by workspace)
    const skip = instance.workspaceId
      ? new Set([`${id}:knowledge`, `${id}:tasks`, `${id}:skills`])
      : new Set<string>();

    for (const [name, model] of Object.entries(models)) {
      if (skip.has(name)) continue;
      await loadModel(model, this.serverConfig.modelsDir, instance.config.embedMaxChars, name);
    }
  }

  /**
   * Start indexing + watching for a project. Call after loadModels.
   */
  async startIndexing(id: string): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) throw new Error(`Project "${id}" not found`);

    const indexer = createProjectIndexer(instance.docGraph, instance.codeGraph, {
      projectDir:     instance.config.projectDir,
      docsPattern:    instance.config.docsPattern || undefined,
      codePattern:    instance.config.codePattern || undefined,
      excludePattern: instance.config.excludePattern || undefined,
      chunkDepth:     instance.config.chunkDepth,
      tsconfig:       instance.config.tsconfig,
      docsModelName:  `${id}:docs`,
      codeModelName:  `${id}:code`,
      filesModelName: `${id}:files`,
    }, instance.knowledgeGraph, instance.fileIndexGraph, instance.taskGraph, instance.skillGraph);

    instance.indexer = indexer;
    instance.watcher = indexer.watch();
    await instance.watcher.whenReady;
    await indexer.drain();

    // Save after initial scan
    this.saveProject(instance);
    instance.dirty = false;

    // Scan and watch .notes/ and .tasks/ for reverse import (skip for workspace projects — handled by workspace)
    if (instance.mirrorTracker && !instance.workspaceId) {
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
          this.saveProject(instance);
          instance.dirty = false;
        }
      }
      for (const ws of this.workspaces.values()) {
        if (ws.dirty) {
          this.saveWorkspace(ws);
          ws.dirty = false;
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
      if (instance.mirrorWatcher) await instance.mirrorWatcher.close();
      if (instance.watcher) await instance.watcher.close();
      if (instance.indexer) await instance.indexer.drain();
      if (instance.mcpClientCleanup) await instance.mcpClientCleanup();
      this.saveProject(instance);
    }
    for (const ws of this.workspaces.values()) {
      if (ws.mirrorWatcher) await ws.mirrorWatcher.close();
      this.saveWorkspace(ws);
    }
    this.projects.clear();
    this.workspaces.clear();
    process.stderr.write('[project-manager] Shutdown complete\n');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private saveProject(instance: ProjectInstance): void {
    const models = this.resolveModels(instance.id, instance.config);
    if (instance.docGraph) saveGraph(instance.docGraph, instance.config.graphMemory, models[`${instance.id}:docs`]);
    if (instance.codeGraph) saveCodeGraph(instance.codeGraph, instance.config.graphMemory, models[`${instance.id}:code`]);
    saveFileIndexGraph(instance.fileIndexGraph, instance.config.graphMemory, models[`${instance.id}:files`]);
    // Skip knowledge/tasks/skills for workspace projects (saved by workspace)
    if (!instance.workspaceId) {
      saveKnowledgeGraph(instance.knowledgeGraph, instance.config.graphMemory, models[`${instance.id}:knowledge`]);
      saveTaskGraph(instance.taskGraph, instance.config.graphMemory, models[`${instance.id}:tasks`]);
      saveSkillGraph(instance.skillGraph, instance.config.graphMemory, models[`${instance.id}:skills`]);
    }
  }

  private saveWorkspace(ws: WorkspaceInstance): void {
    const model = ws.config.embeddingModel;
    saveKnowledgeGraph(ws.knowledgeGraph, ws.config.graphMemory, ws.config.knowledgeModel ?? model);
    saveTaskGraph(ws.taskGraph, ws.config.graphMemory, ws.config.taskModel ?? model);
    saveSkillGraph(ws.skillGraph, ws.config.graphMemory, ws.config.skillsModel ?? model);
  }

  private resolveModels(projectId: string, config: ProjectConfig): Record<string, string> {
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

  private buildEmbedFns(projectId: string): EmbedFnMap {
    return {
      docs:      (q: string) => embed(q, '', `${projectId}:docs`),
      code:      (q: string) => embed(q, '', `${projectId}:code`),
      knowledge: (q: string) => embed(q, '', `${projectId}:knowledge`),
      tasks:     (q: string) => embed(q, '', `${projectId}:tasks`),
      files:     (q: string) => embed(q, '', `${projectId}:files`),
      skills:    (q: string) => embed(q, '', `${projectId}:skills`),
    };
  }
}
