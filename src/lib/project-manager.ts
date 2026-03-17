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
import type { ProjectConfig, ServerConfig } from '@/lib/multi-config';
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
}

// ---------------------------------------------------------------------------
// ProjectManager
// ---------------------------------------------------------------------------

export class ProjectManager extends EventEmitter {
  private projects = new Map<string, ProjectInstance>();
  private autoSaveInterval: ReturnType<typeof setInterval> | undefined;

  constructor(private serverConfig: ServerConfig) {
    super();
  }

  /**
   * Add a project: load graphs, load models, create indexer, start watcher.
   */
  async addProject(id: string, config: ProjectConfig, reindex = false): Promise<void> {
    if (this.projects.has(id)) {
      throw new Error(`Project "${id}" already exists`);
    }

    // Resolve per-graph model names for model-change detection
    const models = this.resolveModels(id, config);

    // Load persisted graphs (or create fresh ones if reindexing / model changed)
    const docGraph  = config.docsPattern ? loadGraph(config.graphMemory, reindex, models[`${id}:docs`]) : undefined;
    const codeGraph = config.codePattern ? loadCodeGraph(config.graphMemory, reindex, models[`${id}:code`]) : undefined;
    const knowledgeGraph = loadKnowledgeGraph(config.graphMemory, reindex, models[`${id}:knowledge`]);
    const fileIndexGraph = loadFileIndexGraph(config.graphMemory, reindex, models[`${id}:files`]);
    const taskGraph = loadTaskGraph(config.graphMemory, reindex, models[`${id}:tasks`]);
    const skillGraph = loadSkillGraph(config.graphMemory, reindex, models[`${id}:skills`]);

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
      mutationQueue: new PromiseQueue(),
      dirty: false,
    } as ProjectInstance;

    // Build graph manager context
    const ctx: GraphManagerContext = {
      markDirty: () => { instance.dirty = true; },
      emit: (event: string, data: unknown) => { this.emit(event, data); },
      projectId: id,
      projectDir: config.projectDir,
    };

    const ext: ExternalGraphs = { docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph, skillGraph };

    instance.docManager = docGraph ? new DocGraphManager(docGraph, embedFns.docs, ext) : undefined;
    instance.codeManager = codeGraph ? new CodeGraphManager(codeGraph, embedFns.code, ext) : undefined;
    instance.knowledgeManager = new KnowledgeGraphManager(knowledgeGraph, embedFns.knowledge, ctx, ext);
    instance.fileIndexManager = new FileIndexGraphManager(fileIndexGraph, embedFns.files, ext);
    instance.taskManager = new TaskGraphManager(taskGraph, embedFns.tasks, ctx, ext);
    instance.skillManager = new SkillGraphManager(skillGraph, embedFns.skills, ctx, ext);

    // Set up mirror write tracker for feedback loop prevention
    const mirrorTracker = new MirrorWriteTracker();
    instance.mirrorTracker = mirrorTracker;
    instance.knowledgeManager.setMirrorTracker(mirrorTracker);
    instance.taskManager.setMirrorTracker(mirrorTracker);
    instance.skillManager.setMirrorTracker(mirrorTracker);

    this.projects.set(id, instance);
    process.stderr.write(`[project-manager] Added project "${id}" (${config.projectDir})\n`);
  }

  /**
   * Load embedding models for a project. Call after addProject.
   * Separated because model loading is slow and server can start before it's done.
   */
  async loadModels(id: string): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) throw new Error(`Project "${id}" not found`);

    const models = this.resolveModels(id, instance.config);
    for (const [name, model] of Object.entries(models)) {
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

    // Scan and watch .notes/ and .tasks/ for reverse import
    if (instance.mirrorTracker) {
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
    this.projects.clear();
    process.stderr.write('[project-manager] Shutdown complete\n');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private saveProject(instance: ProjectInstance): void {
    const models = this.resolveModels(instance.id, instance.config);
    if (instance.docGraph) saveGraph(instance.docGraph, instance.config.graphMemory, models[`${instance.id}:docs`]);
    if (instance.codeGraph) saveCodeGraph(instance.codeGraph, instance.config.graphMemory, models[`${instance.id}:code`]);
    saveKnowledgeGraph(instance.knowledgeGraph, instance.config.graphMemory, models[`${instance.id}:knowledge`]);
    saveFileIndexGraph(instance.fileIndexGraph, instance.config.graphMemory, models[`${instance.id}:files`]);
    saveTaskGraph(instance.taskGraph, instance.config.graphMemory, models[`${instance.id}:tasks`]);
    saveSkillGraph(instance.skillGraph, instance.config.graphMemory, models[`${instance.id}:skills`]);
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
