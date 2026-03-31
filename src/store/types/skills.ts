import type { CrossLink, MetaMixin, PaginationOptions, Relation, SearchQuery, SearchResult } from './common';
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
  source?: SkillSource;
  confidence?: number;
  authorId?: number;
}

export interface SkillPatch {
  title?: string;
  description?: string;
  steps?: string[];
  triggers?: string[];
  inputHints?: string[];
  filePatterns?: string[];
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
  dependsOn: Relation[];
  dependedBy: Relation[];
  related: Relation[];
  variants: Relation[];
  crossLinks: CrossLink[];
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

  // --- Same-graph relations ---
  createRelation(fromId: number, toId: number, kind: string): void;
  deleteRelation(fromId: number, toId: number): void;
  listRelations(skillId: number): { incoming: Relation[]; outgoing: Relation[] };

  // --- Timestamps ---
  getUpdatedAt(skillId: number): number | null;
}
