import type { MetaMixin, PaginationOptions } from './common';

// ---------------------------------------------------------------------------
// Projects Store
// ---------------------------------------------------------------------------

export interface ProjectCreate {
  slug: string;
  name: string;
  directory: string;
}

export interface ProjectPatch {
  name?: string;
  directory?: string;
}

export interface ProjectRecord {
  id: number;
  slug: string;
  name: string;
  directory: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectsStore extends MetaMixin {
  create(data: ProjectCreate): ProjectRecord;
  update(projectId: number, patch: ProjectPatch): ProjectRecord;
  /** Delete project and cascade-delete all its data */
  delete(projectId: number): void;
  get(projectId: number): ProjectRecord | null;
  getBySlug(slug: string): ProjectRecord | null;
  list(pagination?: PaginationOptions): { results: ProjectRecord[]; total: number };
}
