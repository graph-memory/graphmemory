import type { Edge, EdgeFilter, GraphName, EmbeddingDims } from './common';
import type { CodeStore } from './code';
import type { DocsStore } from './docs';
import type { FilesStore } from './files';
import type { KnowledgeStore } from './knowledge';
import type { TasksStore } from './tasks';
import type { EpicsStore } from './epics';
import type { SkillsStore } from './skills';
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
  readonly epics: EpicsStore;
  readonly skills: SkillsStore;
  readonly attachments: AttachmentsStore;

  // --- Edges (unified graph edges — same-graph and cross-graph) ---
  createEdge(edge: Edge): void;
  deleteEdge(edge: Edge): void;
  listEdges(filter: EdgeFilter): Edge[];
  /** Find all edges pointing TO a given node */
  findIncomingEdges(targetGraph: GraphName, targetId: number): Edge[];
  /** Find all edges going FROM a given node */
  findOutgoingEdges(fromGraph: GraphName, fromId: number): Edge[];
}

// ---------------------------------------------------------------------------
// Top-level Store (workspace level)
// ---------------------------------------------------------------------------

export interface StoreOptions {
  /** Path to SQLite database file */
  dbPath: string;
  /** Per-graph embedding dimensions. Defaults to 384 for any unspecified graph. */
  embeddingDims?: EmbeddingDims;
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

  /** Evict a project from the scoped store cache (call after project deletion) */
  evictProject(projectId: number): void;

  // --- Edges (across all projects) ---
  createEdge(projectId: number, edge: Edge): void;
  deleteEdge(projectId: number, edge: Edge): void;
  listEdges(filter: EdgeFilter & { projectId?: number }): Edge[];
  findIncomingEdges(targetGraph: GraphName, targetId: number, projectId?: number): Edge[];
  findOutgoingEdges(fromGraph: GraphName, fromId: number, projectId?: number): Edge[];

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
