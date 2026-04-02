/**
 * StoreManager — thin layer between API (MCP/REST) and Store (SQLite).
 *
 * Handles: embedding generation, file mirror sync, event emission.
 * Does NOT own the store — receives it as dependency.
 * One StoreManager per project.
 */
import { EventEmitter } from 'events';
import type {
  Store,
  ProjectScopedStore,
  NoteCreate,
  NotePatch,
  NoteRecord,
  NoteDetail,
  NoteListOptions,
  TaskCreate,
  TaskPatch,
  TaskRecord,
  TaskDetail,
  TaskListOptions,
  TaskStatus,
  TaskPriority,
  EpicCreate,
  EpicPatch,
  EpicRecord,
  EpicDetail,
  EpicListOptions,
  SkillCreate,
  SkillPatch,
  SkillRecord,
  SkillDetail,
  SkillListOptions,
  Edge,
  EdgeFilter,
  GraphName,
  SearchQuery,
  SearchResult,
  AttachmentMeta,
} from '../store/types';
import {
  mirrorNoteCreate,
  mirrorNoteUpdate,
  mirrorTaskCreate,
  mirrorTaskUpdate,
  mirrorSkillCreate,
  mirrorSkillUpdate,
  mirrorEpicCreate,
  mirrorEpicUpdate,
  mirrorAttachmentEvent,
  writeAttachment,
  deleteAttachment,
  deleteMirrorDir,
} from './file-mirror';
import { createLogger } from './logger';

const log = createLogger('store-manager');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmbedFn = (text: string) => Promise<number[]>;

export interface StoreManagerConfig {
  store: Store;
  projectId: number;
  projectDir: string;
  embedFn: EmbedFn;
  /** Optional event emitter for broadcasting changes (WebSocket, etc.) */
  emitter?: EventEmitter;
}

// ---------------------------------------------------------------------------
// StoreManager
// ---------------------------------------------------------------------------

export class StoreManager {
  readonly store: Store;
  readonly scoped: ProjectScopedStore;
  readonly projectId: number;
  readonly projectDir: string;
  private embedFn: EmbedFn;
  private emitter: EventEmitter;

  constructor(config: StoreManagerConfig) {
    this.store = config.store;
    this.projectId = config.projectId;
    this.projectDir = config.projectDir;
    this.embedFn = config.embedFn;
    this.emitter = config.emitter ?? new EventEmitter();
    this.scoped = config.store.project(config.projectId);
  }

  // =========================================================================
  // Knowledge (Notes)
  // =========================================================================

  async createNote(data: NoteCreate): Promise<NoteRecord> {
    const embedding = await this.embedFn(`${data.title} ${data.content}`);
    const record = this.scoped.knowledge.create(data, embedding);
    mirrorNoteCreate(`${this.projectDir}/.notes`, record.slug, {
      title: record.title, content: record.content, tags: record.tags,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.emit('note:created', { projectId: this.projectId, noteId: record.id });
    return record;
  }

  async updateNote(noteId: number, patch: NotePatch, authorId?: number, expectedVersion?: number): Promise<NoteRecord> {
    const needsEmbed = patch.title !== undefined || patch.content !== undefined;
    let embedding: number[] | null = null;
    if (needsEmbed) {
      const current = this.scoped.knowledge.get(noteId);
      if (!current) throw new Error(`Note ${noteId} not found`);
      const title = patch.title ?? current.title;
      const content = patch.content ?? current.content;
      embedding = await this.embedFn(`${title} ${content}`);
    }
    const record = this.scoped.knowledge.update(noteId, patch, embedding, authorId, expectedVersion);
    mirrorNoteUpdate(`${this.projectDir}/.notes`, record.slug, patch, {
      title: record.title, content: record.content, tags: record.tags,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.emit('note:updated', { projectId: this.projectId, noteId });
    return record;
  }

  deleteNote(noteId: number): void {
    const record = this.scoped.knowledge.get(noteId);
    if (!record) throw new Error(`Note ${noteId} not found`);
    this.scoped.knowledge.delete(noteId);
    deleteMirrorDir(`${this.projectDir}/.notes`, record.slug);
    this.emit('note:deleted', { projectId: this.projectId, noteId });
  }

  getNote(noteId: number): NoteDetail | null {
    return this.scoped.knowledge.get(noteId);
  }

  getNoteBySlug(slug: string): NoteDetail | null {
    return this.scoped.knowledge.getBySlug(slug);
  }

  listNotes(opts?: NoteListOptions) {
    return this.scoped.knowledge.list(opts);
  }

  async searchNotes(query: SearchQuery): Promise<SearchResult[]> {
    if (query.text && !query.embedding) {
      query.embedding = await this.embedFn(query.text);
    }
    return this.scoped.knowledge.search(query);
  }

  // =========================================================================
  // Tasks
  // =========================================================================

  async createTask(data: TaskCreate): Promise<TaskRecord> {
    const embedding = await this.embedFn(`${data.title} ${data.description ?? ''}`);
    const record = this.scoped.tasks.create(data, embedding);
    mirrorTaskCreate(`${this.projectDir}/.tasks`, record.slug, {
      title: record.title, description: record.description,
      status: record.status, priority: record.priority,
      tags: record.tags, order: record.order, assignee: null,
      dueDate: record.dueDate, estimate: record.estimate,
      completedAt: record.completedAt,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.emit('task:created', { projectId: this.projectId, taskId: record.id });
    return record;
  }

  async updateTask(taskId: number, patch: TaskPatch, authorId?: number, expectedVersion?: number): Promise<TaskRecord> {
    const needsEmbed = patch.title !== undefined || patch.description !== undefined;
    let embedding: number[] | null = null;
    if (needsEmbed) {
      const current = this.scoped.tasks.get(taskId);
      if (!current) throw new Error(`Task ${taskId} not found`);
      const title = patch.title ?? current.title;
      const description = patch.description ?? current.description;
      embedding = await this.embedFn(`${title} ${description}`);
    }
    const record = this.scoped.tasks.update(taskId, patch, embedding, authorId, expectedVersion);
    mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, patch, {
      title: record.title, description: record.description,
      status: record.status, priority: record.priority,
      tags: record.tags, order: record.order, assignee: null,
      dueDate: record.dueDate, estimate: record.estimate,
      completedAt: record.completedAt,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.emit('task:updated', { projectId: this.projectId, taskId });
    return record;
  }

  deleteTask(taskId: number): void {
    const record = this.scoped.tasks.get(taskId);
    if (!record) throw new Error(`Task ${taskId} not found`);
    this.scoped.tasks.delete(taskId);
    deleteMirrorDir(`${this.projectDir}/.tasks`, record.slug);
    this.emit('task:deleted', { projectId: this.projectId, taskId });
  }

  moveTask(taskId: number, status: TaskStatus, targetOrder?: number, authorId?: number, expectedVersion?: number): TaskRecord {
    const record = this.scoped.tasks.move(taskId, status, targetOrder, authorId, expectedVersion);
    mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, { status }, {
      title: record.title, description: record.description,
      status: record.status, priority: record.priority,
      tags: record.tags, order: record.order, assignee: null,
      dueDate: record.dueDate, estimate: record.estimate,
      completedAt: record.completedAt,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.emit('task:updated', { projectId: this.projectId, taskId });
    return record;
  }

  reorderTask(taskId: number, order: number, status?: TaskStatus, authorId?: number): TaskRecord {
    return this.scoped.tasks.reorder(taskId, order, status, authorId);
  }

  getTask(taskId: number): TaskDetail | null {
    return this.scoped.tasks.get(taskId);
  }

  getTaskBySlug(slug: string): TaskDetail | null {
    return this.scoped.tasks.getBySlug(slug);
  }

  listTasks(opts?: TaskListOptions) {
    return this.scoped.tasks.list(opts);
  }

  async searchTasks(query: SearchQuery): Promise<SearchResult[]> {
    if (query.text && !query.embedding) {
      query.embedding = await this.embedFn(query.text);
    }
    return this.scoped.tasks.search(query);
  }

  bulkDeleteTasks(taskIds: number[]): number {
    return this.scoped.tasks.bulkDelete(taskIds);
  }

  bulkMoveTasks(taskIds: number[], status: TaskStatus, authorId?: number): number {
    return this.scoped.tasks.bulkMove(taskIds, status, authorId);
  }

  bulkPriorityTasks(taskIds: number[], priority: TaskPriority, authorId?: number): number {
    return this.scoped.tasks.bulkPriority(taskIds, priority, authorId);
  }

  // =========================================================================
  // Epics
  // =========================================================================

  async createEpic(data: EpicCreate): Promise<EpicRecord> {
    const embedding = await this.embedFn(`${data.title} ${data.description ?? ''}`);
    const record = this.scoped.epics.create(data, embedding);
    mirrorEpicCreate(`${this.projectDir}/.epics`, record.slug, {
      title: record.title, description: record.description,
      status: record.status, priority: record.priority,
      tags: record.tags, order: record.order,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.emit('epic:created', { projectId: this.projectId, epicId: record.id });
    return record;
  }

  async updateEpic(epicId: number, patch: EpicPatch, authorId?: number, expectedVersion?: number): Promise<EpicRecord> {
    const needsEmbed = patch.title !== undefined || patch.description !== undefined;
    let embedding: number[] | null = null;
    if (needsEmbed) {
      const current = this.scoped.epics.get(epicId);
      if (!current) throw new Error(`Epic ${epicId} not found`);
      const title = patch.title ?? current.title;
      const description = patch.description ?? current.description;
      embedding = await this.embedFn(`${title} ${description}`);
    }
    const record = this.scoped.epics.update(epicId, patch, embedding, authorId, expectedVersion);
    mirrorEpicUpdate(`${this.projectDir}/.epics`, record.slug, patch, {
      title: record.title, description: record.description,
      status: record.status, priority: record.priority,
      tags: record.tags, order: record.order,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.emit('epic:updated', { projectId: this.projectId, epicId });
    return record;
  }

  deleteEpic(epicId: number): void {
    const record = this.scoped.epics.get(epicId);
    if (!record) throw new Error(`Epic ${epicId} not found`);
    this.scoped.epics.delete(epicId);
    deleteMirrorDir(`${this.projectDir}/.epics`, record.slug);
    this.emit('epic:deleted', { projectId: this.projectId, epicId });
  }

  getEpic(epicId: number): EpicDetail | null {
    return this.scoped.epics.get(epicId);
  }

  listEpics(opts?: EpicListOptions) {
    return this.scoped.epics.list(opts);
  }

  async searchEpics(query: SearchQuery): Promise<SearchResult[]> {
    if (query.text && !query.embedding) {
      query.embedding = await this.embedFn(query.text);
    }
    return this.scoped.epics.search(query);
  }

  linkTaskToEpic(epicId: number, taskId: number): void {
    this.scoped.epics.linkTask(epicId, taskId);
    this.emit('epic:task_linked', { projectId: this.projectId, epicId, taskId });
  }

  unlinkTaskFromEpic(epicId: number, taskId: number): void {
    this.scoped.epics.unlinkTask(epicId, taskId);
    this.emit('epic:task_unlinked', { projectId: this.projectId, epicId, taskId });
  }

  // =========================================================================
  // Skills
  // =========================================================================

  async createSkill(data: SkillCreate): Promise<SkillRecord> {
    const embedding = await this.embedFn(`${data.title} ${data.description ?? ''}`);
    const record = this.scoped.skills.create(data, embedding);
    mirrorSkillCreate(`${this.projectDir}/.skills`, record.slug, {
      title: record.title, description: record.description,
      steps: record.steps, triggers: record.triggers,
      inputHints: record.inputHints, filePatterns: record.filePatterns,
      tags: record.tags, source: record.source, confidence: record.confidence,
      usageCount: record.usageCount, lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.emit('skill:created', { projectId: this.projectId, skillId: record.id });
    return record;
  }

  async updateSkill(skillId: number, patch: SkillPatch, authorId?: number, expectedVersion?: number): Promise<SkillRecord> {
    const needsEmbed = patch.title !== undefined || patch.description !== undefined;
    let embedding: number[] | null = null;
    if (needsEmbed) {
      const current = this.scoped.skills.get(skillId);
      if (!current) throw new Error(`Skill ${skillId} not found`);
      const title = patch.title ?? current.title;
      const description = patch.description ?? current.description;
      embedding = await this.embedFn(`${title} ${description}`);
    }
    const record = this.scoped.skills.update(skillId, patch, embedding, authorId, expectedVersion);
    mirrorSkillUpdate(`${this.projectDir}/.skills`, record.slug, patch, {
      title: record.title, description: record.description,
      steps: record.steps, triggers: record.triggers,
      inputHints: record.inputHints, filePatterns: record.filePatterns,
      tags: record.tags, source: record.source, confidence: record.confidence,
      usageCount: record.usageCount, lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.emit('skill:updated', { projectId: this.projectId, skillId });
    return record;
  }

  deleteSkill(skillId: number): void {
    const record = this.scoped.skills.get(skillId);
    if (!record) throw new Error(`Skill ${skillId} not found`);
    this.scoped.skills.delete(skillId);
    deleteMirrorDir(`${this.projectDir}/.skills`, record.slug);
    this.emit('skill:deleted', { projectId: this.projectId, skillId });
  }

  getSkill(skillId: number): SkillDetail | null {
    return this.scoped.skills.get(skillId);
  }

  listSkills(opts?: SkillListOptions) {
    return this.scoped.skills.list(opts);
  }

  async searchSkills(query: SearchQuery): Promise<SearchResult[]> {
    if (query.text && !query.embedding) {
      query.embedding = await this.embedFn(query.text);
    }
    return this.scoped.skills.search(query);
  }

  bumpSkillUsage(skillId: number): void {
    this.scoped.skills.bumpUsage(skillId);
    this.emit('skill:bumped', { projectId: this.projectId, skillId });
  }

  // =========================================================================
  // Edges (cross-graph and same-graph)
  // =========================================================================

  createEdge(edge: Edge): void {
    this.scoped.createEdge(edge);
    this.emit('edge:created', { projectId: this.projectId, edge });
  }

  deleteEdge(edge: Edge): void {
    this.scoped.deleteEdge(edge);
    this.emit('edge:deleted', { projectId: this.projectId, edge });
  }

  listEdges(filter: EdgeFilter): Edge[] {
    return this.scoped.listEdges(filter);
  }

  findIncomingEdges(targetGraph: GraphName, targetId: number): Edge[] {
    return this.scoped.findIncomingEdges(targetGraph, targetId);
  }

  findOutgoingEdges(fromGraph: GraphName, fromId: number): Edge[] {
    return this.scoped.findOutgoingEdges(fromGraph, fromId);
  }

  // =========================================================================
  // Attachments
  // =========================================================================

  addAttachment(graph: GraphName, entityId: number, entitySlug: string, filename: string, data: Buffer): AttachmentMeta {
    const mirrorBase = this.mirrorDirForGraph(graph);
    writeAttachment(mirrorBase, entitySlug, filename, data);

    const meta: AttachmentMeta = {
      filename,
      mimeType: guessMimeType(filename),
      size: data.length,
      addedAt: Date.now(),
    };
    this.scoped.attachments.add(graph, entityId, meta);
    mirrorAttachmentEvent(`${mirrorBase}/${entitySlug}`, 'add', filename);
    this.emit(`${graph}:attachment:added`, { projectId: this.projectId, entityId, filename });
    return meta;
  }

  removeAttachment(graph: GraphName, entityId: number, entitySlug: string, filename: string): void {
    const mirrorBase = this.mirrorDirForGraph(graph);
    deleteAttachment(mirrorBase, entitySlug, filename);
    this.scoped.attachments.remove(graph, entityId, filename);
    mirrorAttachmentEvent(`${mirrorBase}/${entitySlug}`, 'remove', filename);
    this.emit(`${graph}:attachment:removed`, { projectId: this.projectId, entityId, filename });
  }

  listAttachments(graph: GraphName, entityId: number): AttachmentMeta[] {
    return this.scoped.attachments.list(graph, entityId);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private emit(event: string, data: unknown): void {
    try {
      this.emitter.emit(event, data);
    } catch (err) {
      log.error({ err, event }, 'Event emission error');
    }
  }

  private mirrorDirForGraph(graph: GraphName): string {
    const map: Partial<Record<GraphName, string>> = {
      knowledge: '.notes',
      tasks: '.tasks',
      skills: '.skills',
      epics: '.epics',
    };
    const dir = map[graph];
    if (!dir) throw new Error(`No mirror directory for graph: ${graph}`);
    return `${this.projectDir}/${dir}`;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', pdf: 'application/pdf', json: 'application/json',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    html: 'text/html', xml: 'application/xml', zip: 'application/zip',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}
