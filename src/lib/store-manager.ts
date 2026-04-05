/**
 * StoreManager — thin layer between API (MCP/REST) and Store (SQLite).
 *
 * Handles: embedding generation, file mirror sync, event emission.
 * Does NOT own the store — receives it as dependency.
 * One StoreManager per project.
 */
import { EventEmitter } from 'events';
import path from 'path';
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
import type { ParsedNoteFile, ParsedTaskFile, ParsedSkillFile } from './file-import';
import type { RelationFrontmatter } from './file-mirror';
import { diffRelations } from './file-import';
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
  getAttachmentPath as getAttPath,
} from './file-mirror';
import { scanAttachments } from '../graphs/attachment-types';
import type { MirrorWriteTracker } from './mirror-watcher';
import { createLogger } from './logger';
import mime from 'mime';

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
  private mirrorTracker?: MirrorWriteTracker;

  constructor(config: StoreManagerConfig) {
    this.store = config.store;
    this.projectId = config.projectId;
    this.projectDir = config.projectDir;
    this.embedFn = config.embedFn;
    this.emitter = config.emitter ?? new EventEmitter();
    this.scoped = config.store.project(config.projectId);
  }

  setMirrorTracker(tracker: MirrorWriteTracker): void {
    this.mirrorTracker = tracker;
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
    this.recordNoteMirrorWrites(record.slug);
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
    this.recordNoteMirrorWrites(record.slug);
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
    this.recordTaskMirrorWrites(record.slug);
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
    this.recordTaskMirrorWrites(record.slug);
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
    this.recordTaskMirrorWrites(record.slug);
    this.emit('task:updated', { projectId: this.projectId, taskId });
    return record;
  }

  reorderTask(taskId: number, order: number, status?: TaskStatus, authorId?: number): TaskRecord {
    const record = this.scoped.tasks.reorder(taskId, order, status, authorId);
    const patch: TaskPatch = { order };
    if (status) patch.status = status;
    mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, patch, {
      title: record.title, description: record.description,
      status: record.status, priority: record.priority,
      tags: record.tags, order: record.order, assignee: null,
      dueDate: record.dueDate, estimate: record.estimate,
      completedAt: record.completedAt,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    }, []);
    this.recordTaskMirrorWrites(record.slug);
    this.emit('task:updated', { projectId: this.projectId, taskId });
    return record;
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
    const slugs = taskIds
      .map(id => this.scoped.tasks.get(id))
      .filter((t): t is TaskDetail => t !== null)
      .map(t => t.slug);

    const count = this.scoped.tasks.bulkDelete(taskIds);

    for (const slug of slugs) {
      deleteMirrorDir(`${this.projectDir}/.tasks`, slug);
    }
    this.emit('task:bulk_deleted', { projectId: this.projectId, taskIds, count });
    return count;
  }

  bulkMoveTasks(taskIds: number[], status: TaskStatus, authorId?: number): number {
    const count = this.scoped.tasks.bulkMove(taskIds, status, authorId);

    for (const id of taskIds) {
      const record = this.scoped.tasks.get(id);
      if (!record) continue;
      mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, { status }, {
        title: record.title, description: record.description,
        status: record.status, priority: record.priority,
        tags: record.tags, order: record.order, assignee: null,
        dueDate: record.dueDate, estimate: record.estimate,
        completedAt: record.completedAt,
        createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
      }, []);
      this.recordTaskMirrorWrites(record.slug);
    }
    this.emit('task:bulk_moved', { projectId: this.projectId, taskIds, status, count });
    return count;
  }

  bulkPriorityTasks(taskIds: number[], priority: TaskPriority, authorId?: number): number {
    const count = this.scoped.tasks.bulkPriority(taskIds, priority, authorId);

    for (const id of taskIds) {
      const record = this.scoped.tasks.get(id);
      if (!record) continue;
      mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, { priority }, {
        title: record.title, description: record.description,
        status: record.status, priority: record.priority,
        tags: record.tags, order: record.order, assignee: null,
        dueDate: record.dueDate, estimate: record.estimate,
        completedAt: record.completedAt,
        createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
      }, []);
      this.recordTaskMirrorWrites(record.slug);
    }
    this.emit('task:bulk_priority', { projectId: this.projectId, taskIds, priority, count });
    return count;
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
    this.recordEpicMirrorWrites(record.slug);
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
    this.recordEpicMirrorWrites(record.slug);
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

  getEpicBySlug(slug: string): EpicDetail | null {
    return this.scoped.epics.getBySlug(slug);
  }

  listEpicTasks(epicId: number): TaskRecord[] {
    const taskIds = this.scoped.epics.listTasks(epicId);
    return taskIds
      .map(id => this.scoped.tasks.get(id))
      .filter((t): t is TaskDetail => t !== null);
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
    this.recordSkillMirrorWrites(record.slug);
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
    this.recordSkillMirrorWrites(record.slug);
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

  getSkillBySlug(slug: string): SkillDetail | null {
    return this.scoped.skills.getBySlug(slug);
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
      mimeType: mime.getType(filename) ?? 'application/octet-stream',
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

  getAttachmentPath(graph: GraphName, entitySlug: string, filename: string): string | null {
    const mirrorBase = this.mirrorDirForGraph(graph);
    return getAttPath(mirrorBase, entitySlug, filename);
  }

  // =========================================================================
  // Mirror import (file → Store, used by mirror-watcher)
  // =========================================================================

  /** Upsert a note from parsed mirror file. Re-embeds, syncs edges. */
  async importNoteFromFile(parsed: ParsedNoteFile): Promise<void> {
    const existing = this.scoped.knowledge.getBySlug(parsed.id);
    const embedding = await this.embedFn(`${parsed.title} ${parsed.content}`);

    let record: NoteRecord;
    if (existing) {
      record = this.scoped.knowledge.update(existing.id, {
        title: parsed.title,
        content: parsed.content,
        tags: parsed.tags,
      }, embedding);
    } else {
      record = this.scoped.knowledge.create({
        title: parsed.title,
        content: parsed.content,
        tags: parsed.tags,
        slug: parsed.id,
        createdAt: parsed.createdAt ?? undefined,
        updatedAt: parsed.updatedAt ?? undefined,
        version: parsed.version ?? undefined,
      }, embedding);
    }

    this.syncEdgesFromFile('knowledge', record.id, parsed.relations);
    this.syncAttachmentsFromParsed('knowledge', record.id, parsed.attachments);
    this.emit(existing ? 'note:updated' : 'note:created', { projectId: this.projectId, noteId: record.id });
  }

  /** Upsert a task from parsed mirror file. Re-embeds, syncs edges. */
  async importTaskFromFile(parsed: ParsedTaskFile): Promise<void> {
    const existing = this.scoped.tasks.getBySlug(parsed.id);
    const embedding = await this.embedFn(`${parsed.title} ${parsed.description}`);

    let record: TaskRecord;
    if (existing) {
      record = this.scoped.tasks.update(existing.id, {
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        priority: parsed.priority,
        tags: parsed.tags,
        dueDate: parsed.dueDate,
        estimate: parsed.estimate,
        completedAt: parsed.completedAt,
      }, embedding);
    } else {
      record = this.scoped.tasks.create({
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        priority: parsed.priority,
        tags: parsed.tags,
        dueDate: parsed.dueDate,
        estimate: parsed.estimate,
        completedAt: parsed.completedAt,
        slug: parsed.id,
        createdAt: parsed.createdAt ?? undefined,
        updatedAt: parsed.updatedAt ?? undefined,
        version: parsed.version ?? undefined,
      }, embedding);
    }

    this.syncEdgesFromFile('tasks', record.id, parsed.relations);
    this.syncAttachmentsFromParsed('tasks', record.id, parsed.attachments);
    this.emit(existing ? 'task:updated' : 'task:created', { projectId: this.projectId, taskId: record.id });
  }

  /** Upsert a skill from parsed mirror file. Re-embeds, syncs edges. */
  async importSkillFromFile(parsed: ParsedSkillFile): Promise<void> {
    const existing = this.scoped.skills.getBySlug(parsed.id);
    const embedding = await this.embedFn(`${parsed.title} ${parsed.description}`);

    let record: SkillRecord;
    if (existing) {
      record = this.scoped.skills.update(existing.id, {
        title: parsed.title,
        description: parsed.description,
        steps: parsed.steps,
        triggers: parsed.triggers,
        inputHints: parsed.inputHints,
        filePatterns: parsed.filePatterns,
        tags: parsed.tags,
        source: parsed.source,
        confidence: parsed.confidence,
      }, embedding);
    } else {
      record = this.scoped.skills.create({
        title: parsed.title,
        description: parsed.description,
        steps: parsed.steps,
        triggers: parsed.triggers,
        inputHints: parsed.inputHints,
        filePatterns: parsed.filePatterns,
        tags: parsed.tags,
        source: parsed.source,
        confidence: parsed.confidence,
        usageCount: parsed.usageCount ?? undefined,
        lastUsedAt: parsed.lastUsedAt,
        slug: parsed.id,
        createdAt: parsed.createdAt ?? undefined,
        updatedAt: parsed.updatedAt ?? undefined,
        version: parsed.version ?? undefined,
      }, embedding);
    }

    this.syncEdgesFromFile('skills', record.id, parsed.relations);
    this.syncAttachmentsFromParsed('skills', record.id, parsed.attachments);
    this.emit(existing ? 'skill:updated' : 'skill:created', { projectId: this.projectId, skillId: record.id });
  }

  /** Delete an entity by its slug (mirror directory name). */
  deleteNoteBySlug(slug: string): void {
    const record = this.scoped.knowledge.getBySlug(slug);
    if (!record) return;
    this.scoped.knowledge.delete(record.id);
    this.emit('note:deleted', { projectId: this.projectId, noteId: record.id });
  }

  deleteTaskBySlug(slug: string): void {
    const record = this.scoped.tasks.getBySlug(slug);
    if (!record) return;
    this.scoped.tasks.delete(record.id);
    this.emit('task:deleted', { projectId: this.projectId, taskId: record.id });
  }

  deleteSkillBySlug(slug: string): void {
    const record = this.scoped.skills.getBySlug(slug);
    if (!record) return;
    this.scoped.skills.delete(record.id);
    this.emit('skill:deleted', { projectId: this.projectId, skillId: record.id });
  }

  /** Get updatedAt timestamp for an entity by slug. Returns null if not found. */
  getNoteUpdatedAt(slug: string): number | null {
    return this.scoped.knowledge.getBySlug(slug)?.updatedAt ?? null;
  }

  getTaskUpdatedAt(slug: string): number | null {
    return this.scoped.tasks.getBySlug(slug)?.updatedAt ?? null;
  }

  getSkillUpdatedAt(slug: string): number | null {
    return this.scoped.skills.getBySlug(slug)?.updatedAt ?? null;
  }

  /** Sync attachment metadata from disk for an entity identified by slug. */
  syncNoteAttachments(slug: string): void {
    const record = this.scoped.knowledge.getBySlug(slug);
    if (!record) return;
    const attachments = scanAttachments(path.join(this.projectDir, '.notes', slug));
    this.syncAttachmentsFromParsed('knowledge', record.id, attachments);
  }

  syncTaskAttachments(slug: string): void {
    const record = this.scoped.tasks.getBySlug(slug);
    if (!record) return;
    const attachments = scanAttachments(path.join(this.projectDir, '.tasks', slug));
    this.syncAttachmentsFromParsed('tasks', record.id, attachments);
  }

  syncSkillAttachments(slug: string): void {
    const record = this.scoped.skills.getBySlug(slug);
    if (!record) return;
    const attachments = scanAttachments(path.join(this.projectDir, '.skills', slug));
    this.syncAttachmentsFromParsed('skills', record.id, attachments);
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

  // -- Mirror write tracker helpers --

  private recordNoteMirrorWrites(slug: string): void {
    if (!this.mirrorTracker) return;
    const dir = path.join(this.projectDir, '.notes', slug);
    this.mirrorTracker.recordWrite(path.join(dir, 'events.jsonl'));
    this.mirrorTracker.recordWrite(path.join(dir, 'note.md'));
    this.mirrorTracker.recordWrite(path.join(dir, 'content.md'));
  }

  private recordTaskMirrorWrites(slug: string): void {
    if (!this.mirrorTracker) return;
    const dir = path.join(this.projectDir, '.tasks', slug);
    this.mirrorTracker.recordWrite(path.join(dir, 'events.jsonl'));
    this.mirrorTracker.recordWrite(path.join(dir, 'task.md'));
    this.mirrorTracker.recordWrite(path.join(dir, 'description.md'));
  }

  private recordSkillMirrorWrites(slug: string): void {
    if (!this.mirrorTracker) return;
    const dir = path.join(this.projectDir, '.skills', slug);
    this.mirrorTracker.recordWrite(path.join(dir, 'events.jsonl'));
    this.mirrorTracker.recordWrite(path.join(dir, 'skill.md'));
    this.mirrorTracker.recordWrite(path.join(dir, 'description.md'));
  }

  private recordEpicMirrorWrites(slug: string): void {
    if (!this.mirrorTracker) return;
    const dir = path.join(this.projectDir, '.epics', slug);
    this.mirrorTracker.recordWrite(path.join(dir, 'events.jsonl'));
    this.mirrorTracker.recordWrite(path.join(dir, 'epic.md'));
    this.mirrorTracker.recordWrite(path.join(dir, 'description.md'));
  }

  // -- Edge sync from file relations --

  /**
   * Sync edges for an entity based on parsed file relations.
   * Resolves target slugs to numeric IDs, diffs current vs desired, creates/deletes.
   */
  private syncEdgesFromFile(fromGraph: GraphName, fromId: number, desired: RelationFrontmatter[]): void {
    // Build current outgoing edges as RelationFrontmatter for diffing
    const currentEdges = this.scoped.findOutgoingEdges(fromGraph, fromId);
    const current: RelationFrontmatter[] = [];
    for (const edge of currentEdges) {
      const slug = this.resolveIdToSlug(edge.toGraph, edge.toId);
      if (!slug) continue;
      const rel: RelationFrontmatter = { to: slug, kind: edge.kind };
      if (edge.toGraph !== fromGraph) rel.graph = edge.toGraph;
      current.push(rel);
    }

    const diff = diffRelations(current, desired);

    for (const rel of diff.toRemove) {
      const targetGraph = (rel.graph ?? fromGraph) as GraphName;
      const targetId = this.resolveSlugToId(targetGraph, rel.to);
      if (targetId == null) continue;
      try {
        this.scoped.deleteEdge({ fromGraph, fromId, toGraph: targetGraph, toId: targetId, kind: rel.kind });
      } catch { /* edge may not exist */ }
    }

    for (const rel of diff.toAdd) {
      const targetGraph = (rel.graph ?? fromGraph) as GraphName;
      const targetId = this.resolveSlugToId(targetGraph, rel.to);
      if (targetId == null) continue;
      try {
        this.scoped.createEdge({ fromGraph, fromId, toGraph: targetGraph, toId: targetId, kind: rel.kind });
      } catch { /* edge may already exist */ }
    }
  }

  /** Resolve a slug to a numeric ID in a given graph. */
  private resolveSlugToId(graph: GraphName, slug: string): number | null {
    switch (graph) {
      case 'knowledge': return this.scoped.knowledge.getBySlug(slug)?.id ?? null;
      case 'tasks':     return this.scoped.tasks.getBySlug(slug)?.id ?? null;
      case 'skills':    return this.scoped.skills.getBySlug(slug)?.id ?? null;
      case 'epics':     return this.scoped.epics.getBySlug(slug)?.id ?? null;
      default:          return null; // indexed graphs not resolvable by slug
    }
  }

  /** Resolve a numeric ID to a slug in a given graph. */
  private resolveIdToSlug(graph: GraphName, id: number): string | null {
    switch (graph) {
      case 'knowledge': return this.scoped.knowledge.get(id)?.slug ?? null;
      case 'tasks':     return this.scoped.tasks.get(id)?.slug ?? null;
      case 'skills':    return this.scoped.skills.get(id)?.slug ?? null;
      case 'epics':     return this.scoped.epics.get(id)?.slug ?? null;
      default:          return null;
    }
  }

  // -- Attachment sync from parsed file --

  /**
   * Replace all attachment metadata for an entity with the given list.
   * Removes stale entries, adds new ones.
   */
  private syncAttachmentsFromParsed(graph: GraphName, entityId: number, attachments: AttachmentMeta[]): void {
    const current = this.scoped.attachments.list(graph, entityId);
    const currentNames = new Set(current.map(a => a.filename));
    const desiredNames = new Set(attachments.map(a => a.filename));

    for (const name of currentNames) {
      if (!desiredNames.has(name)) {
        this.scoped.attachments.remove(graph, entityId, name);
      }
    }
    for (const att of attachments) {
      if (!currentNames.has(att.filename)) {
        this.scoped.attachments.add(graph, entityId, att);
      }
    }
  }
}

