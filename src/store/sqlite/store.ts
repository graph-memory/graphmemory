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
import { v001 } from './migrations/v001';

const ALL_MIGRATIONS = [v001];

export class SqliteStore implements Store {
  private db: Database.Database | null = null;
  private metaHelper: MetaHelper | null = null;
  private scopedCache = new Map<number, ProjectScopedStore>();

  // --- Sub-stores (workspace-level) ---
  get projects(): ProjectsStore {
    throw new Error('Not implemented yet (Phase 3)');
  }

  get team(): TeamStore {
    throw new Error('Not implemented yet (Phase 3)');
  }

  // --- Lifecycle ---

  open(opts: StoreOptions): void {
    if (this.db) throw new Error('Store already open');
    this.db = openDatabase(opts.dbPath);
    runMigrations(this.db, ALL_MIGRATIONS);
    this.metaHelper = new MetaHelper(this.db, '');
  }

  close(): void {
    if (!this.db) return;
    this.scopedCache.clear();
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.close();
    this.db = null;
    this.metaHelper = null;
  }

  // --- Project scoping ---

  project(_projectId: number): ProjectScopedStore {
    throw new Error('Not implemented yet (Phase 6)');
  }

  // --- Edges ---

  createEdge(_projectId: number, _edge: Edge): void {
    throw new Error('Not implemented yet (Phase 6)');
  }

  deleteEdge(_projectId: number, _edge: Edge): void {
    throw new Error('Not implemented yet (Phase 6)');
  }

  listEdges(_filter: EdgeFilter & { projectId?: number }): Edge[] {
    throw new Error('Not implemented yet (Phase 6)');
  }

  findIncomingEdges(_targetGraph: GraphName, _targetId: number, _projectId?: number): Edge[] {
    throw new Error('Not implemented yet (Phase 6)');
  }

  findOutgoingEdges(_fromGraph: GraphName, _fromId: number, _projectId?: number): Edge[] {
    throw new Error('Not implemented yet (Phase 6)');
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

  /** Get the raw database handle (for sub-stores) */
  getDb(): Database.Database {
    this.requireDb();
    return this.db!;
  }

  private requireDb(): void {
    if (!this.db) throw new Error('Store not open. Call open() first.');
  }
}
