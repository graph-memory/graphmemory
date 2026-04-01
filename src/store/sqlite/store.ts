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
import { num } from './lib/bigint';
import { v001 } from './migrations/v001';
import { SqliteTeamStore } from './stores/team';
import { SqliteProjectsStore } from './stores/projects';
import { SqliteProjectScopedStore } from './stores/project-scoped';

const ALL_MIGRATIONS = [v001];

export class SqliteStore implements Store {
  private db: Database.Database | null = null;
  private metaHelper: MetaHelper | null = null;
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
    this._projects = new SqliteProjectsStore(this.db);
    this._team = new SqliteTeamStore(this.db);
  }

  close(): void {
    if (!this.db) return;
    this.scopedCache.clear();
    this._projects = null;
    this._team = null;
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
    this.db!.prepare(`
      INSERT OR IGNORE INTO edges (project_id, from_graph, from_id, to_graph, to_id, kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(projectId, edge.fromGraph, edge.fromId, edge.toGraph, edge.toId, edge.kind);
  }

  deleteEdge(projectId: number, edge: Edge): void {
    this.requireDb();
    this.db!.prepare(`
      DELETE FROM edges
      WHERE project_id = ? AND from_graph = ? AND from_id = ? AND to_graph = ? AND to_id = ? AND kind = ?
    `).run(projectId, edge.fromGraph, edge.fromId, edge.toGraph, edge.toId, edge.kind);
  }

  listEdges(filter: EdgeFilter & { projectId?: number }): Edge[] {
    this.requireDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.projectId !== undefined) { conditions.push('project_id = ?'); params.push(filter.projectId); }
    if (filter.fromGraph) { conditions.push('from_graph = ?'); params.push(filter.fromGraph); }
    if (filter.fromId !== undefined) { conditions.push('from_id = ?'); params.push(filter.fromId); }
    if (filter.toGraph) { conditions.push('to_graph = ?'); params.push(filter.toGraph); }
    if (filter.toId !== undefined) { conditions.push('to_id = ?'); params.push(filter.toId); }
    if (filter.kind) { conditions.push('kind = ?'); params.push(filter.kind); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db!.prepare(
      `SELECT from_graph, from_id, to_graph, to_id, kind FROM edges ${where}`
    ).all(...params) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      fromGraph: r.from_graph as GraphName,
      fromId: num(r.from_id as bigint),
      toGraph: r.to_graph as GraphName,
      toId: num(r.to_id as bigint),
      kind: r.kind as string,
    }));
  }

  findIncomingEdges(targetGraph: GraphName, targetId: number, projectId?: number): Edge[] {
    return this.listEdges({ toGraph: targetGraph, toId: targetId, projectId });
  }

  findOutgoingEdges(fromGraph: GraphName, fromId: number, projectId?: number): Edge[] {
    return this.listEdges({ fromGraph, fromId, projectId });
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
