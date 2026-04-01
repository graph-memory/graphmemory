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
} from '../../types';
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

  constructor(db: Database.Database, readonly projectId: number) {
    this.code = new SqliteCodeStore(db, projectId);
    this.docs = new SqliteDocsStore(db, projectId);
    this.files = new SqliteFilesStore(db, projectId);
    this.knowledge = new SqliteKnowledgeStore(db, projectId);
    this.tasks = new SqliteTasksStore(db, projectId);
    this.epics = new SqliteEpicsStore(db, projectId);
    this.skills = new SqliteSkillsStore(db, projectId);
    this.attachments = new SqliteAttachmentsStore(db, projectId);
    this.edgeHelper = new EdgeHelper(db);
  }

  // =========================================================================
  // Edges
  // =========================================================================

  createEdge(edge: Edge): void {
    this.edgeHelper.createEdge(this.projectId, edge);
  }

  deleteEdge(edge: Edge): void {
    this.edgeHelper.deleteEdge(this.projectId, edge);
  }

  listEdges(filter: EdgeFilter): Edge[] {
    return this.edgeHelper.listEdges({ ...filter, projectId: this.projectId });
  }

  findIncomingEdges(targetGraph: GraphName, targetId: number): Edge[] {
    return this.edgeHelper.findIncomingEdges(targetGraph, targetId, this.projectId);
  }

  findOutgoingEdges(fromGraph: GraphName, fromId: number): Edge[] {
    return this.edgeHelper.findOutgoingEdges(fromGraph, fromId, this.projectId);
  }
}
