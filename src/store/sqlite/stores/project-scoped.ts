import Database from 'better-sqlite3';
import type {
  ProjectScopedStore,
  CodeStore,
  DocsStore,
  FilesStore,
  KnowledgeStore,
  TasksStore,
  EpicsStore,
  SkillsStore,
  AttachmentsStore,
  Edge,
  EdgeFilter,
  GraphName,
  EmbeddingDims,
} from '../../types';
import { getEmbeddingDim } from '../../types/common';
import { EdgeHelper } from '../lib/edge-helper';
import { SqliteCodeStore } from './code';
import { SqliteDocsStore } from './docs';
import { SqliteFilesStore } from './files';
import { SqliteKnowledgeStore } from './knowledge';
import { SqliteTasksStore } from './tasks';
import { SqliteEpicsStore } from './epics';
import { SqliteSkillsStore } from './skills';
import { SqliteAttachmentsStore } from './attachments';

export class SqliteProjectScopedStore implements ProjectScopedStore {
  readonly code: CodeStore;
  readonly docs: DocsStore;
  readonly files: FilesStore;
  readonly knowledge: KnowledgeStore;
  readonly tasks: TasksStore;
  readonly epics: EpicsStore;
  readonly skills: SkillsStore;
  readonly attachments: AttachmentsStore;
  private edgeHelper: EdgeHelper;
  private db: Database.Database;

  constructor(db: Database.Database, readonly projectId: number, dims?: EmbeddingDims) {
    this.db = db;
    this.code = new SqliteCodeStore(db, projectId, getEmbeddingDim(dims, 'code'));
    this.docs = new SqliteDocsStore(db, projectId, getEmbeddingDim(dims, 'docs'));
    this.files = new SqliteFilesStore(db, projectId, getEmbeddingDim(dims, 'files'));
    this.knowledge = new SqliteKnowledgeStore(db, projectId, getEmbeddingDim(dims, 'knowledge'));
    this.tasks = new SqliteTasksStore(db, projectId, getEmbeddingDim(dims, 'tasks'));
    this.epics = new SqliteEpicsStore(db, projectId, getEmbeddingDim(dims, 'epics'));
    this.skills = new SqliteSkillsStore(db, projectId, getEmbeddingDim(dims, 'skills'));
    this.attachments = new SqliteAttachmentsStore(db, projectId);
    this.edgeHelper = new EdgeHelper(db);
  }

  // =========================================================================
  // Edges
  // =========================================================================

  createEdge(edge: Edge): void {
    this.edgeHelper.createEdge(this.projectId, this.projectId, edge);
  }

  createCrossProjectEdge(toProjectId: number, edge: Edge): void {
    this.edgeHelper.createEdge(this.projectId, toProjectId, edge);
  }

  deleteEdge(edge: Edge): void {
    this.edgeHelper.deleteEdge(edge);
  }

  listEdges(filter: EdgeFilter): Edge[] {
    return this.edgeHelper.listEdges({ ...filter, fromProjectId: filter.fromProjectId ?? this.projectId });
  }

  findIncomingEdges(targetGraph: GraphName, targetId: number): Edge[] {
    return this.edgeHelper.findIncomingEdges(targetGraph, targetId);
  }

  findOutgoingEdges(fromGraph: GraphName, fromId: number): Edge[] {
    return this.edgeHelper.findOutgoingEdges(fromGraph, fromId);
  }

  /**
   * Batch-resolve labels (titles / paths / symbol names) for nodes in a given graph.
   * One SQL query per call. Caller is expected to group ids by graph first.
   */
  resolveTitles(graph: GraphName, ids: number[]): Map<number, string> {
    const out = new Map<number, string>();
    if (ids.length === 0) return out;
    // Deduplicate to keep the IN-list minimal.
    const unique = Array.from(new Set(ids));
    const placeholders = unique.map(() => '?').join(',');
    let sql: string;
    switch (graph) {
      case 'knowledge':
      case 'tasks':
      case 'epics':
      case 'skills':
        sql = `SELECT id, title AS label FROM ${graph} WHERE id IN (${placeholders})`;
        break;
      case 'docs':
        // chunks have a title; the file node itself stores its path in file_id with empty title
        sql = `SELECT id, CASE WHEN title <> '' THEN title ELSE file_id END AS label FROM docs WHERE id IN (${placeholders})`;
        break;
      case 'code':
        // symbols have a name; the file node has kind='file' with name = file path
        sql = `SELECT id, name AS label FROM code WHERE id IN (${placeholders})`;
        break;
      case 'files':
        sql = `SELECT id, file_path AS label FROM files WHERE id IN (${placeholders})`;
        break;
      default:
        return out;
    }
    const rows = this.db.prepare(sql).all(...unique) as Array<{ id: number; label: string }>;
    for (const row of rows) {
      if (row.label) out.set(row.id, row.label);
    }
    return out;
  }
}
