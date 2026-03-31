import type { CrossLink, MetaMixin, PaginationOptions, Relation, SearchQuery, SearchResult } from './common';
import type { AttachmentMeta } from './attachments';

// ---------------------------------------------------------------------------
// Knowledge Store (user-managed)
// ---------------------------------------------------------------------------

export interface NoteCreate {
  title: string;
  content: string;
  authorId?: number;
}

export interface NotePatch {
  title?: string;
  content?: string;
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
  relations: { incoming: Relation[]; outgoing: Relation[] };
  crossLinks: CrossLink[];
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

  // --- Same-graph relations ---
  createRelation(fromId: number, toId: number, kind: string): void;
  deleteRelation(fromId: number, toId: number): void;
  listRelations(noteId: number): { incoming: Relation[]; outgoing: Relation[] };

  // --- Timestamps ---
  getUpdatedAt(noteId: number): number | null;
}
