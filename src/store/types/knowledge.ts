import type { Edge, MetaMixin, PaginationOptions, SearchQuery, SearchResult } from './common';
import type { AttachmentMeta } from './attachments';

// ---------------------------------------------------------------------------
// Knowledge Store (user-managed)
// ---------------------------------------------------------------------------

export interface NoteCreate {
  title: string;
  content: string;
  tags?: string[];
  authorId?: number;
}

export interface NotePatch {
  title?: string;
  content?: string;
  tags?: string[];
}

export interface NoteRecord {
  id: number;
  slug: string;
  title: string;
  content: string;
  tags: string[];
  attachments: AttachmentMeta[];
  createdAt: number;
  updatedAt: number;
  version: number;
  createdById: number | null;
  updatedById: number | null;
}

export interface NoteDetail extends NoteRecord {
  edges: Edge[];
}

export interface KnowledgeStore extends MetaMixin {
  // --- CRUD ---
  create(data: NoteCreate, embedding: number[]): NoteRecord;
  update(noteId: number, patch: NotePatch, embedding: number[] | null, authorId?: number, expectedVersion?: number): NoteRecord;
  delete(noteId: number): void;
  get(noteId: number): NoteDetail | null;
  getBySlug(slug: string): NoteDetail | null;
  list(filter?: string, tag?: string, pagination?: PaginationOptions): { results: NoteRecord[]; total: number };

  // --- Search ---
  search(query: SearchQuery): SearchResult[];

  // --- Timestamps ---
  getUpdatedAt(noteId: number): number | null;
}
