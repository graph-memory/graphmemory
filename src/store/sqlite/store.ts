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
} from '../types';
import { openDatabase } from './lib/db';
import { runMigrations } from './lib/migrate';
import { MetaHelper } from './lib/meta';
import { EdgeHelper } from './lib/edge-helper';
import { v001 } from './migrations/v001';
import { SqliteTeamStore } from './stores/team';
import { SqliteProjectsStore } from './stores/projects';
import { SqliteProjectScopedStore } from './stores/project-scoped';

const ALL_MIGRATIONS = [v001];

export class SqliteStore implements Store {
  private db: Database.Database | null = null;
  private metaHelper: MetaHelper | null = null;
  private edgeHelper: EdgeHelper | null = null;
  private scopedCache = new Map<number, ProjectScopedStore>();
  private _projects: SqliteProjectsStore | null = null;
  private _team: SqliteTeamStore | null = null;

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
    this.db = openDatabase(opts.dbPath);
    runMigrations(this.db, ALL_MIGRATIONS);
    this.metaHelper = new MetaHelper(this.db, '');
    this.edgeHelper = new EdgeHelper(this.db);
    this._projects = new SqliteProjectsStore(this.db);
    this._team = new SqliteTeamStore(this.db);
  }

  close(): void {
    if (!this.db) return;
    this.scopedCache.clear();
    this._projects = null;
    this._team = null;
    this.edgeHelper = null;
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
    this.db = null;
    this.metaHelper = null;
  }

  // --- Project scoping ---

  project(projectId: number): ProjectScopedStore {
    this.requireDb();
    let scoped = this.scopedCache.get(projectId);
    if (!scoped) {
      scoped = new SqliteProjectScopedStore(this.db!, projectId);
      this.scopedCache.set(projectId, scoped);
    }
    return scoped;
  }

  // --- Edges ---

  createEdge(projectId: number, edge: Edge): void {
    this.requireDb();
    this.edgeHelper!.createEdge(projectId, edge);
  }

  deleteEdge(projectId: number, edge: Edge): void {
    this.requireDb();
    this.edgeHelper!.deleteEdge(projectId, edge);
  }

  listEdges(filter: EdgeFilter & { projectId?: number }): Edge[] {
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
