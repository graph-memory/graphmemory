import type { Edge, MetaMixin, PaginationOptions, SearchQuery, SearchResult } from './common';
import type { AttachmentMeta } from './attachments';
import type { TaskPriority } from './tasks';

// ---------------------------------------------------------------------------
// Epic Store
// ---------------------------------------------------------------------------

export type EpicStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export interface EpicCreate {
  title: string;
  description: string;
  status?: EpicStatus;
  priority?: TaskPriority;
  order?: number;
  tags?: string[];
  authorId?: number;
  slug?: string;
  createdAt?: number;
  updatedAt?: number;
  version?: number;
}

export interface EpicPatch {
  title?: string;
  description?: string;
  status?: EpicStatus;
  priority?: TaskPriority;
  order?: number;
  tags?: string[];
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
  edges: Edge[];
}

export interface EpicListOptions extends PaginationOptions {
  status?: EpicStatus;
  priority?: TaskPriority;
  tag?: string;
  filter?: string;
}

export interface EpicsStore extends MetaMixin {
  create(data: EpicCreate, embedding: number[]): EpicRecord;
  update(epicId: number, patch: EpicPatch, embedding: number[] | null, authorId?: number, expectedVersion?: number): EpicRecord;
  delete(epicId: number): void;
  get(epicId: number): EpicDetail | null;
  getBySlug(slug: string): EpicDetail | null;
  list(opts?: EpicListOptions): { results: EpicRecord[]; total: number };
  search(query: SearchQuery): SearchResult[];
  reorder(epicId: number, order: number, authorId?: number): EpicRecord;
  linkTask(epicId: number, taskId: number): void;
  unlinkTask(epicId: number, taskId: number): void;

  // --- Timestamps ---
  getUpdatedAt(epicId: number): number | null;
}
