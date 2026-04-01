import type { Edge, MetaMixin, PaginationOptions, SearchQuery, SearchResult } from './common';
import type { AttachmentMeta } from './attachments';

// ---------------------------------------------------------------------------
// Task Store (user-managed)
// ---------------------------------------------------------------------------

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface TaskCreate {
  title: string;
  description: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
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
  tags?: string[];
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
  edges: Edge[];
}

export interface TaskListOptions extends PaginationOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  tag?: string;
  assigneeId?: number;
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

  // --- Timestamps ---
  getUpdatedAt(taskId: number): number | null;

  // --- Bulk operations ---
  bulkDelete(taskIds: number[]): number;
  bulkMove(taskIds: number[], status: TaskStatus, authorId?: number): number;
  bulkPriority(taskIds: number[], priority: TaskPriority, authorId?: number): number;
}
