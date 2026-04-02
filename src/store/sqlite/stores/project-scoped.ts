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

  constructor(db: Database.Database, readonly projectId: number, dims?: EmbeddingDims) {
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
}
