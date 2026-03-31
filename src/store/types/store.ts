import type { CrossLink, CrossLinkFilter, GraphName } from './common';
import type { CodeStore } from './code';
import type { DocsStore } from './docs';
import type { FilesStore } from './files';
import type { KnowledgeStore } from './knowledge';
import type { TasksStore } from './tasks';
import type { SkillsStore } from './skills';
import type { TagsStore } from './tags';
import type { AttachmentsStore } from './attachments';
import type { ProjectsStore } from './projects';
import type { TeamStore } from './team';

// ---------------------------------------------------------------------------
// Project-scoped view (returned by store.project(id))
// ---------------------------------------------------------------------------

export interface ProjectScopedStore {
  readonly projectId: number;

  readonly code: CodeStore;
  readonly docs: DocsStore;
  readonly files: FilesStore;
  readonly knowledge: KnowledgeStore;
  readonly tasks: TasksStore;
  readonly skills: SkillsStore;
  readonly tags: TagsStore;
  readonly attachments: AttachmentsStore;

  // --- Cross-graph links scoped to this project ---
  createCrossLink(link: CrossLink): void;
  deleteCrossLink(link: CrossLink): void;
  listCrossLinks(filter: CrossLinkFilter): CrossLink[];
  findIncomingCrossLinks(targetGraph: GraphName, targetId: number): CrossLink[];
}

// ---------------------------------------------------------------------------
// Top-level Store (workspace level)
// ---------------------------------------------------------------------------

export interface StoreOptions {
  /** Path to SQLite database file */
  dbPath: string;
}

export interface Store {
  // --- Lifecycle ---
  open(opts: StoreOptions): void;
  close(): void;

  // --- Projects ---
  readonly projects: ProjectsStore;

  // --- Team ---
  readonly team: TeamStore;

  /** Get a project-scoped view on all sub-stores */
  project(projectId: number): ProjectScopedStore;

  // --- Cross-graph links (across all projects) ---
  createCrossLink(projectId: number, link: CrossLink): void;
  deleteCrossLink(projectId: number, link: CrossLink): void;
  listCrossLinks(filter: CrossLinkFilter & { projectId?: number }): CrossLink[];
  findIncomingCrossLinks(targetGraph: GraphName, targetId: number, projectId?: number): CrossLink[];

  /**
   * Run multiple store operations atomically.
   * Maps to SQLite BEGIN/COMMIT. On throw → ROLLBACK.
   */
  transaction<T>(fn: () => T): T;

  // --- Workspace metadata (key-value) ---
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
