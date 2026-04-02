import type { Edge, MetaMixin, PaginationOptions, SearchQuery, SearchResult } from './common';
import type { AttachmentMeta } from './attachments';

// ---------------------------------------------------------------------------
// Skill Store (user-managed)
// ---------------------------------------------------------------------------

export type SkillSource = 'user' | 'learned';

export interface SkillCreate {
  title: string;
  description: string;
  steps?: string[];
  triggers?: string[];
  inputHints?: string[];
  filePatterns?: string[];
  tags?: string[];
  source?: SkillSource;
  confidence?: number;
  authorId?: number;
}

/** Data for importing a skill from file mirror (events.jsonl replay). */
export interface SkillImport {
  slug: string;
  title: string;
  description: string;
  steps?: string[];
  triggers?: string[];
  inputHints?: string[];
  filePatterns?: string[];
  tags?: string[];
  source?: SkillSource;
  confidence?: number;
  usageCount?: number;
  lastUsedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface SkillPatch {
  title?: string;
  description?: string;
  steps?: string[];
  triggers?: string[];
  inputHints?: string[];
  filePatterns?: string[];
  tags?: string[];
  source?: SkillSource;
  confidence?: number;
}

export interface SkillRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  steps: string[];
  triggers: string[];
  inputHints: string[];
  filePatterns: string[];
  tags: string[];
  source: SkillSource;
  confidence: number;
  usageCount: number;
  lastUsedAt: number | null;
  attachments: AttachmentMeta[];
  createdAt: number;
  updatedAt: number;
  version: number;
  createdById: number | null;
  updatedById: number | null;
}

export interface SkillDetail extends SkillRecord {
  edges: Edge[];
}

export interface SkillListOptions extends PaginationOptions {
  source?: SkillSource;
  tag?: string;
  filter?: string;
}

export interface SkillsStore extends MetaMixin {
  // --- CRUD ---
  create(data: SkillCreate, embedding: number[]): SkillRecord;
  update(skillId: number, patch: SkillPatch, embedding: number[] | null, authorId?: number, expectedVersion?: number): SkillRecord;
  delete(skillId: number): void;
  get(skillId: number): SkillDetail | null;
  getBySlug(slug: string): SkillDetail | null;
  list(opts?: SkillListOptions): { results: SkillRecord[]; total: number };
  search(query: SearchQuery): SearchResult[];

  /** Increment usageCount, set lastUsedAt */
  bumpUsage(skillId: number): void;

  // --- Timestamps ---
  getUpdatedAt(skillId: number): number | null;

  // --- Import (from file mirror) ---
  /** Upsert a skill from file mirror data. If slug exists → update, else → insert. */
  importRecord(data: SkillImport, embedding: number[]): SkillRecord;
}
