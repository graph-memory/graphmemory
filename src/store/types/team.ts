import type { MetaMixin, PaginationOptions } from './common';

// ---------------------------------------------------------------------------
// Team Store
// ---------------------------------------------------------------------------

export interface TeamMemberCreate {
  slug: string;
  name: string;
  email?: string;
  role?: string;
}

export interface TeamMemberPatch {
  name?: string;
  email?: string;
  role?: string;
}

export interface TeamMemberRecord {
  id: number;
  slug: string;
  name: string;
  email: string | null;
  role: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TeamStore extends MetaMixin {
  create(data: TeamMemberCreate): TeamMemberRecord;
  update(memberId: number, patch: TeamMemberPatch): TeamMemberRecord;
  delete(memberId: number): void;
  get(memberId: number): TeamMemberRecord | null;
  getBySlug(slug: string): TeamMemberRecord | null;
  list(pagination?: PaginationOptions): { results: TeamMemberRecord[]; total: number };
}
