import Database from 'better-sqlite3';
import type {
  Store,
  StoreOptions,
  ProjectScopedStore,
  ProjectsStore,
  TeamStore,
  Edge,
  EdgeFilter,
  GraphName,
  EmbeddingDims,
} from '../types';
import type { VecGraph } from '../types/common';
import { getEmbeddingDim } from '../types/common';
import { openDatabase } from './lib/db';
import { runMigrations } from './lib/migrate';
import { MetaHelper } from './lib/meta';
import { EdgeHelper } from './lib/edge-helper';
import { v001 } from './migrations/v001';
import { SqliteTeamStore } from './stores/team';
import { SqliteProjectsStore } from './stores/projects';
import { SqliteProjectScopedStore } from './stores/project-scoped';

export class SqliteStore implements Store {
  private db: Database.Database | null = null;
  private metaHelper: MetaHelper | null = null;
  private edgeHelper: EdgeHelper | null = null;
  private scopedCache = new Map<number, ProjectScopedStore>();
  private _projects: SqliteProjectsStore | null = null;
  private _team: SqliteTeamStore | null = null;
  embeddingDims: EmbeddingDims = {};

  // --- Sub-stores (workspace-level) ---

  get projects(): ProjectsStore {
    this.requireDb();
    return this._projects!;
  }

  get team(): TeamStore {
    this.requireDb();
    return this._team!;
  }

  // --- Lifecycle ---

  open(opts: StoreOptions): void {
    if (this.db) throw new Error('Store already open');
    this.embeddingDims = opts.embeddingDims ?? {};
    this.db = openDatabase(opts.dbPath);
    runMigrations(this.db, [v001(this.embeddingDims)]);
    this.metaHelper = new MetaHelper(this.db, '');
    this.edgeHelper = new EdgeHelper(this.db);
    this._projects = new SqliteProjectsStore(this.db);
    this._team = new SqliteTeamStore(this.db);
  }

  /**
   * Update embedding dimensions: recreate vec0 tables whose dimension changed.
   * Must be called after open() once actual model dimensions are known.
   * Clears the scoped store cache so subsequent project() calls use the new dims.
   */
  updateEmbeddingDims(dims: EmbeddingDims): void {
    this.requireDb();
    const VEC_TABLES: VecGraph[] = ['knowledge', 'tasks', 'epics', 'skills', 'code', 'docs', 'files'];
    let updated = 0;
    for (const graph of VEC_TABLES) {
      const wanted = getEmbeddingDim(dims, graph);
      const current = this.getVecDimension(`${graph}_vec`);
      if (current !== null && current !== wanted) {
        this.db!.exec(`DROP TABLE IF EXISTS ${graph}_vec`);
        this.db!.exec(`CREATE VIRTUAL TABLE ${graph}_vec USING vec0(embedding float[${wanted}])`);
        updated++;
      }
    }
    this.embeddingDims = dims;
    this.scopedCache.clear();
  }

  /** Read the dimension of a vec0 table from its CREATE SQL, or null if the table doesn't exist. */
  private getVecDimension(tableName: string): number | null {
    const row = this.db!.prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
    ).get(tableName) as { sql: string } | undefined;
    if (!row) return null;
    // sql looks like: CREATE VIRTUAL TABLE x USING vec0(embedding float[384])
    const m = row.sql.match(/float\[(\d+)\]/);
    return m ? Number(m[1]) : null;
  }

  close(): void {
    if (!this.db) return;
    this.scopedCache.clear();
    this._projects = null;
    this._team = null;
    this.edgeHelper = null;
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Checkpoint failure is non-fatal — WAL will be checkpointed on next open
    }
    this.db.close();
    this.db = null;
    this.metaHelper = null;
  }

  // --- Project scoping ---

  project(projectId: number): ProjectScopedStore {
    this.requireDb();
    let scoped = this.scopedCache.get(projectId);
    if (!scoped) {
      scoped = new SqliteProjectScopedStore(this.db!, projectId, this.embeddingDims);
      this.scopedCache.set(projectId, scoped);
    }
    return scoped;
  }

  /** Evict a project from the scoped store cache (call after project deletion) */
  evictProject(projectId: number): void {
    this.scopedCache.delete(projectId);
  }

  // --- Edges ---

  createEdge(fromProjectId: number, toProjectId: number, edge: Edge): void {
    this.requireDb();
    this.edgeHelper!.createEdge(fromProjectId, toProjectId, edge);
  }

  deleteEdge(edge: Edge): void {
    this.requireDb();
    this.edgeHelper!.deleteEdge(edge);
  }

  listEdges(filter: EdgeFilter): Edge[] {
    this.requireDb();
    return this.edgeHelper!.listEdges(filter);
  }

  findIncomingEdges(targetGraph: GraphName, targetId: number, projectId?: number): Edge[] {
    this.requireDb();
    return this.edgeHelper!.findIncomingEdges(targetGraph, targetId, projectId);
  }

  findOutgoingEdges(fromGraph: GraphName, fromId: number, projectId?: number): Edge[] {
    this.requireDb();
    return this.edgeHelper!.findOutgoingEdges(fromGraph, fromId, projectId);
  }

  // --- Transaction ---

  transaction<T>(fn: () => T): T {
    this.requireDb();
    return this.db!.transaction(fn)();
  }

  // --- Meta ---

  getMeta(key: string): string | null {
    this.requireDb();
    return this.metaHelper!.getMeta(key);
  }

  setMeta(key: string, value: string): void {
    this.requireDb();
    this.metaHelper!.setMeta(key, value);
  }

  deleteMeta(key: string): void {
    this.requireDb();
    this.metaHelper!.deleteMeta(key);
  }

  // --- FTS maintenance ---

  /** Rebuild all FTS5 indexes. Use after suspected corruption or out-of-sync state. */
  rebuildFts(): void {
    this.requireDb();
    const tables = ['knowledge_fts', 'tasks_fts', 'epics_fts', 'skills_fts', 'code_fts', 'docs_fts'];
    for (const table of tables) {
      this.db!.prepare(`INSERT INTO ${table}(${table}) VALUES ('rebuild')`).run();
    }
  }

  /** Run FTS5 integrity-check on all indexes. Returns list of tables that failed. */
  checkFts(): string[] {
    this.requireDb();
    const tables = ['knowledge_fts', 'tasks_fts', 'epics_fts', 'skills_fts', 'code_fts', 'docs_fts'];
    const failed: string[] = [];
    for (const table of tables) {
      try {
        this.db!.prepare(`INSERT INTO ${table}(${table}) VALUES ('integrity-check')`).run();
      } catch {
        failed.push(table);
      }
    }
    return failed;
  }

  // --- Internal ---

  /** Get the raw database handle (for sub-stores and tests) */
  getDb(): Database.Database {
    this.requireDb();
    return this.db!;
  }

  private requireDb(): void {
    if (!this.db) throw new Error('Store not open. Call open() first.');
  }
}
