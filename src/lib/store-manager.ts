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
import type { ParsedNoteFile, ParsedTaskFile, ParsedSkillFile, ParsedEpicFile } from './file-import';
import type { RelationFrontmatter } from './file-mirror';
import { diffRelations } from './file-import';
import {
  mirrorNoteCreate,
  mirrorNoteUpdate,
  mirrorNoteRelation,
  mirrorTaskCreate,
  mirrorTaskUpdate,
  mirrorTaskRelation,
  mirrorSkillCreate,
  mirrorSkillUpdate,
  mirrorSkillRelation,
  mirrorEpicCreate,
  mirrorEpicUpdate,
  mirrorEpicRelation,
  mirrorAttachmentEvent,
  writeAttachment,
  deleteAttachment,
  deleteMirrorDir,
  getAttachmentPath as getAttPath,
  type RelationLike,
} from './file-mirror';
import { scanAttachments } from './attachment-types';
import type { MirrorWriteTracker } from './mirror-watcher';
import { createLogger } from './logger';
import mime from 'mime';

const log = createLogger('store-manager');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Maps an entity graph name to the singular event prefix used by WebSocket
 * subscribers and UI consumers (which filter by `event.type.startsWith('note:')`
 * etc., not by the graph name). Used for relation and attachment sub-events.
 */
const ENTITY_EVENT_PREFIX: Partial<Record<GraphName, string>> = {
  knowledge: 'note',
  tasks: 'task',
  skills: 'skill',
};

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
  scoped: ProjectScopedStore;
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

  /** Re-fetch the scoped store from the parent store (e.g. after embedding dims change). */
  refreshScoped(): void {
    this.scoped = this.store.project(this.projectId);
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
    }, this.buildOutgoingForMirror('knowledge', record.id, record.slug));
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
    }, this.buildOutgoingForMirror('knowledge', record.id, record.slug));
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

  /**
   * Build the TaskAttrs object passed to mirrorTaskCreate/mirrorTaskUpdate.
   * Resolves the numeric `assigneeId` to a human-readable team-member slug for
   * the markdown frontmatter — falls back to `null` when the team_members row
   * has been removed (orphaned assignment).
   */
  private buildMirrorTaskAttrs(record: TaskRecord) {
    let assignee: string | null = null;
    if (record.assigneeId != null) {
      assignee = this.store.team.get(record.assigneeId)?.slug ?? null;
    }
    return {
      title: record.title, description: record.description,
      status: record.status, priority: record.priority,
      tags: record.tags, order: record.order, assignee,
      dueDate: record.dueDate, estimate: record.estimate,
      completedAt: record.completedAt,
      createdAt: record.createdAt, updatedAt: record.updatedAt, version: record.version,
    };
  }

  async createTask(data: TaskCreate): Promise<TaskRecord> {
    const embedding = await this.embedFn(`${data.title} ${data.description ?? ''}`);
    const record = this.scoped.tasks.create(data, embedding);
    mirrorTaskCreate(`${this.projectDir}/.tasks`, record.slug, this.buildMirrorTaskAttrs(record), this.buildOutgoingForMirror('tasks', record.id, record.slug));
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
    mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, patch, this.buildMirrorTaskAttrs(record), this.buildOutgoingForMirror('tasks', record.id, record.slug));
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
    mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, { status }, this.buildMirrorTaskAttrs(record), this.buildOutgoingForMirror('tasks', record.id, record.slug));
    this.recordTaskMirrorWrites(record.slug);
    this.emit('task:updated', { projectId: this.projectId, taskId });
    this.emit('task:moved', { projectId: this.projectId, taskId, status });
    return record;
  }

  reorderTask(taskId: number, order: number, status?: TaskStatus, authorId?: number): TaskRecord {
    const record = this.scoped.tasks.reorder(taskId, order, status, authorId);
    const patch: TaskPatch = { order };
    if (status) patch.status = status;
    mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, patch, this.buildMirrorTaskAttrs(record), this.buildOutgoingForMirror('tasks', record.id, record.slug));
    this.recordTaskMirrorWrites(record.slug);
    this.emit('task:updated', { projectId: this.projectId, taskId });
    this.emit('task:reordered', { projectId: this.projectId, taskId, order });
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
      mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, { status }, this.buildMirrorTaskAttrs(record), this.buildOutgoingForMirror('tasks', record.id, record.slug));
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
      mirrorTaskUpdate(`${this.projectDir}/.tasks`, record.slug, { priority }, this.buildMirrorTaskAttrs(record), this.buildOutgoingForMirror('tasks', record.id, record.slug));
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
    }, this.buildOutgoingForMirror('epics', record.id, record.slug));
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
    }, this.buildOutgoingForMirror('epics', record.id, record.slug));
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
    this.emit('epic:linked', { projectId: this.projectId, epicId, taskId });
  }

  unlinkTaskFromEpic(epicId: number, taskId: number): void {
    this.scoped.epics.unlinkTask(epicId, taskId);
    this.emit('epic:unlinked', { projectId: this.projectId, epicId, taskId });
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
    }, this.buildOutgoingForMirror('skills', record.id, record.slug));
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
    }, this.buildOutgoingForMirror('skills', record.id, record.slug));
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
    // Resolve the actual project that owns the target node — for cross-project
    // edges (e.g. shared knowledge → project-scoped code), the target can live
    // in a different project than the source. Without this lookup, to_project_id
    // would inherit from the source and the UI couldn't navigate cross-project.
    const toProjectId = this.scoped.resolveNodeProjectId(edge.toGraph, edge.toId);
    if (toProjectId !== null && toProjectId !== this.scoped.projectId) {
      this.scoped.createCrossProjectEdge(toProjectId, edge);
    } else {
      this.scoped.createEdge(edge);
    }
    // Mirror the new edge into the source-side entity's markdown file so the
    // file frontmatter stays in sync with SQLite.
    this.mirrorRelationEvent('add', edge);
    // Per-graph relation event for entity graphs so WebSocket clients (which
    // subscribe to singular `note:` / `task:` / `skill:` prefixes) get notified.
    const prefix = ENTITY_EVENT_PREFIX[edge.fromGraph];
    if (prefix) {
      this.emit(`${prefix}:relation:added`, { projectId: this.projectId, edge });
    }
  }

  deleteEdge(edge: Edge): void {
    this.scoped.deleteEdge(edge);
    this.mirrorRelationEvent('remove', edge);
    const prefix = ENTITY_EVENT_PREFIX[edge.fromGraph];
    if (prefix) {
      this.emit(`${prefix}:relation:deleted`, { projectId: this.projectId, edge });
    }
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

  resolveTitles(graph: GraphName, ids: number[]): Map<number, string> {
    return this.scoped.resolveTitles(graph, ids);
  }

  /**
   * Take a list of edges and return them enriched with the "other end" view
   * relative to a queried entity: targetGraph, targetId, title, direction.
   * Titles are batch-resolved per graph (one SQL query per distinct graph).
   *
   * Auto-managed `kind: 'tagged'` edges from the `tags` graph are filtered out:
   * tags already render in their own sidebar section, and surfacing them in
   * the Relations panel just clutters it with one row per tag. The raw edges
   * remain available via MCP notes_list_links / tasks_list_links / etc. for
   * LLM agents that want the full graph.
   */
  enrichRelations(
    entityGraph: GraphName,
    entityId: number,
    edges: Edge[],
  ): Array<Edge & {
    targetGraph: GraphName;
    targetId: number;
    targetProjectSlug?: string;
    title: string;
    direction: 'out' | 'in';
  }> {
    // Drop auto-tagged edges before enrichment.
    const userEdges = edges.filter(e => !(e.kind === 'tagged' && (e.fromGraph === 'tags' || e.toGraph === 'tags')));
    // Group target ids by their graph so we can batch-resolve titles.
    const idsByGraph = new Map<GraphName, number[]>();
    const view = userEdges.map(e => {
      const isOutgoing = e.fromGraph === entityGraph && e.fromId === entityId;
      const targetGraph: GraphName = isOutgoing ? e.toGraph : e.fromGraph;
      const targetId = isOutgoing ? e.toId : e.fromId;
      const targetProjectId = isOutgoing ? e.toProjectId : e.fromProjectId;
      if (!idsByGraph.has(targetGraph)) idsByGraph.set(targetGraph, []);
      idsByGraph.get(targetGraph)!.push(targetId);
      return {
        edge: e,
        targetGraph,
        targetId,
        targetProjectId,
        direction: (isOutgoing ? 'out' : 'in') as 'out' | 'in',
      };
    });
    const titles = new Map<GraphName, Map<number, string>>();
    for (const [g, ids] of idsByGraph) {
      titles.set(g, this.scoped.resolveTitles(g, ids));
    }
    // Resolve project ids → slugs only when the target lives in a *different*
    // project than the current scoped store. Same-project (including workspace-
    // shared graphs where every node has project_id = workspace root) leaves
    // targetProjectSlug undefined so the UI falls back to whatever project is
    // already in the URL — that's important because the synthetic workspace
    // root project (e.g. slug 'backend') is not a navigable project in the
    // multi-config: only its real members like 'api-gateway' / 'catalog-service'
    // are exposed.
    const currentProjectId = this.scoped.projectId;
    const projectSlugCache = new Map<number, string | undefined>();
    const resolveTargetProjectSlug = (id: number | undefined): string | undefined => {
      if (id === undefined || id === currentProjectId) return undefined;
      if (projectSlugCache.has(id)) return projectSlugCache.get(id);
      const slug = this.store.projects.get(id)?.slug;
      projectSlugCache.set(id, slug);
      return slug;
    };
    return view.map(v => ({
      ...v.edge,
      targetGraph: v.targetGraph,
      targetId: v.targetId,
      targetProjectSlug: resolveTargetProjectSlug(v.targetProjectId),
      title: titles.get(v.targetGraph)?.get(v.targetId) ?? String(v.targetId),
      direction: v.direction,
    }));
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
    const prefix = ENTITY_EVENT_PREFIX[graph];
    if (prefix) {
      this.emit(`${prefix}:attachment:added`, { projectId: this.projectId, entityId, filename });
    }
    return meta;
  }

  removeAttachment(graph: GraphName, entityId: number, entitySlug: string, filename: string): void {
    const mirrorBase = this.mirrorDirForGraph(graph);
    deleteAttachment(mirrorBase, entitySlug, filename);
    this.scoped.attachments.remove(graph, entityId, filename);
    mirrorAttachmentEvent(`${mirrorBase}/${entitySlug}`, 'remove', filename);
    const prefix = ENTITY_EVENT_PREFIX[graph];
    if (prefix) {
      this.emit(`${prefix}:attachment:deleted`, { projectId: this.projectId, entityId, filename });
    }
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

    // Resolve frontmatter `assignee: <slug>` → numeric team_members.id.
    // Unknown slug → null (orphaned mirror file references a member that no
    // longer exists). Empty string from frontmatter is also treated as unset.
    let assigneeId: number | null = null;
    if (parsed.assignee) {
      assigneeId = this.store.team.getBySlug(parsed.assignee)?.id ?? null;
    }

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
        assigneeId,
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
        assigneeId: assigneeId ?? undefined,
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

  /** Upsert an epic from parsed mirror file. Re-embeds, syncs edges. */
  async importEpicFromFile(parsed: ParsedEpicFile): Promise<void> {
    const existing = this.scoped.epics.getBySlug(parsed.id);
    const embedding = await this.embedFn(`${parsed.title} ${parsed.description}`);

    let record: EpicRecord;
    if (existing) {
      record = this.scoped.epics.update(existing.id, {
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        priority: parsed.priority,
        tags: parsed.tags,
      }, embedding);
    } else {
      record = this.scoped.epics.create({
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        priority: parsed.priority,
        tags: parsed.tags,
        slug: parsed.id,
        createdAt: parsed.createdAt ?? undefined,
        updatedAt: parsed.updatedAt ?? undefined,
        version: parsed.version ?? undefined,
      }, embedding);
    }

    this.syncEdgesFromFile('epics', record.id, parsed.relations);
    this.syncAttachmentsFromParsed('epics', record.id, parsed.attachments);
    this.emit(existing ? 'epic:updated' : 'epic:created', { projectId: this.projectId, epicId: record.id });
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

  deleteEpicBySlug(slug: string): void {
    const record = this.scoped.epics.getBySlug(slug);
    if (!record) return;
    this.scoped.epics.delete(record.id);
    this.emit('epic:deleted', { projectId: this.projectId, epicId: record.id });
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

  getEpicUpdatedAt(slug: string): number | null {
    return this.scoped.epics.getBySlug(slug)?.updatedAt ?? null;
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

  syncEpicAttachments(slug: string): void {
    const record = this.scoped.epics.getBySlug(slug);
    if (!record) return;
    const attachments = scanAttachments(path.join(this.projectDir, '.epics', slug));
    this.syncAttachmentsFromParsed('epics', record.id, attachments);
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
   * Build the slug-based outgoing-relations list for an entity, used to feed
   * the mirror file frontmatter. One SQL query (findOutgoingEdges) plus one
   * resolveIdToSlug per edge — typical entities have <10 edges so this is cheap.
   * Indexed-graph targets (docs/code/files) are skipped because they have no slug.
   */
  private buildOutgoingForMirror(graph: GraphName, fromId: number, fromSlug: string): RelationLike[] {
    const edges = this.scoped.findOutgoingEdges(graph, fromId);
    const out: RelationLike[] = [];
    for (const edge of edges) {
      const targetSlug = this.resolveIdToSlug(edge.toGraph, edge.toId);
      if (!targetSlug) continue;
      out.push({
        fromId: fromSlug,
        toId: targetSlug,
        kind: edge.kind,
        targetGraph: edge.toGraph !== graph ? edge.toGraph : undefined,
      });
    }
    return out;
  }

  /**
   * Mirror an edge add/remove event to the source-side entity's markdown file.
   * Appends the event to events.jsonl and regenerates the snapshot frontmatter
   * so `relations:` reflects current state. Only entity graphs (knowledge,
   * tasks, skills, epics) have mirror files; edges where the source is an
   * indexed graph are not mirrored.
   */
  private mirrorRelationEvent(action: 'add' | 'remove', edge: Edge, by?: string): void {
    const targetSlug = this.resolveIdToSlug(edge.toGraph, edge.toId);
    if (!targetSlug) return; // target is in an indexed graph — can't represent as slug
    const targetGraphField = edge.toGraph !== edge.fromGraph ? edge.toGraph : undefined;

    if (edge.fromGraph === 'knowledge') {
      const note = this.scoped.knowledge.get(edge.fromId);
      if (!note) return;
      const attrs = {
        title: note.title, content: note.content, tags: note.tags,
        createdAt: note.createdAt, updatedAt: note.updatedAt, version: note.version,
      };
      const relations = this.buildOutgoingForMirror('knowledge', note.id, note.slug);
      mirrorNoteRelation(`${this.projectDir}/.notes`, note.slug, action, edge.kind, targetSlug, attrs, relations, targetGraphField, by);
      this.recordNoteMirrorWrites(note.slug);
    } else if (edge.fromGraph === 'tasks') {
      const task = this.scoped.tasks.get(edge.fromId);
      if (!task) return;
      const attrs = this.buildMirrorTaskAttrs(task);
      const relations = this.buildOutgoingForMirror('tasks', task.id, task.slug);
      mirrorTaskRelation(`${this.projectDir}/.tasks`, task.slug, action, edge.kind, targetSlug, attrs, relations, targetGraphField, by);
      this.recordTaskMirrorWrites(task.slug);
    } else if (edge.fromGraph === 'skills') {
      const skill = this.scoped.skills.get(edge.fromId);
      if (!skill) return;
      const attrs = {
        title: skill.title, description: skill.description,
        steps: skill.steps, triggers: skill.triggers,
        inputHints: skill.inputHints, filePatterns: skill.filePatterns,
        tags: skill.tags, source: skill.source, confidence: skill.confidence,
        usageCount: skill.usageCount, lastUsedAt: skill.lastUsedAt,
        createdAt: skill.createdAt, updatedAt: skill.updatedAt, version: skill.version,
      };
      const relations = this.buildOutgoingForMirror('skills', skill.id, skill.slug);
      mirrorSkillRelation(`${this.projectDir}/.skills`, skill.slug, action, edge.kind, targetSlug, attrs, relations, targetGraphField, by);
      this.recordSkillMirrorWrites(skill.slug);
    } else if (edge.fromGraph === 'epics') {
      const epic = this.scoped.epics.get(edge.fromId);
      if (!epic) return;
      const attrs = {
        title: epic.title, description: epic.description,
        status: epic.status, priority: epic.priority,
        tags: epic.tags, order: epic.order,
        createdAt: epic.createdAt, updatedAt: epic.updatedAt, version: epic.version,
      };
      const relations = this.buildOutgoingForMirror('epics', epic.id, epic.slug);
      mirrorEpicRelation(`${this.projectDir}/.epics`, epic.slug, action, edge.kind, targetSlug, attrs, relations, targetGraphField, by);
      this.recordEpicMirrorWrites(epic.slug);
    }
  }

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

