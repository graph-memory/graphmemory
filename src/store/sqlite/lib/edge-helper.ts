import Database from 'better-sqlite3';
import type { Edge, EdgeFilter, GraphName } from '../../types';
import { num } from './bigint';

/**
 * Shared edge CRUD operations.
 * Used by both SqliteStore (workspace-level) and SqliteProjectScopedStore.
 */
export class EdgeHelper {
  constructor(private db: Database.Database) {}

  createEdge(fromProjectId: number, toProjectId: number, edge: Edge): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO edges (from_project_id, from_graph, from_id, to_project_id, to_graph, to_id, kind)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(fromProjectId, edge.fromGraph, edge.fromId, toProjectId, edge.toGraph, edge.toId, edge.kind);
  }

  deleteEdge(edge: Edge): void {
    this.db.prepare(`
      DELETE FROM edges
      WHERE from_graph = ? AND from_id = ? AND to_graph = ? AND to_id = ? AND kind = ?
    `).run(edge.fromGraph, edge.fromId, edge.toGraph, edge.toId, edge.kind);
  }

  listEdges(filter: EdgeFilter): Edge[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.fromProjectId !== undefined) { conditions.push('from_project_id = ?'); params.push(filter.fromProjectId); }
    if (filter.fromGraph) { conditions.push('from_graph = ?'); params.push(filter.fromGraph); }
    if (filter.fromId !== undefined) { conditions.push('from_id = ?'); params.push(filter.fromId); }
    if (filter.toProjectId !== undefined) { conditions.push('to_project_id = ?'); params.push(filter.toProjectId); }
    if (filter.toGraph) { conditions.push('to_graph = ?'); params.push(filter.toGraph); }
    if (filter.toId !== undefined) { conditions.push('to_id = ?'); params.push(filter.toId); }
    if (filter.kind) { conditions.push('kind = ?'); params.push(filter.kind); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(
      `SELECT from_project_id, from_graph, from_id, to_project_id, to_graph, to_id, kind FROM edges ${where} LIMIT 10000`
    ).all(...params) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      fromProjectId: num(r.from_project_id as bigint),
      fromGraph: r.from_graph as GraphName,
      fromId: num(r.from_id as bigint),
      toProjectId: num(r.to_project_id as bigint),
      toGraph: r.to_graph as GraphName,
      toId: num(r.to_id as bigint),
      kind: r.kind as string,
    }));
  }

  findIncomingEdges(targetGraph: GraphName, targetId: number, projectId?: number): Edge[] {
    const filter: EdgeFilter = { toGraph: targetGraph, toId: targetId };
    if (projectId !== undefined) filter.toProjectId = projectId;
    return this.listEdges(filter);
  }

  findOutgoingEdges(fromGraph: GraphName, fromId: number, projectId?: number): Edge[] {
    const filter: EdgeFilter = { fromGraph, fromId };
    if (projectId !== undefined) filter.fromProjectId = projectId;
    return this.listEdges(filter);
  }
}
