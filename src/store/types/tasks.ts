import type { CrossLink, MetaMixin, PaginationOptions, Relation, SearchQuery, SearchResult } from './common';
import type { AttachmentMeta } from './attachments';

// ---------------------------------------------------------------------------
// Task Store (user-managed)
// ---------------------------------------------------------------------------

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type EpicStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export interface TaskCreate {
  title: string;
  description: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: number | null;
  estimate?: number | null;
  assigneeId?: number | null;
  order?: number;
  authorId?: number;
}

export interface TaskPatch {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: number | null;
  estimate?: number | null;
  assigneeId?: number | null;
  completedAt?: number | null;
  order?: number;
}

export interface TaskRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  order: number;
  dueDate: number | null;
  estimate: number | null;
  completedAt: number | null;
  assigneeId: number | null;
  attachments: AttachmentMeta[];
  createdAt: number;
  updatedAt: number;
  version: number;
  createdById: number | null;
  updatedById: number | null;
}

export interface TaskDetail extends TaskRecord {
  subtasks: Relation[];
  blockedBy: Relation[];
  blocks: Relation[];
  related: Relation[];
  crossLinks: CrossLink[];
  epicId: number | null;
}

export interface TaskListOptions extends PaginationOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  tag?: string;
  assigneeId?: number;
  filter?: string;
}

// ---------------------------------------------------------------------------
// Epic types
// ---------------------------------------------------------------------------

export interface EpicCreate {
  title: string;
  description: string;
  status?: EpicStatus;
  priority?: TaskPriority;
  authorId?: number;
}

export interface EpicPatch {
  title?: string;
  description?: string;
  status?: EpicStatus;
  priority?: TaskPriority;
}

export interface EpicRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: EpicStatus;
  priority: TaskPriority;
  tags: string[];
  order: number;
  progress: { total: number; done: number };
  attachments: AttachmentMeta[];
  createdAt: number;
  updatedAt: number;
  version: number;
  createdById: number | null;
  updatedById: number | null;
}

export interface EpicDetail extends EpicRecord {
  tasks: TaskRecord[];
  crossLinks: CrossLink[];
}

export interface EpicListOptions extends PaginationOptions {
  status?: EpicStatus;
  priority?: TaskPriority;
  tag?: string;
  filter?: string;
}

// ---------------------------------------------------------------------------
// Tasks Store interface
// ---------------------------------------------------------------------------

export interface TasksStore extends MetaMixin {
  // --- Task CRUD ---
  create(data: TaskCreate, embedding: number[]): TaskRecord;
  update(taskId: number, patch: TaskPatch, embedding: number[] | null, authorId?: number, expectedVersion?: number): TaskRecord;
  delete(taskId: number): void;
  get(taskId: number): TaskDetail | null;
  getBySlug(slug: string): TaskDetail | null;
  list(opts?: TaskListOptions): { results: TaskRecord[]; total: number };
  search(query: SearchQuery): SearchResult[];

  // --- Move / reorder ---
  move(taskId: number, status: TaskStatus, targetOrder?: number, authorId?: number, expectedVersion?: number): TaskRecord;
  reorder(taskId: number, order: number, status?: TaskStatus, authorId?: number): TaskRecord;

  /** Get next order value for a status column */
  nextOrderForStatus(status: TaskStatus): number;

  // --- Task relations ---
  createRelation(fromId: number, toId: number, kind: string): void;
  deleteRelation(fromId: number, toId: number): void;
  listRelations(taskId: number): { incoming: Relation[]; outgoing: Relation[] };

  // --- Timestamps ---
  getUpdatedAt(taskId: number): number | null;

  // --- Bulk operations ---
  bulkDelete(taskIds: number[]): number;
  bulkMove(taskIds: number[], status: TaskStatus, authorId?: number): number;
  bulkPriority(taskIds: number[], priority: TaskPriority, authorId?: number): number;

  // --- Epic CRUD ---
  createEpic(data: EpicCreate, embedding: number[]): EpicRecord;
  updateEpic(epicId: number, patch: EpicPatch, embedding: number[] | null, authorId?: number, expectedVersion?: number): EpicRecord;
  deleteEpic(epicId: number): void;
  getEpic(epicId: number): EpicDetail | null;
  getEpicBySlug(slug: string): EpicDetail | null;
  listEpics(opts?: EpicListOptions): { results: EpicRecord[]; total: number };
  searchEpics(query: SearchQuery): SearchResult[];

  // --- Epic ↔ Task links ---
  linkTaskToEpic(taskId: number, epicId: number): void;
  unlinkTaskFromEpic(taskId: number, epicId: number): void;
  listEpicTasks(epicId: number): TaskRecord[];
}
