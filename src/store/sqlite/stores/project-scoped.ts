import Database from 'better-sqlite3';
import type {
  ProjectScopedStore,
  CodeStore,
  DocsStore,
  FilesStore,
  KnowledgeStore,
  TasksStore,
  SkillsStore,
  AttachmentsStore,
  Edge,
  EdgeFilter,
  GraphName,
} from '../../types';
import { num } from '../lib/bigint';
import { SqliteCodeStore } from './code';
import { SqliteDocsStore } from './docs';
import { SqliteFilesStore } from './files';
import { SqliteKnowledgeStore } from './knowledge';
import { SqliteTasksStore } from './tasks';
import { SqliteSkillsStore } from './skills';
import { SqliteAttachmentsStore } from './attachments';

export class SqliteProjectScopedStore implements ProjectScopedStore {
  readonly code: CodeStore;
  readonly docs: DocsStore;
  readonly files: FilesStore;
  readonly knowledge: KnowledgeStore;
  readonly tasks: TasksStore;
  readonly skills: SkillsStore;
  readonly attachments: AttachmentsStore;

  constructor(private db: Database.Database, readonly projectId: number) {
    this.code = new SqliteCodeStore(db, projectId);
    this.docs = new SqliteDocsStore(db, projectId);
    this.files = new SqliteFilesStore(db, projectId);
    this.knowledge = new SqliteKnowledgeStore(db, projectId);
    this.tasks = new SqliteTasksStore(db, projectId);
    this.skills = new SqliteSkillsStore(db, projectId);
    this.attachments = new SqliteAttachmentsStore(db, projectId);
  }

  // =========================================================================
  // Edges
  // =========================================================================

  createEdge(edge: Edge): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO edges (project_id, from_graph, from_id, to_graph, to_id, kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(this.projectId, edge.fromGraph, edge.fromId, edge.toGraph, edge.toId, edge.kind);
  }

  deleteEdge(edge: Edge): void {
    this.db.prepare(`
      DELETE FROM edges
      WHERE project_id = ? AND from_graph = ? AND from_id = ? AND to_graph = ? AND to_id = ? AND kind = ?
    `).run(this.projectId, edge.fromGraph, edge.fromId, edge.toGraph, edge.toId, edge.kind);
  }

  listEdges(filter: EdgeFilter): Edge[] {
    const conditions: string[] = ['project_id = ?'];
    const params: unknown[] = [this.projectId];

    if (filter.fromGraph) { conditions.push('from_graph = ?'); params.push(filter.fromGraph); }
    if (filter.fromId !== undefined) { conditions.push('from_id = ?'); params.push(filter.fromId); }
    if (filter.toGraph) { conditions.push('to_graph = ?'); params.push(filter.toGraph); }
    if (filter.toId !== undefined) { conditions.push('to_id = ?'); params.push(filter.toId); }
    if (filter.kind) { conditions.push('kind = ?'); params.push(filter.kind); }

    const rows = this.db.prepare(
      `SELECT from_graph, from_id, to_graph, to_id, kind FROM edges WHERE ${conditions.join(' AND ')}`
    ).all(...params) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      fromGraph: r.from_graph as GraphName,
      fromId: num(r.from_id as bigint),
      toGraph: r.to_graph as GraphName,
      toId: num(r.to_id as bigint),
      kind: r.kind as string,
    }));
  }

  findIncomingEdges(targetGraph: GraphName, targetId: number): Edge[] {
    return this.listEdges({ toGraph: targetGraph, toId: targetId });
  }

  findOutgoingEdges(fromGraph: GraphName, fromId: number): Edge[] {
    return this.listEdges({ fromGraph, fromId });
  }
}
