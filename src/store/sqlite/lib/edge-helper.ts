import Database from 'better-sqlite3';
import type { Edge, EdgeFilter, GraphName } from '../../types';
import { num } from './bigint';

/**
 * Shared edge CRUD operations.
 * Used by both SqliteStore (workspace-level) and SqliteProjectScopedStore.
 */
export class EdgeHelper {
  constructor(private db: Database.Database) {}

  createEdge(projectId: number, edge: Edge): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO edges (project_id, from_graph, from_id, to_graph, to_id, kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(projectId, edge.fromGraph, edge.fromId, edge.toGraph, edge.toId, edge.kind);
  }

  deleteEdge(projectId: number, edge: Edge): void {
    this.db.prepare(`
      DELETE FROM edges
      WHERE project_id = ? AND from_graph = ? AND from_id = ? AND to_graph = ? AND to_id = ? AND kind = ?
    `).run(projectId, edge.fromGraph, edge.fromId, edge.toGraph, edge.toId, edge.kind);
  }

  listEdges(filter: EdgeFilter & { projectId?: number }): Edge[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.projectId !== undefined) { conditions.push('project_id = ?'); params.push(filter.projectId); }
    if (filter.fromGraph) { conditions.push('from_graph = ?'); params.push(filter.fromGraph); }
    if (filter.fromId !== undefined) { conditions.push('from_id = ?'); params.push(filter.fromId); }
    if (filter.toGraph) { conditions.push('to_graph = ?'); params.push(filter.toGraph); }
    if (filter.toId !== undefined) { conditions.push('to_id = ?'); params.push(filter.toId); }
    if (filter.kind) { conditions.push('kind = ?'); params.push(filter.kind); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(
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
}
