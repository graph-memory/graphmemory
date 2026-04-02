import { EventEmitter } from 'events';
import { loadModel, embed, embedQuery, type EmbeddingCacheFactory } from '@/lib/embedder';
import { loadKnowledgeGraph, saveKnowledgeGraph, KnowledgeGraphManager } from '@/graphs/knowledge';
import { loadTaskGraph, saveTaskGraph, TaskGraphManager } from '@/graphs/task';
import { loadSkillGraph, saveSkillGraph, SkillGraphManager } from '@/graphs/skill';
import { createProjectIndexer, type ProjectIndexer, type IndexPhase } from '@/cli/indexer';
import { clearPathMappingsCache } from '@/lib/parsers/code';
import { clearWikiIndexCache } from '@/lib/parsers/docs';
import { PromiseQueue } from '@/lib/promise-queue';
import type { ProjectConfig, ServerConfig, WorkspaceConfig, GraphName } from '@/lib/multi-config';
import { GRAPH_NAMES, formatAuthor, embeddingFingerprint } from '@/lib/multi-config';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import type { TaskGraph } from '@/graphs/task-types';
import type { SkillGraph } from '@/graphs/skill-types';
import type { EmbedFnMap } from '@/api/index';
import type { WatcherHandle } from '@/lib/watcher';
import type { GraphManagerContext, ExternalGraphs } from '@/graphs/manager-types';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MirrorWriteTracker, scanMirrorDirs, startMirrorWatcher } from '@/lib/mirror-watcher';
import { ensureAuthorInTeam } from '@/lib/team';
import path from 'path';
import { AUTO_SAVE_INTERVAL_MS } from '@/lib/defaults';
import { createLogger } from '@/lib/logger';
import { StoreManager } from '@/lib/store-manager';
import { SqliteStore } from '@/store';
import type { Store, ProjectScopedStore } from '@/store/types';

const log = createLogger('project-manager');

// ---------------------------------------------------------------------------
// ProjectInstance
// ---------------------------------------------------------------------------

export interface ProjectInstance {
  id: string;
  config: ProjectConfig;
  /** SQLite project-scoped store (always present when Store is open) */
  scopedStore: ProjectScopedStore;
  /** Numeric project ID in SQLite Store */
  dbProjectId: number;
  // User-managed graphs (still Graphology — will be removed in Phase 4)
  knowledgeGraph?: KnowledgeGraph;
  taskGraph?: TaskGraph;
  skillGraph?: SkillGraph;
  knowledgeManager?: KnowledgeGraphManager;
  taskManager?: TaskGraphManager;
  skillManager?: SkillGraphManager;
  storeManager?: StoreManager;
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
  private cacheFactory?: EmbeddingCacheFactory;
  /** Per-project SQLite stores — keyed by project id */
  private stores = new Map<string, Store>();

  private hasUsers: boolean;

  constructor(private serverConfig: ServerConfig, cacheFactory?: EmbeddingCacheFactory, hasUsers = false) {
    super();
    this.cacheFactory = cacheFactory;
    this.hasUsers = hasUsers;
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

    const knowledgeGraph = loadKnowledgeGraph(config.graphMemory, reindex, embeddingFingerprint(gc.knowledge.model));
    const taskGraph = loadTaskGraph(config.graphMemory, reindex, embeddingFingerprint(gc.tasks.model));
    const skillGraph = loadSkillGraph(config.graphMemory, reindex, embeddingFingerprint(gc.skills.model));

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
        if (!_authorEnsured && !this.hasUsers) {
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
    log.info({ workspace: id }, 'Added workspace');
  }

  /**
   * Load embedding models for a workspace. Call after addWorkspace.
   */
  async loadWorkspaceModels(id: string): Promise<void> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace "${id}" not found`);

    const gc = ws.config.graphConfigs;
    await loadModel(gc.knowledge.model, gc.knowledge.embedding, this.serverConfig.modelsDir, `${id}:knowledge`, this.cacheFactory);
    await loadModel(gc.tasks.model, gc.tasks.embedding, this.serverConfig.modelsDir, `${id}:tasks`, this.cacheFactory);
    await loadModel(gc.skills.model, gc.skills.embedding, this.serverConfig.modelsDir, `${id}:skills`, this.cacheFactory);
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

    // ---------------------------------------------------------------------------
    // SQLite Store — one per project, holds indexed + user-managed graphs
    // ---------------------------------------------------------------------------
    const store = new SqliteStore();
    const dbPath = path.join(config.graphMemory, 'store.db');
    store.open({ dbPath });
    this.stores.set(id, store);

    // Ensure project exists in store
    let dbProject = store.projects.list().results.find(p => p.slug === id);
    if (!dbProject || reindex) {
      if (dbProject && reindex) {
        // TODO: clear indexed data on reindex
      }
      if (!dbProject) {
        dbProject = store.projects.create({ slug: id, name: id, directory: config.projectDir });
      }
    }
    const scopedStore = store.project(dbProject.id);

    // Knowledge/tasks/skills: shared from workspace or per-project (gated by enabled)
    const knowledgeGraph = ws ? ws.knowledgeGraph
      : gc.knowledge.enabled ? loadKnowledgeGraph(config.graphMemory, reindex, embeddingFingerprint(gc.knowledge.model)) : undefined;
    const taskGraph = ws ? ws.taskGraph
      : gc.tasks.enabled ? loadTaskGraph(config.graphMemory, reindex, embeddingFingerprint(gc.tasks.model)) : undefined;
    const skillGraph = ws ? ws.skillGraph
      : gc.skills.enabled ? loadSkillGraph(config.graphMemory, reindex, embeddingFingerprint(gc.skills.model)) : undefined;

    // Build embed functions (project-scoped model names)
    const embedFns = this.buildEmbedFns(id);

    // Build StoreManager for user-managed graphs (knowledge/tasks/skills/epics)
    const emitter = this; // ProjectManager is an EventEmitter
    const embedFn = (text: string) => embed(text, '', `${id}:knowledge`);
    const storeManager = new StoreManager({
      store, projectId: dbProject.id, projectDir: config.projectDir,
      embedFn, emitter,
    });

    const instance: ProjectInstance = {
      id,
      config,
      scopedStore,
      dbProjectId: dbProject.id,
      knowledgeGraph,
      taskGraph,
      skillGraph,
      storeManager,
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
        if (!_authorEnsured && !this.hasUsers) {
          _authorEnsured = true;
          ensureAuthorInTeam(path.join(config.projectDir, '.team'), config.author);
        }
      },
      emit: (event: string, data: unknown) => { this.emit(event, data); },
      projectId: id,
      projectDir: config.projectDir,
      author: formatAuthor(config.author),
    };

    const ext: ExternalGraphs = { knowledgeGraph, taskGraph, skillGraph };

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
    log.info({ project: id, projectDir: config.projectDir, workspace: workspaceId }, 'Added project');
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
      await loadModel(gc[gn].model, gc[gn].embedding, this.serverConfig.modelsDir, `${id}:${gn}`, this.cacheFactory);
    }
  }

  /**
   * Start indexing + watching for a project. Call after loadModels.
   * Uses three sequential phases: docs → files → code, then finalize.
   */
  async startIndexing(id: string): Promise<void> {
    this.ensureIndexer(id);
    const instance = this.projects.get(id)!;

    // Three sequential phases
    for (const phase of ['docs', 'files', 'code'] as IndexPhase[]) {
      instance.indexer!.scan(phase);
      try {
        await instance.indexer!.drain(phase);
      } catch (err) {
        log.error({ project: id, phase, err }, 'Error draining phase');
      }
    }

    await this.finalizeIndexing(id);
  }

  /**
   * Create the indexer and watcher for a project (if not already created).
   * Call before startIndexingPhase or startIndexing.
   */
  ensureIndexer(id: string): void {
    const instance = this.projects.get(id);
    if (!instance) throw new Error(`Project "${id}" not found`);
    if (instance.indexer) return; // already created

    // Clear parser caches to prevent cross-project leaks in multi-project mode
    clearPathMappingsCache();
    clearWikiIndexCache();

    const gc = instance.config.graphConfigs;
    const indexer = createProjectIndexer(instance.scopedStore, {
      projectId:           id,
      projectDir:          instance.config.projectDir,
      docsInclude:         gc.docs.enabled ? gc.docs.include : undefined,
      docsExclude:         gc.docs.exclude,
      codeInclude:         gc.code.enabled ? gc.code.include : undefined,
      codeExclude:         gc.code.exclude,
      filesExclude:        gc.files.exclude,
      chunkDepth:          instance.config.chunkDepth,
      maxFileSize:         instance.config.maxFileSize,
      docsModelName:       `${id}:docs`,
      codeModelName:       `${id}:code`,
      filesModelName:      `${id}:files`,
    }, {
      docs:  gc.docs.enabled,
      code:  gc.code.enabled,
      files: gc.files.enabled,
    });

    instance.indexer = indexer;
  }

  /**
   * Run a single indexing phase (docs, code, or files) for a project.
   * Call ensureIndexer first. Watcher is NOT started — call finalizeIndexing when done.
   */
  async startIndexingPhase(id: string, phase: IndexPhase): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) throw new Error(`Project "${id}" not found`);
    if (!instance.indexer) throw new Error(`Indexer not created for "${id}". Call ensureIndexer() first.`);

    instance.indexer.scan(phase);
    await instance.indexer.drain(phase);
  }

  /**
   * Finalize indexing: run full drain (finalize edges), start watcher, save, mirror, emit.
   * Call after all phases are done.
   */
  async finalizeIndexing(id: string): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) throw new Error(`Project "${id}" not found`);
    if (!instance.indexer) throw new Error(`Indexer not created for "${id}". Call ensureIndexer() first.`);

    // Full drain with finalize (rebuildDirectoryStats, resolvePendingLinks, etc.)
    try {
      await instance.indexer.drain();
    } catch (err) {
      log.error({ project: id, err }, 'Error during finalize drain');
    }

    // Start watcher for live re-indexing
    if (!instance.watcher) {
      instance.watcher = instance.indexer.watch();
      await instance.watcher.whenReady;
    }

    // Save after initial scan
    this.saveProject(instance);
    instance.dirty = false;

    // Scan and watch .notes/ and .tasks/ for reverse import (skip for workspace projects — handled by workspace)
    // Skip mirror entirely if knowledge or tasks graph is readonly (mirror requires both)
    if (instance.mirrorTracker && !instance.workspaceId && instance.knowledgeManager && instance.taskManager) {
      const gc = instance.config.graphConfigs;
      if (!gc.knowledge.readonly && !gc.tasks.readonly) {
        const mirrorConfig = {
          projectDir: instance.config.projectDir,
          knowledgeManager: instance.knowledgeManager,
          taskManager: instance.taskManager,
          skillManager: gc.skills.readonly ? undefined : instance.skillManager,
          mutationQueue: instance.mutationQueue,
          tracker: instance.mirrorTracker,
        };
        await scanMirrorDirs(mirrorConfig);
        instance.mirrorWatcher = startMirrorWatcher(mirrorConfig);
      }
    }

    this.emit('project:indexed', { projectId: id });
    log.info({ project: id }, 'Project indexed');
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
            if (attrs.proxyFor?.projectId === id) {
              toRemove.push(nodeId);
            } else if (attrs.proxyFor && !attrs.proxyFor.projectId && graph.degree(nodeId) === 0) {
              // Legacy proxy (no projectId) — clean up if orphaned (zero edges)
              toRemove.push(nodeId);
            }
          });
          for (const nodeId of toRemove) graph.dropNode(nodeId);
        }
      }
    }

    this.projects.delete(id);
    // Close project's SQLite store
    const store = this.stores.get(id);
    if (store) {
      try { store.close(); } catch { /* ignore */ }
      this.stores.delete(id);
    }
    log.info({ project: id }, 'Removed project');
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
   * Safe despite running outside PromiseQueue: graph.export() and
   * JSON.stringify are synchronous, so the event loop won't interleave
   * them with async mutations (which yield at await points).
   */
  startAutoSave(intervalMs = AUTO_SAVE_INTERVAL_MS): void {
    this.autoSaveInterval = setInterval(() => {
      for (const instance of this.projects.values()) {
        if (instance.dirty) {
          try {
            this.saveProject(instance);
            instance.dirty = false;
          } catch (err) {
            log.error({ project: instance.id, err }, 'Auto-save error');
          }
        }
      }
      for (const ws of this.workspaces.values()) {
        if (ws.dirty) {
          try {
            this.saveWorkspace(ws);
            ws.dirty = false;
          } catch (err) {
            log.error({ workspace: ws.id, err }, 'Auto-save error for workspace');
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
        await instance.mutationQueue.waitForPending();
        this.saveProject(instance);
      } catch (err) {
        log.error({ project: instance.id, err }, 'Shutdown error');
      }
    }
    for (const ws of this.workspaces.values()) {
      try {
        if (ws.mirrorWatcher) await ws.mirrorWatcher.close();
        await ws.mutationQueue.waitForPending();
        this.saveWorkspace(ws);
      } catch (err) {
        log.error({ workspace: ws.id, err }, 'Shutdown error for workspace');
      }
    }
    this.projects.clear();
    this.workspaces.clear();
    // Close all SQLite stores
    for (const store of this.stores.values()) {
      try { store.close(); } catch { /* ignore close errors */ }
    }
    this.stores.clear();
    log.info('Shutdown complete');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private saveProject(instance: ProjectInstance): void {
    // Indexed graphs (docs/code/files) are in SQLite — no separate save needed.
    // Knowledge/tasks/skills still use Graphology JSON persistence.
    if (!instance.workspaceId) {
      const gc = instance.config.graphConfigs;
      if (instance.knowledgeGraph) saveKnowledgeGraph(instance.knowledgeGraph, instance.config.graphMemory, embeddingFingerprint(gc.knowledge.model));
      if (instance.taskGraph) saveTaskGraph(instance.taskGraph, instance.config.graphMemory, embeddingFingerprint(gc.tasks.model));
      if (instance.skillGraph) saveSkillGraph(instance.skillGraph, instance.config.graphMemory, embeddingFingerprint(gc.skills.model));
    }
  }

  private saveWorkspace(ws: WorkspaceInstance): void {
    const gc = ws.config.graphConfigs;
    saveKnowledgeGraph(ws.knowledgeGraph, ws.config.graphMemory, embeddingFingerprint(gc.knowledge.model));
    saveTaskGraph(ws.taskGraph, ws.config.graphMemory, embeddingFingerprint(gc.tasks.model));
    saveSkillGraph(ws.skillGraph, ws.config.graphMemory, embeddingFingerprint(gc.skills.model));
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
