import { EventEmitter } from 'events';
import { loadModel, embed, embedQuery, probeEmbeddingDim, type EmbeddingCacheFactory } from '@/lib/embedder';
import { createProjectIndexer, type ProjectIndexer, type IndexPhase } from '@/cli/indexer';
import { clearPathMappingsCache } from '@/lib/parsers/code';
import { clearWikiIndexCache } from '@/lib/parsers/docs';
import { PromiseQueue } from '@/lib/promise-queue';
import type { ProjectConfig, ServerConfig, WorkspaceConfig, GraphName } from '@/lib/multi-config';
import { GRAPH_NAMES, embeddingFingerprint } from '@/lib/multi-config';
import type { EmbedFnMap } from '@/api/index';
import type { WatcherHandle } from '@/lib/watcher';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MirrorWriteTracker, scanMirrorDirs, startMirrorWatcher } from '@/lib/mirror-watcher';
import path from 'path';
import { AUTO_SAVE_INTERVAL_MS } from '@/lib/defaults';
import { createLogger } from '@/lib/logger';
import { StoreManager } from '@/lib/store-manager';
import { SqliteStore } from '@/store';
import type { Store, ProjectScopedStore, EmbeddingDims } from '@/store/types';
import type { VecGraph } from '@/store/types/common';

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
  /** StoreManager handles CRUD, embedding, mirror, events for user-managed graphs */
  storeManager: StoreManager;
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
  store: SqliteStore;
  storeManager: StoreManager;
  mirrorTracker: MirrorWriteTracker;
  mirrorWatcher?: WatcherHandle;
  mutationQueue: PromiseQueue;
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

  constructor(private serverConfig: ServerConfig, cacheFactory?: EmbeddingCacheFactory, _hasUsers = false) {
    super();
    this.cacheFactory = cacheFactory;
  }

  // ---------------------------------------------------------------------------
  // Workspaces
  // ---------------------------------------------------------------------------

  /**
   * Add a workspace: create shared SQLite Store for user-managed graphs.
   * Must be called before addProject for projects that belong to this workspace.
   */
  async addWorkspace(id: string, config: WorkspaceConfig, _reindex = false): Promise<void> {
    if (this.workspaces.has(id)) {
      throw new Error(`Workspace "${id}" already exists`);
    }

    // Create workspace-level Store for shared user-managed graphs
    const store = new SqliteStore();
    const dbPath = path.join(config.graphMemory, 'store.db');
    store.open({ dbPath });
    this.stores.set(`ws:${id}`, store);

    // Create a workspace "project" entry to scope shared user-managed data
    let dbProject = store.projects.list().results.find(p => p.slug === id);
    if (!dbProject) {
      dbProject = store.projects.create({ slug: id, name: id, directory: config.mirrorDir });
    }
    const mutationQueue = new PromiseQueue();
    const mirrorTracker = new MirrorWriteTracker();

    const emitter = this;
    const embedFn = (text: string) => embed(text, '', `${id}:knowledge`);
    const storeManager = new StoreManager({
      store, projectId: dbProject.id, projectDir: config.mirrorDir,
      embedFn, emitter,
    });
    storeManager.setMirrorTracker(mirrorTracker);

    const wsInstance: WorkspaceInstance = {
      id,
      config,
      store,
      storeManager,
      mirrorTracker,
      mutationQueue,
    };

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

    const gc = ws.config.graphConfigs;
    const mirrorConfig = {
      projectDir: ws.config.mirrorDir,
      storeManager: ws.storeManager,
      skillsEnabled: gc.skills.enabled && !gc.skills.readonly,
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
   * Add a project: create Store, create StoreManager, setup indexer.
   */
  async addProject(id: string, config: ProjectConfig, reindex = false, workspaceId?: string): Promise<void> {
    if (this.projects.has(id)) {
      throw new Error(`Project "${id}" already exists`);
    }

    const ws = workspaceId ? this.workspaces.get(workspaceId) : undefined;
    if (workspaceId && !ws) throw new Error(`Workspace "${workspaceId}" not found`);

    const gc = config.graphConfigs;

    // ---------------------------------------------------------------------------
    // SQLite Store — workspace projects share the workspace DB; standalone get their own
    // ---------------------------------------------------------------------------
    let store: SqliteStore;
    if (ws) {
      store = ws.store;
    } else {
      store = new SqliteStore();
      const dbPath = path.join(config.graphMemory, 'store.db');
      store.open({ dbPath });
      this.stores.set(id, store);
    }

    // Ensure project exists in store
    let dbProject = store.projects.list().results.find(p => p.slug === id);
    if (!dbProject || reindex) {
      if (dbProject && reindex) {
        const scoped = store.project(dbProject.id);
        scoped.docs.clear();
        scoped.code.clear();
        scoped.files.clear();
        log.info({ project: id }, 'Cleared indexed data for reindex');
      }
      if (!dbProject) {
        dbProject = store.projects.create({ slug: id, name: id, directory: config.projectDir });
      }
    }
    const scopedStore = store.project(dbProject.id);

    // Check embedding model fingerprints — auto-clear graphs whose model changed
    const clearFns: Record<string, () => void> = {
      docs: () => scopedStore.docs.clear(),
      code: () => scopedStore.code.clear(),
      files: () => scopedStore.files.clear(),
    };
    for (const gn of ['docs', 'code', 'files'] as const) {
      if (!gc[gn].enabled) continue;
      const fp = embeddingFingerprint(gc[gn].model);
      const metaKey = `model_fp:${id}:${gn}`;
      const stored = store.getMeta(metaKey);
      if (!reindex && stored !== null && stored !== fp) {
        clearFns[gn]();
        log.info({ project: id, graph: gn, old: stored, new: fp }, 'Model changed — cleared graph for reindex');
      }
      store.setMeta(metaKey, fp);
    }

    // Build embed functions (project-scoped model names)
    const embedFns = this.buildEmbedFns(id);

    // Build StoreManager — for workspace projects, use workspace's shared StoreManager
    // For standalone projects, create per-project StoreManager
    let storeManager: StoreManager;
    if (ws) {
      storeManager = ws.storeManager;
    } else {
      const emitter = this;
      const embedFn = (text: string) => embed(text, '', `${id}:knowledge`);
      storeManager = new StoreManager({
        store, projectId: dbProject.id, projectDir: config.projectDir,
        embedFn, emitter,
      });
    }

    const instance: ProjectInstance = {
      id,
      config,
      scopedStore,
      dbProjectId: dbProject.id,
      storeManager,
      embedFns,
      mutationQueue: ws ? ws.mutationQueue : new PromiseQueue(),
      dirty: false,
      workspaceId,
    };

    // Set up mirror write tracker for feedback loop prevention (standalone only)
    if (!ws) {
      if (gc.knowledge.enabled || gc.tasks.enabled || gc.skills.enabled) {
        const mirrorTracker = new MirrorWriteTracker();
        instance.mirrorTracker = mirrorTracker;
        storeManager.setMirrorTracker(mirrorTracker);
      }
    } else {
      instance.mirrorTracker = ws.mirrorTracker;
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
   * Probe embedding dimensions for a workspace's models and update its vec0 tables.
   * Call after loadWorkspaceModels.
   */
  async probeWorkspaceDimensions(id: string): Promise<void> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`Workspace "${id}" not found`);

    const dims: EmbeddingDims = {};
    const graphNames: VecGraph[] = ['knowledge', 'tasks', 'skills'];
    for (const gn of graphNames) {
      dims[gn] = await probeEmbeddingDim(`${id}:${gn}`);
    }
    // Epics share the same embedder as tasks
    dims.epics = dims.tasks;
    ws.store.updateEmbeddingDims(dims);
    ws.storeManager.refreshScoped();
    log.info({ workspace: id, dims }, 'Probed workspace embedding dimensions');
  }

  /**
   * Probe embedding dimensions for a project's models and update its vec0 tables.
   * Call after loadModels.
   */
  async probeDimensions(id: string): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) throw new Error(`Project "${id}" not found`);

    const gc = instance.config.graphConfigs;
    const dims: EmbeddingDims = {};
    const skipGraphs = instance.workspaceId
      ? new Set<GraphName>(['knowledge', 'tasks', 'skills'])
      : new Set<GraphName>();

    for (const gn of GRAPH_NAMES) {
      if (skipGraphs.has(gn)) continue;
      if (!gc[gn].enabled) continue;
      dims[gn as VecGraph] = await probeEmbeddingDim(`${id}:${gn}`);
    }
    // Epics share the same embedder as knowledge (standalone) or tasks (workspace — handled in probeWorkspaceDimensions)
    if (!instance.workspaceId && dims.knowledge) {
      dims.epics = dims.knowledge;
    }

    // Workspace projects share the workspace store; standalone have their own in this.stores
    const store = instance.workspaceId
      ? this.workspaces.get(instance.workspaceId)?.store
      : this.stores.get(id);
    if (store) {
      store.updateEmbeddingDims(dims);
      // Refresh scopedStore references — old ones have stale embeddingDim values
      instance.scopedStore = store.project(instance.dbProjectId);
      if (!instance.workspaceId) {
        instance.storeManager.refreshScoped();
      }
    }
    log.info({ project: id, dims }, 'Probed project embedding dimensions');
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
   * Finalize indexing: run full drain (finalize edges), start watcher, mirror scan, emit.
   * Call after all phases are done.
   */
  async finalizeIndexing(id: string): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) throw new Error(`Project "${id}" not found`);
    if (!instance.indexer) throw new Error(`Indexer not created for "${id}". Call ensureIndexer() first.`);

    // Full drain with finalize (resolvePendingLinks, etc.)
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

    // Scan and watch .notes/ and .tasks/ for reverse import (skip for workspace — handled by workspace)
    if (instance.mirrorTracker && !instance.workspaceId) {
      const gc = instance.config.graphConfigs;
      if (gc.knowledge.enabled && gc.tasks.enabled && !gc.knowledge.readonly && !gc.tasks.readonly) {
        const mirrorConfig = {
          projectDir: instance.config.projectDir,
          storeManager: instance.storeManager,
          skillsEnabled: gc.skills.enabled && !gc.skills.readonly,
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
   * Remove a project: drain indexer, close watcher, close store.
   */
  async removeProject(id: string): Promise<void> {
    const instance = this.projects.get(id);
    if (!instance) return;

    if (instance.mirrorWatcher) await instance.mirrorWatcher.close();
    if (instance.watcher) await instance.watcher.close();
    if (instance.indexer) await instance.indexer.drain();
    if (instance.mcpClientCleanup) await instance.mcpClientCleanup();

    this.projects.delete(id);
    // Close project's SQLite store (only standalone projects own their store)
    if (!instance.workspaceId) {
      const store = this.stores.get(id);
      if (store) {
        try { store.close(); } catch { /* ignore */ }
        this.stores.delete(id);
      }
    }
    log.info({ project: id }, 'Removed project');
  }

  getProject(id: string): ProjectInstance | undefined {
    return this.projects.get(id);
  }

  listProjects(): string[] {
    return Array.from(this.projects.keys());
  }

  /**
   * Start auto-save interval. With SQLite Store, there is no Graphology JSON to save —
   * all writes are persisted immediately to SQLite. This is kept as a no-op hook
   * for any future periodic maintenance tasks.
   */
  startAutoSave(_intervalMs = AUTO_SAVE_INTERVAL_MS): void {
    // SQLite writes are immediately durable — no periodic save needed.
    // Kept as API for backward compatibility.
  }

  /**
   * Shut down all projects and workspaces.
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
      } catch (err) {
        log.error({ project: instance.id, err }, 'Shutdown error');
      }
    }
    for (const ws of this.workspaces.values()) {
      try {
        if (ws.mirrorWatcher) await ws.mirrorWatcher.close();
        await ws.mutationQueue.waitForPending();
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
