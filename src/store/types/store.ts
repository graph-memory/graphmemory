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
  /** Create an edge within the same project */
  createEdge(edge: Edge): void;
  /** Create a cross-project edge (from this project to another) */
  createCrossProjectEdge(toProjectId: number, edge: Edge): void;
  deleteEdge(edge: Edge): void;
  listEdges(filter: EdgeFilter): Edge[];
  /** Find all edges pointing TO a given node (across all projects) */
  findIncomingEdges(targetGraph: GraphName, targetId: number): Edge[];
  /** Find all edges going FROM a given node (across all projects) */
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

  /** Update embedding dimensions: recreate vec0 tables whose dimension changed. */
  updateEmbeddingDims(dims: EmbeddingDims): void;

  // --- Projects ---
  readonly projects: ProjectsStore;

  // --- Team ---
  readonly team: TeamStore;

  /** Get a project-scoped view on all sub-stores */
  project(projectId: number): ProjectScopedStore;

  /** Evict a project from the scoped store cache (call after project deletion) */
  evictProject(projectId: number): void;

  // --- Edges (across all projects) ---
  createEdge(fromProjectId: number, toProjectId: number, edge: Edge): void;
  deleteEdge(edge: Edge): void;
  listEdges(filter: EdgeFilter): Edge[];
  findIncomingEdges(targetGraph: GraphName, targetId: number, projectId?: number): Edge[];
  findOutgoingEdges(fromGraph: GraphName, fromId: number, projectId?: number): Edge[];

  /**
   * Run multiple store operations atomically.
   * Maps to SQLite BEGIN/COMMIT. On throw → ROLLBACK.
   */
  transaction<T>(fn: () => T): T;

  // --- FTS maintenance ---
  /** Rebuild all FTS5 indexes. Use after suspected corruption or out-of-sync state. */
  rebuildFts(): void;
  /** Run FTS5 integrity-check on all indexes. Returns list of tables that failed. */
  checkFts(): string[];

  // --- Workspace metadata (key-value) ---
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
