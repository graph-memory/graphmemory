import fs from 'fs';
import path from 'path';
import type { TaskGraph, TaskNodeAttributes, TaskEdgeAttributes, TaskCrossGraphType, TaskStatus, TaskPriority } from '@/graphs/task-types';
import type { AttachmentMeta } from '@/graphs/attachment-types';
import { createTaskGraph, PRIORITY_ORDER } from '@/graphs/task-types';
import { slugify } from '@/graphs/knowledge-types';
import type { DirectedGraph } from 'graphology';
import type { EmbedFns, GraphManagerContext, ExternalGraphs } from '@/graphs/manager-types';
import { resolveExternalGraph, VersionConflictError } from '@/graphs/manager-types';
import { searchTasks, type TaskSearchResult } from '@/lib/search/tasks';
import { BM25Index } from '@/lib/search/bm25';
import { mirrorTaskCreate, mirrorTaskUpdate, mirrorTaskRelation, mirrorAttachmentEvent, deleteMirrorDir, writeAttachment, deleteAttachment, getAttachmentPath as getAttPath, sanitizeFilename } from '@/lib/file-mirror';
import { compressEmbeddings, decompressEmbeddings } from '@/lib/embedding-codec';
import { readJsonWithTmpFallback } from '@/lib/graph-persistence';
import { LIST_LIMIT_LARGE, CONTENT_PREVIEW_LEN } from '@/lib/defaults';
import type { MirrorWriteTracker } from '@/lib/mirror-watcher';
import type { ParsedTaskFile } from '@/lib/file-import';
import { scanAttachments, MAX_ATTACHMENT_SIZE, MAX_ATTACHMENTS_PER_ENTITY } from '@/graphs/attachment-types';
import { diffRelations } from '@/lib/file-import';
import type { RelationFrontmatter } from '@/lib/file-mirror';

export type { TaskGraph };
export { createTaskGraph };

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

/** Build the proxy node ID. With projectId: `@docs::frontend::guide.md::Setup`, without: `@docs::guide.md::Setup` */
export function proxyId(targetGraph: TaskCrossGraphType, nodeId: string, projectId?: string): string {
  return projectId ? `@${targetGraph}::${projectId}::${nodeId}` : `@${targetGraph}::${nodeId}`;
}

/** Check whether a node is a cross-graph proxy. */
export function isProxy(graph: TaskGraph, nodeId: string): boolean {
  if (!graph.hasNode(nodeId)) return false;
  return graph.getNodeAttribute(nodeId, 'proxyFor') !== undefined;
}

/** Ensure a proxy node exists for the given external target. Returns its ID. */
function ensureProxyNode(graph: TaskGraph, targetGraph: TaskCrossGraphType, nodeId: string, projectId?: string): string {
  const id = proxyId(targetGraph, nodeId, projectId);
  if (!graph.hasNode(id)) {
    graph.addNode(id, {
      title: '',
      description: '',
      status: 'backlog',
      priority: 'low',
      tags: [],
      dueDate: null,
      estimate: null,
      completedAt: null,
      assignee: null,
      embedding: [],
      attachments: [],
      createdAt: 0,
      updatedAt: 0,
      version: 0,
      proxyFor: { graph: targetGraph, nodeId, projectId },
    });
  }
  return id;
}

/** Remove a proxy node if it has zero incident edges. */
function cleanupProxy(graph: TaskGraph, nodeId: string): void {
  if (!graph.hasNode(nodeId)) return;
  if (!isProxy(graph, nodeId)) return;
  if (graph.degree(nodeId) === 0) {
    graph.dropNode(nodeId);
  }
}

/**
 * Remove all proxy nodes whose target no longer exists in the external graph.
 * Called after doc/code/file removal in the indexer.
 */
export function cleanupProxies(
  graph: TaskGraph,
  targetGraph: TaskCrossGraphType,
  externalGraph: DirectedGraph,
  projectId?: string,
): void {
  const toRemove: string[] = [];
  graph.forEachNode((id, attrs: TaskNodeAttributes) => {
    if (attrs.proxyFor && attrs.proxyFor.graph === targetGraph) {
      if (projectId && attrs.proxyFor.projectId && attrs.proxyFor.projectId !== projectId) return;
      if (!externalGraph.hasNode(attrs.proxyFor.nodeId)) {
        toRemove.push(id);
      }
    }
  });
  for (const id of toRemove) {
    graph.dropNode(id); // also drops incident edges
  }
}

// ---------------------------------------------------------------------------
// CRUD — Tasks
// ---------------------------------------------------------------------------

/** Create a task, return its slug ID. */
export function createTask(
  graph: TaskGraph,
  title: string,
  description: string,
  status: TaskStatus,
  priority: TaskPriority,
  tags: string[],
  embedding: number[],
  dueDate: number | null = null,
  estimate: number | null = null,
  author = '',
  assignee: string | null = null,
): string {
  const id = slugify(title, graph);
  const now = Date.now();
  graph.addNode(id, {
    title,
    description,
    status,
    priority,
    tags,
    dueDate,
    estimate,
    completedAt: null,
    assignee,
    embedding,
    attachments: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
    createdBy: author || undefined,
    updatedBy: author || undefined,
  });
  return id;
}

/** Partial update of a task. Returns true if found and updated. Throws VersionConflictError if expectedVersion is provided and doesn't match. */
export function updateTask(
  graph: TaskGraph,
  taskId: string,
  patch: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    tags?: string[];
    dueDate?: number | null;
    estimate?: number | null;
    assignee?: string | null;
  },
  embedding?: number[],
  author = '',
  expectedVersion?: number,
): boolean {
  if (!graph.hasNode(taskId)) return false;
  if (isProxy(graph, taskId)) return false;

  if (expectedVersion !== undefined) {
    const current = graph.getNodeAttribute(taskId, 'version');
    if (current !== expectedVersion) throw new VersionConflictError(current, expectedVersion);
  }

  if (patch.title !== undefined)       graph.setNodeAttribute(taskId, 'title', patch.title);
  if (patch.description !== undefined) graph.setNodeAttribute(taskId, 'description', patch.description);
  if (patch.priority !== undefined)    graph.setNodeAttribute(taskId, 'priority', patch.priority);
  if (patch.tags !== undefined)        graph.setNodeAttribute(taskId, 'tags', patch.tags);
  if (patch.dueDate !== undefined)     graph.setNodeAttribute(taskId, 'dueDate', patch.dueDate);
  if (patch.estimate !== undefined)    graph.setNodeAttribute(taskId, 'estimate', patch.estimate);
  if (patch.assignee !== undefined)    graph.setNodeAttribute(taskId, 'assignee', patch.assignee);
  if (embedding !== undefined)         graph.setNodeAttribute(taskId, 'embedding', embedding);
  if (author)                          graph.setNodeAttribute(taskId, 'updatedBy', author);

  // Handle status change with completedAt auto-logic
  if (patch.status !== undefined) {
    const oldStatus = graph.getNodeAttribute(taskId, 'status');
    graph.setNodeAttribute(taskId, 'status', patch.status);
    if ((patch.status === 'done' || patch.status === 'cancelled') && oldStatus !== 'done' && oldStatus !== 'cancelled') {
      graph.setNodeAttribute(taskId, 'completedAt', Date.now());
    } else if (patch.status !== 'done' && patch.status !== 'cancelled' && (oldStatus === 'done' || oldStatus === 'cancelled')) {
      graph.setNodeAttribute(taskId, 'completedAt', null);
    }
  }

  graph.setNodeAttribute(taskId, 'version', graph.getNodeAttribute(taskId, 'version') + 1);
  graph.setNodeAttribute(taskId, 'updatedAt', Date.now());
  return true;
}

/** Move a task to a new status. Handles completedAt auto-logic. Returns true if found. Throws VersionConflictError if expectedVersion is provided and doesn't match. */
export function moveTask(
  graph: TaskGraph,
  taskId: string,
  newStatus: TaskStatus,
  expectedVersion?: number,
): boolean {
  if (!graph.hasNode(taskId)) return false;
  if (isProxy(graph, taskId)) return false;

  if (expectedVersion !== undefined) {
    const current = graph.getNodeAttribute(taskId, 'version');
    if (current !== expectedVersion) throw new VersionConflictError(current, expectedVersion);
  }

  const oldStatus = graph.getNodeAttribute(taskId, 'status');
  graph.setNodeAttribute(taskId, 'status', newStatus);

  if ((newStatus === 'done' || newStatus === 'cancelled') && oldStatus !== 'done' && oldStatus !== 'cancelled') {
    graph.setNodeAttribute(taskId, 'completedAt', Date.now());
  } else if (newStatus !== 'done' && newStatus !== 'cancelled' && (oldStatus === 'done' || oldStatus === 'cancelled')) {
    graph.setNodeAttribute(taskId, 'completedAt', null);
  }

  graph.setNodeAttribute(taskId, 'version', graph.getNodeAttribute(taskId, 'version') + 1);
  graph.setNodeAttribute(taskId, 'updatedAt', Date.now());
  return true;
}

/** Delete a task and all its incident edges. Also cleans up orphaned proxy nodes. */
export function deleteTask(graph: TaskGraph, taskId: string): boolean {
  if (!graph.hasNode(taskId)) return false;
  if (isProxy(graph, taskId)) return false;

  const proxyNeighbors: string[] = [];
  graph.forEachNeighbor(taskId, (neighbor) => {
    if (isProxy(graph, neighbor)) proxyNeighbors.push(neighbor);
  });

  graph.dropNode(taskId);

  for (const p of proxyNeighbors) {
    cleanupProxy(graph, p);
  }

  return true;
}

export interface TaskEntry {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate: number | null;
  estimate: number | null;
  completedAt: number | null;
  assignee: string | null;
  createdAt: number;
  updatedAt: number;
  version: number;
  attachments: AttachmentMeta[];
}

export interface CrossLinkEntry {
  nodeId: string;
  targetGraph: string;
  kind: string;
  direction: 'outgoing' | 'incoming';
}

/** Get a task by ID, or null if not found. Excludes proxy nodes. */
export function getTask(
  graph: TaskGraph,
  taskId: string,
): (TaskEntry & {
  subtasks: Array<{ id: string; title: string; status: TaskStatus }>;
  blockedBy: Array<{ id: string; title: string }>;
  blocks: Array<{ id: string; title: string }>;
  related: Array<{ id: string; title: string }>;
  crossLinks: CrossLinkEntry[];
}) | null {
  if (!graph.hasNode(taskId)) return null;
  if (isProxy(graph, taskId)) return null;

  const attrs = graph.getNodeAttributes(taskId);
  const subtasks: Array<{ id: string; title: string; status: TaskStatus }> = [];
  const blockedBy: Array<{ id: string; title: string }> = [];
  const blocks: Array<{ id: string; title: string }> = [];
  const related: Array<{ id: string; title: string }> = [];
  const crossLinks: CrossLinkEntry[] = [];

  // Incoming edges: subtask_of (child → this) means child is a subtask
  graph.forEachInEdge(taskId, (_edge, edgeAttrs: TaskEdgeAttributes, source) => {
    if (isProxy(graph, source)) {
      // Incoming cross-graph link (e.g. note → this task via mirror proxy)
      const proxyFor = graph.getNodeAttribute(source, 'proxyFor');
      if (proxyFor) {
        crossLinks.push({
          nodeId: proxyFor.nodeId,
          targetGraph: proxyFor.graph,
          kind: edgeAttrs.kind,
          direction: 'incoming',
        });
      }
      return;
    }
    const srcAttrs = graph.getNodeAttributes(source);
    if (edgeAttrs.kind === 'subtask_of') {
      subtasks.push({ id: source, title: srcAttrs.title, status: srcAttrs.status });
    } else if (edgeAttrs.kind === 'blocks') {
      // source blocks this task
      blockedBy.push({ id: source, title: srcAttrs.title });
    } else if (edgeAttrs.kind === 'related_to') {
      related.push({ id: source, title: srcAttrs.title });
    }
  });

  // Outgoing edges
  graph.forEachOutEdge(taskId, (_edge, edgeAttrs: TaskEdgeAttributes, _source, target) => {
    if (isProxy(graph, target)) {
      // Outgoing cross-graph link (task → external node via proxy)
      const proxyFor = graph.getNodeAttribute(target, 'proxyFor');
      if (proxyFor) {
        crossLinks.push({
          nodeId: proxyFor.nodeId,
          targetGraph: proxyFor.graph,
          kind: edgeAttrs.kind,
          direction: 'outgoing',
        });
      }
      return;
    }
    const tgtAttrs = graph.getNodeAttributes(target);
    if (edgeAttrs.kind === 'subtask_of') {
      // this task is a subtask of target — skip, handled via parent lookup
    } else if (edgeAttrs.kind === 'blocks') {
      blocks.push({ id: target, title: tgtAttrs.title });
    } else if (edgeAttrs.kind === 'related_to') {
      if (!related.some(r => r.id === target)) {
        related.push({ id: target, title: tgtAttrs.title });
      }
    }
  });

  return {
    id: taskId,
    title: attrs.title,
    description: attrs.description,
    status: attrs.status,
    priority: attrs.priority,
    tags: attrs.tags,
    dueDate: attrs.dueDate,
    estimate: attrs.estimate,
    completedAt: attrs.completedAt,
    assignee: attrs.assignee ?? null,
    createdAt: attrs.createdAt,
    updatedAt: attrs.updatedAt,
    version: attrs.version,
    attachments: attrs.attachments ?? [],
    subtasks,
    blockedBy,
    blocks,
    related,
    crossLinks,
  };
}

/** List tasks with optional filters. Excludes proxy nodes. */
export function listTasks(
  graph: TaskGraph,
  opts: {
    status?: TaskStatus;
    priority?: TaskPriority;
    tag?: string;
    filter?: string;
    assignee?: string;
    limit?: number;
  } = {},
): TaskEntry[] {
  const { status, priority, tag, filter, assignee, limit = LIST_LIMIT_LARGE } = opts;
  const lowerFilter = filter?.toLowerCase();
  const lowerTag = tag?.toLowerCase();

  const results: TaskEntry[] = [];

  graph.forEachNode((id, attrs: TaskNodeAttributes) => {
    if (attrs.proxyFor) return;
    if (status && attrs.status !== status) return;
    if (priority && attrs.priority !== priority) return;
    if (assignee !== undefined && attrs.assignee !== assignee) return;
    if (lowerTag && !attrs.tags.some(t => t.toLowerCase() === lowerTag)) return;
    if (lowerFilter) {
      const match = id.toLowerCase().includes(lowerFilter) ||
                    attrs.title.toLowerCase().includes(lowerFilter);
      if (!match) return;
    }
    results.push({
      id,
      title: attrs.title,
      description: attrs.description?.slice(0, CONTENT_PREVIEW_LEN),
      status: attrs.status,
      priority: attrs.priority,
      tags: attrs.tags,
      dueDate: attrs.dueDate,
      estimate: attrs.estimate,
      completedAt: attrs.completedAt,
      assignee: attrs.assignee ?? null,
      version: attrs.version,
      createdAt: attrs.createdAt,
      updatedAt: attrs.updatedAt,
      attachments: attrs.attachments ?? [],
    });
  });

  return results
    .sort((a, b) => {
      // Sort by priority (critical first), then dueDate (earliest first, nulls last)
      const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pDiff !== 0) return pDiff;
      if (a.dueDate === null && b.dueDate === null) return 0;
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate - b.dueDate;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// CRUD — Task Relations (task ↔ task)
// ---------------------------------------------------------------------------

/** Create a directed relation between two tasks. Returns true if created. */
export function createTaskRelation(
  graph: TaskGraph,
  fromId: string,
  toId: string,
  kind: string,
): boolean {
  if (!graph.hasNode(fromId) || !graph.hasNode(toId)) return false;
  if (isProxy(graph, fromId) || isProxy(graph, toId)) return false;
  if (graph.hasEdge(fromId, toId)) return false;
  graph.addEdgeWithKey(`${fromId}→${toId}`, fromId, toId, { kind });
  return true;
}

/** Delete a task relation. Returns true if it existed. */
export function deleteTaskRelation(
  graph: TaskGraph,
  fromId: string,
  toId: string,
): boolean {
  if (!graph.hasEdge(fromId, toId)) return false;
  graph.dropEdge(fromId, toId);
  return true;
}

export interface TaskRelationEntry {
  fromId: string;
  toId: string;
  kind: string;
  targetGraph?: TaskCrossGraphType;
  title?: string;
}

/** List all relations for a task (both incoming and outgoing). Resolves proxy IDs and titles. */
export function listTaskRelations(
  graph: TaskGraph,
  taskId: string,
  externalGraphs?: ExternalGraphs,
): TaskRelationEntry[] {
  if (!graph.hasNode(taskId)) return [];

  const results: TaskRelationEntry[] = [];

  function resolveTitle(nodeId: string, targetGraph?: TaskCrossGraphType): string | undefined {
    if (!targetGraph) {
      // Same-graph task
      if (graph.hasNode(nodeId) && !isProxy(graph, nodeId)) {
        return graph.getNodeAttribute(nodeId, 'title') || undefined;
      }
      return undefined;
    }
    if (!externalGraphs) return undefined;
    const extGraph = resolveExternalGraph(externalGraphs, targetGraph);
    if (!extGraph || !extGraph.hasNode(nodeId)) return undefined;
    const attrs = extGraph.getNodeAttributes(nodeId);
    return attrs.title || attrs.name || undefined;
  }

  function resolveEntry(source: string, target: string, kind: string): TaskRelationEntry {
    const sourceProxy = graph.hasNode(source) ? graph.getNodeAttribute(source, 'proxyFor') : undefined;
    const targetProxy = graph.hasNode(target) ? graph.getNodeAttribute(target, 'proxyFor') : undefined;

    if (targetProxy) {
      const title = resolveTitle(targetProxy.nodeId, targetProxy.graph);
      return { fromId: source, toId: targetProxy.nodeId, kind, targetGraph: targetProxy.graph, ...(title ? { title } : {}) };
    }
    if (sourceProxy) {
      const title = resolveTitle(sourceProxy.nodeId, sourceProxy.graph);
      return { fromId: sourceProxy.nodeId, toId: target, kind, targetGraph: sourceProxy.graph, ...(title ? { title } : {}) };
    }
    const otherId = source === taskId ? target : source;
    const title = resolveTitle(otherId);
    return { fromId: source, toId: target, kind, ...(title ? { title } : {}) };
  }

  graph.forEachOutEdge(taskId, (_edge, attrs: TaskEdgeAttributes, source, target) => {
    results.push(resolveEntry(source, target, attrs.kind));
  });

  graph.forEachInEdge(taskId, (_edge, attrs: TaskEdgeAttributes, source, target) => {
    results.push(resolveEntry(source, target, attrs.kind));
  });

  return results;
}

// ---------------------------------------------------------------------------
// Reverse lookup: find tasks linked to a target
// ---------------------------------------------------------------------------

export interface LinkedTaskEntry {
  taskId: string;
  title: string;
  kind: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
}

/**
 * Find all tasks that have a cross-graph relation to the given target node.
 * Optionally filter by relation kind.
 */
export function findLinkedTasks(
  graph: TaskGraph,
  targetGraph: TaskCrossGraphType,
  targetNodeId: string,
  kind?: string,
  projectId?: string,
): LinkedTaskEntry[] {
  const candidates = [proxyId(targetGraph, targetNodeId, projectId)];
  if (projectId) candidates.push(proxyId(targetGraph, targetNodeId));

  const results: LinkedTaskEntry[] = [];
  const seen = new Set<string>();
  for (const pId of candidates) {
    if (!graph.hasNode(pId)) continue;
    graph.forEachInEdge(pId, (_edge, attrs: TaskEdgeAttributes, source) => {
      if (seen.has(source)) return;
      if (isProxy(graph, source)) return;
      if (kind && attrs.kind !== kind) return;
      const taskAttrs = graph.getNodeAttributes(source);
      seen.add(source);
      results.push({
        taskId: source,
        title: taskAttrs.title,
        kind: attrs.kind,
        status: taskAttrs.status,
        priority: taskAttrs.priority,
        tags: taskAttrs.tags,
      });
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Cross-graph relations (task → doc/code/file/knowledge node)
// ---------------------------------------------------------------------------

/**
 * Create a cross-graph relation from a task to a node in an external graph.
 * Optionally validates that the target exists in the external graph.
 */
export function createCrossRelation(
  graph: TaskGraph,
  fromTaskId: string,
  targetGraph: TaskCrossGraphType,
  targetNodeId: string,
  kind: string,
  externalGraph?: DirectedGraph,
  projectId?: string,
): boolean {
  if (!graph.hasNode(fromTaskId) || isProxy(graph, fromTaskId)) return false;
  if (externalGraph && !externalGraph.hasNode(targetNodeId)) return false;

  const pId = ensureProxyNode(graph, targetGraph, targetNodeId, projectId);
  if (graph.hasEdge(fromTaskId, pId)) return false;
  graph.addEdgeWithKey(`${fromTaskId}→${pId}`, fromTaskId, pId, { kind });
  return true;
}

/**
 * Delete a cross-graph relation. Cleans up orphaned proxy node.
 */
export function deleteCrossRelation(
  graph: TaskGraph,
  fromTaskId: string,
  targetGraph: TaskCrossGraphType,
  targetNodeId: string,
  projectId?: string,
): boolean {
  const candidates = [proxyId(targetGraph, targetNodeId, projectId)];
  if (projectId) candidates.push(proxyId(targetGraph, targetNodeId));

  for (const pId of candidates) {
    if (graph.hasEdge(fromTaskId, pId)) {
      graph.dropEdge(fromTaskId, pId);
      cleanupProxy(graph, pId);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveTaskGraph(graph: TaskGraph, graphMemory: string, embeddingFingerprint?: string): void {
  fs.mkdirSync(graphMemory, { recursive: true });
  const file = path.join(graphMemory, 'tasks.json');
  const tmp = file + '.tmp';
  try {
    const exported = graph.export();
    compressEmbeddings(exported);
    fs.writeFileSync(tmp, JSON.stringify({ embeddingModel: embeddingFingerprint, graph: exported }));
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore cleanup error */ }
    throw err;
  }
}

export function loadTaskGraph(graphMemory: string, fresh = false, embeddingFingerprint?: string): TaskGraph {
  const graph = createTaskGraph();
  if (fresh) return graph;
  const file = path.join(graphMemory, 'tasks.json');

  const data = readJsonWithTmpFallback(file);
  if (!data) return graph;

  try {
    const stored = data.embeddingModel as string | undefined;

    if (embeddingFingerprint && stored !== embeddingFingerprint) {
      process.stderr.write(`[task-graph] Embedding config changed, re-indexing task graph\n`);
      return graph;
    }

    decompressEmbeddings(data.graph);
    graph.import(data.graph);
    process.stderr.write(`[task-graph] Loaded ${graph.order} nodes, ${graph.size} edges\n`);
  } catch (err) {
    process.stderr.write(`[task-graph] Failed to load graph, starting fresh: ${err}\n`);
  }

  return graph;
}

// ---------------------------------------------------------------------------
// Bidirectional mirror helpers (Task ↔ Knowledge)
// ---------------------------------------------------------------------------

/**
 * Create a mirror proxy in KnowledgeGraph when a task links to a note.
 * Creates `@tasks::taskId` proxy node + edge proxy→noteId in KnowledgeGraph.
 */
function createMirrorInKnowledgeGraph(
  knowledgeGraph: DirectedGraph,
  taskId: string,
  noteId: string,
  kind: string,
): void {
  const mirrorProxyId = `@tasks::${taskId}`;
  if (!knowledgeGraph.hasNode(mirrorProxyId)) {
    knowledgeGraph.addNode(mirrorProxyId, {
      title: '',
      content: '',
      tags: [],
      embedding: [],
      attachments: [],
      createdAt: 0,
      updatedAt: 0,
      version: 0,
      proxyFor: { graph: 'tasks', nodeId: taskId },
    });
  }
  if (!knowledgeGraph.hasNode(noteId)) return;
  const edgeKey = `${mirrorProxyId}→${noteId}`;
  if (!knowledgeGraph.hasEdge(edgeKey)) {
    knowledgeGraph.addEdgeWithKey(edgeKey, mirrorProxyId, noteId, { kind });
  }
}

/**
 * Remove the mirror proxy edge/node from KnowledgeGraph when a task→knowledge relation is deleted.
 */
function deleteMirrorFromKnowledgeGraph(
  knowledgeGraph: DirectedGraph,
  taskId: string,
  noteId: string,
): void {
  const mirrorProxyId = `@tasks::${taskId}`;
  const edgeKey = `${mirrorProxyId}→${noteId}`;
  if (knowledgeGraph.hasEdge(edgeKey)) {
    knowledgeGraph.dropEdge(edgeKey);
  }
  // Cleanup orphan proxy
  if (knowledgeGraph.hasNode(mirrorProxyId)) {
    const proxyFor = knowledgeGraph.getNodeAttribute(mirrorProxyId, 'proxyFor');
    if (proxyFor && knowledgeGraph.degree(mirrorProxyId) === 0) {
      knowledgeGraph.dropNode(mirrorProxyId);
    }
  }
}

// ---------------------------------------------------------------------------
// TaskGraphManager — unified API for task graph operations
// ---------------------------------------------------------------------------

export class TaskGraphManager {
  private knowledgeGraph?: DirectedGraph;
  private mirrorTracker?: MirrorWriteTracker;
  private _bm25Index: BM25Index<TaskNodeAttributes>;

  constructor(
    private _graph: TaskGraph,
    private embedFns: EmbedFns,
    private ctx: GraphManagerContext,
    private ext: ExternalGraphs = {},
  ) {
    this.knowledgeGraph = ext.knowledgeGraph;
    this._bm25Index = new BM25Index<TaskNodeAttributes>(
      (attrs) => `${attrs.title} ${attrs.description} ${attrs.tags.join(' ')}`,
    );
    this._graph.forEachNode((id, attrs) => {
      if (!attrs.proxyFor) this._bm25Index.addDocument(id, attrs);
    });
  }

  get graph(): TaskGraph { return this._graph; }
  get bm25Index(): BM25Index<TaskNodeAttributes> { return this._bm25Index; }

  rebuildBm25Index(): void {
    this._bm25Index.clear();
    this._graph.forEachNode((id, attrs) => {
      if (!attrs.proxyFor) this._bm25Index.addDocument(id, attrs);
    });
  }

  setMirrorTracker(tracker: MirrorWriteTracker): void {
    this.mirrorTracker = tracker;
  }

  /** Returns updatedAt for a node, or null if not found. Used by startup scan. */
  getNodeUpdatedAt(taskId: string): number | null {
    if (!this._graph.hasNode(taskId)) return null;
    if (isProxy(this._graph, taskId)) return null;
    return this._graph.getNodeAttribute(taskId, 'updatedAt') ?? null;
  }

  private get tasksDir(): string | undefined {
    const base = this.ctx.mirrorDir ?? this.ctx.projectDir;
    return base ? path.join(base, '.tasks') : undefined;
  }

  private recordMirrorWrites(taskId: string): void {
    const dir = this.tasksDir;
    if (!dir || !this.mirrorTracker) return;
    const entityDir = path.join(dir, taskId);
    this.mirrorTracker.recordWrite(path.join(entityDir, 'events.jsonl'));
    this.mirrorTracker.recordWrite(path.join(entityDir, 'task.md'));
    this.mirrorTracker.recordWrite(path.join(entityDir, 'description.md'));
  }

  // -- Write (mutations with embed + dirty + emit + cross-graph cleanup) --

  async createTask(
    title: string,
    description: string,
    status: TaskStatus = 'backlog',
    priority: TaskPriority = 'medium',
    tags: string[] = [],
    dueDate: number | null = null,
    estimate: number | null = null,
    assignee: string | null = null,
  ): Promise<string> {
    const embedding = await this.embedFns.document(`${title} ${description}`);
    const taskId = createTask(this._graph, title, description, status, priority, tags, embedding, dueDate, estimate, this.ctx.author, assignee);
    this._bm25Index.addDocument(taskId, this._graph.getNodeAttributes(taskId));
    this.ctx.markDirty();
    this.ctx.emit('task:created', { projectId: this.ctx.projectId, taskId });
    const dir = this.tasksDir;
    if (dir) {
      const attrs = this._graph.getNodeAttributes(taskId);
      mirrorTaskCreate(dir, taskId, attrs, []);
      this.recordMirrorWrites(taskId);
    }
    return taskId;
  }

  async updateTask(taskId: string, patch: {
    title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority;
    tags?: string[]; dueDate?: number | null; estimate?: number | null; assignee?: string | null;
  }, expectedVersion?: number): Promise<boolean> {
    const existing = getTask(this._graph, taskId);
    if (!existing) return false;

    const embedText = `${patch.title ?? existing.title} ${patch.description ?? existing.description}`;
    const embedding = await this.embedFns.document(embedText);
    updateTask(this._graph, taskId, patch, embedding, this.ctx.author, expectedVersion);
    this._bm25Index.updateDocument(taskId, this._graph.getNodeAttributes(taskId));
    this.ctx.markDirty();
    this.ctx.emit('task:updated', { projectId: this.ctx.projectId, taskId });
    const dir = this.tasksDir;
    if (dir) {
      const attrs = this._graph.getNodeAttributes(taskId);
      const relations = listTaskRelations(this._graph, taskId, this.ext);
      mirrorTaskUpdate(dir, taskId, { ...patch, by: this.ctx.author }, attrs, relations);
      this.recordMirrorWrites(taskId);
    }
    return true;
  }

  deleteTask(taskId: string): boolean {
    if (this.tasksDir) deleteMirrorDir(this.tasksDir, taskId);

    this._bm25Index.removeDocument(taskId);
    const ok = deleteTask(this._graph, taskId);
    if (!ok) return false;

    // Clean up proxy in KnowledgeGraph if any note links to this task
    if (this.knowledgeGraph) {
      const toRemove: string[] = [];
      this.knowledgeGraph.forEachNode((id, attrs) => {
        if (attrs.proxyFor?.graph === 'tasks' && attrs.proxyFor.nodeId === taskId) {
          toRemove.push(id);
        }
      });
      for (const id of toRemove) this.knowledgeGraph.dropNode(id);
    }

    this.ctx.markDirty();
    this.ctx.emit('task:deleted', { projectId: this.ctx.projectId, taskId });
    return true;
  }

  moveTask(taskId: string, status: TaskStatus, expectedVersion?: number): boolean {
    const ok = moveTask(this._graph, taskId, status, expectedVersion);
    if (!ok) return false;
    this.ctx.markDirty();
    this.ctx.emit('task:moved', { projectId: this.ctx.projectId, taskId, status });
    const dir = this.tasksDir;
    if (dir) {
      const attrs = this._graph.getNodeAttributes(taskId);
      const relations = listTaskRelations(this._graph, taskId, this.ext);
      mirrorTaskUpdate(dir, taskId, { status, completedAt: attrs.completedAt, by: this.ctx.author }, attrs, relations);
      this.recordMirrorWrites(taskId);
    }
    return true;
  }

  linkTasks(fromId: string, toId: string, kind: string): boolean {
    const ok = createTaskRelation(this._graph, fromId, toId, kind);
    if (ok) {
      this.ctx.markDirty();
      const dir = this.tasksDir;
      if (dir) {
        const fromAttrs = this._graph.getNodeAttributes(fromId);
        const fromRels = listTaskRelations(this._graph, fromId, this.ext);
        mirrorTaskRelation(dir, fromId, 'add', kind, toId, fromAttrs, fromRels);
        this.recordMirrorWrites(fromId);
      }
    }
    return ok;
  }

  createCrossLink(taskId: string, targetId: string, targetGraph: TaskCrossGraphType, kind: string, projectId?: string): boolean {
    const pid = projectId || this.ctx.projectId;
    const extGraph = resolveExternalGraph(this.ext, targetGraph, pid);
    const ok = createCrossRelation(this._graph, taskId, targetGraph, targetId, kind, extGraph, pid);
    // Bidirectional: create mirror proxy in KnowledgeGraph
    if (ok && targetGraph === 'knowledge' && this.knowledgeGraph) {
      createMirrorInKnowledgeGraph(this.knowledgeGraph, taskId, targetId, kind);
    }
    if (ok) {
      this.ctx.markDirty();
      const dir = this.tasksDir;
      if (dir) {
        const attrs = this._graph.getNodeAttributes(taskId);
        const relations = listTaskRelations(this._graph, taskId, this.ext);
        mirrorTaskRelation(dir, taskId, 'add', kind, targetId, attrs, relations, targetGraph);
        this.recordMirrorWrites(taskId);
      }
    }
    return ok;
  }

  deleteCrossLink(taskId: string, targetId: string, targetGraph: TaskCrossGraphType, projectId?: string): boolean {
    const pid = projectId || this.ctx.projectId;
    // Read edge kind before deleting
    let kind = '';
    try {
      const proxyNodeId = proxyId(targetGraph, targetId, pid);
      if (this._graph.hasEdge(taskId, proxyNodeId)) {
        const ek = this._graph.edge(taskId, proxyNodeId);
        if (ek) kind = this._graph.getEdgeAttribute(ek, 'kind') ?? '';
      }
    } catch { /* ignore */ }

    const ok = deleteCrossRelation(this._graph, taskId, targetGraph, targetId, pid);
    // Bidirectional: remove mirror proxy from KnowledgeGraph
    if (ok && targetGraph === 'knowledge' && this.knowledgeGraph) {
      deleteMirrorFromKnowledgeGraph(this.knowledgeGraph, taskId, targetId);
    }
    if (ok) {
      this.ctx.markDirty();
      const dir = this.tasksDir;
      if (dir) {
        const attrs = this._graph.getNodeAttributes(taskId);
        const relations = listTaskRelations(this._graph, taskId, this.ext);
        mirrorTaskRelation(dir, taskId, 'remove', kind, targetId, attrs, relations, targetGraph);
        this.recordMirrorWrites(taskId);
      }
    }
    return ok;
  }

  deleteTaskLink(fromId: string, toId: string): boolean {
    // Read edge kind before deleting
    let kind = '';
    try {
      if (this._graph.hasEdge(fromId, toId)) {
        const ek = this._graph.edge(fromId, toId);
        if (ek) kind = this._graph.getEdgeAttribute(ek, 'kind') ?? '';
      }
    } catch { /* ignore */ }

    const ok = deleteTaskRelation(this._graph, fromId, toId);
    if (ok) {
      this.ctx.markDirty();
      const dir = this.tasksDir;
      if (dir) {
        const fromAttrs = this._graph.getNodeAttributes(fromId);
        const fromRels = listTaskRelations(this._graph, fromId, this.ext);
        mirrorTaskRelation(dir, fromId, 'remove', kind, toId, fromAttrs, fromRels);
        this.recordMirrorWrites(fromId);
      }
    }
    return ok;
  }

  // -- Attachments --

  addAttachment(taskId: string, filename: string, data: Buffer): AttachmentMeta | null {
    const dir = this.tasksDir;
    if (!dir) return null;
    if (!this._graph.hasNode(taskId) || isProxy(this._graph, taskId)) return null;
    if (data.length > MAX_ATTACHMENT_SIZE) return null;

    const entityDir = path.join(dir, taskId);
    const existing = scanAttachments(entityDir);
    if (existing.length >= MAX_ATTACHMENTS_PER_ENTITY) return null;

    const safe = sanitizeFilename(filename);
    if (!safe) return null;

    writeAttachment(dir, taskId, safe, data);
    this.mirrorTracker?.recordWrite(path.join(entityDir, 'attachments', safe));
    mirrorAttachmentEvent(entityDir, 'add', safe);
    this.mirrorTracker?.recordWrite(path.join(entityDir, 'events.jsonl'));

    const attachments = scanAttachments(entityDir);
    this._graph.setNodeAttribute(taskId, 'attachments', attachments);
    this._graph.setNodeAttribute(taskId, 'updatedAt', Date.now());
    this.ctx.markDirty();
    this.ctx.emit('task:attachment:added', { projectId: this.ctx.projectId, taskId, filename: safe });

    return attachments.find(a => a.filename === safe) ?? null;
  }

  removeAttachment(taskId: string, filename: string): boolean {
    const dir = this.tasksDir;
    if (!dir) return false;
    if (!this._graph.hasNode(taskId) || isProxy(this._graph, taskId)) return false;

    const safe = sanitizeFilename(filename);
    const entityDir = path.join(dir, taskId);
    const deleted = deleteAttachment(dir, taskId, safe);
    if (!deleted) return false;

    this.mirrorTracker?.recordWrite(path.join(entityDir, 'attachments', safe));
    mirrorAttachmentEvent(entityDir, 'remove', safe);
    this.mirrorTracker?.recordWrite(path.join(entityDir, 'events.jsonl'));

    const attachments = scanAttachments(entityDir);
    this._graph.setNodeAttribute(taskId, 'attachments', attachments);
    this._graph.setNodeAttribute(taskId, 'updatedAt', Date.now());
    this.ctx.markDirty();
    this.ctx.emit('task:attachment:deleted', { projectId: this.ctx.projectId, taskId, filename: safe });
    return true;
  }

  syncAttachments(taskId: string): void {
    const dir = this.tasksDir;
    if (!dir) return;
    if (!this._graph.hasNode(taskId) || isProxy(this._graph, taskId)) return;

    const attachments = scanAttachments(path.join(dir, taskId));
    this._graph.setNodeAttribute(taskId, 'attachments', attachments);
    this._graph.setNodeAttribute(taskId, 'updatedAt', Date.now());
    this._graph.setNodeAttribute(taskId, 'version', (this._graph.getNodeAttribute(taskId, 'version') ?? 0) + 1);
    this.ctx.markDirty();
  }

  listAttachments(taskId: string): AttachmentMeta[] {
    if (!this._graph.hasNode(taskId) || isProxy(this._graph, taskId)) return [];
    return this._graph.getNodeAttribute(taskId, 'attachments') ?? [];
  }

  getAttachmentPath(taskId: string, filename: string): string | null {
    const dir = this.tasksDir;
    if (!dir) return null;
    return getAttPath(dir, taskId, filename);
  }

  // -- Import from file (reverse mirror — does NOT write back to file) --

  async importFromFile(parsed: ParsedTaskFile): Promise<void> {
    const exists = this._graph.hasNode(parsed.id) && !isProxy(this._graph, parsed.id);
    const embedding = await this.embedFns.document(`${parsed.title} ${parsed.description}`);
    const now = Date.now();

    if (exists) {
      const existing = this._graph.getNodeAttributes(parsed.id);
      this._graph.mergeNodeAttributes(parsed.id, {
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        priority: parsed.priority,
        tags: parsed.tags,
        dueDate: parsed.dueDate,
        estimate: parsed.estimate,
        completedAt: parsed.completedAt,
        assignee: parsed.assignee ?? existing.assignee,
        embedding,
        attachments: parsed.attachments,
        updatedAt: now,
        createdAt: existing.createdAt,
        version: parsed.version ?? existing.version + 1,
        ...(parsed.createdBy != null ? { createdBy: parsed.createdBy } : {}),
        ...(parsed.updatedBy != null ? { updatedBy: parsed.updatedBy } : {}),
      });
    } else {
      this._graph.addNode(parsed.id, {
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        priority: parsed.priority,
        tags: parsed.tags,
        dueDate: parsed.dueDate,
        estimate: parsed.estimate,
        completedAt: parsed.completedAt,
        assignee: (parsed as any).assignee ?? null,
        embedding,
        attachments: parsed.attachments ?? [],
        createdAt: parsed.createdAt ?? now,
        updatedAt: now,
        version: parsed.version ?? 1,
        createdBy: parsed.createdBy ?? undefined,
        updatedBy: parsed.updatedBy ?? undefined,
      });
    }

    this._bm25Index.updateDocument(parsed.id, this._graph.getNodeAttributes(parsed.id));

    this.syncRelationsFromFile(parsed.id, parsed.relations);

    this.ctx.markDirty();
    this.ctx.emit(exists ? 'task:updated' : 'task:created', { projectId: this.ctx.projectId, taskId: parsed.id });
  }

  updateDescriptionFromFile(taskId: string, description: string): void {
    if (!this._graph.hasNode(taskId) || isProxy(this._graph, taskId)) return;
    this._graph.setNodeAttribute(taskId, 'description', description);
    this._graph.setNodeAttribute(taskId, 'updatedAt', Date.now());
    this._graph.setNodeAttribute(taskId, 'version', (this._graph.getNodeAttribute(taskId, 'version') ?? 0) + 1);
    this.ctx.markDirty();
    this.ctx.emit('task:updated', { projectId: this.ctx.projectId, taskId });
  }

  deleteFromFile(taskId: string): void {
    if (!this._graph.hasNode(taskId)) return;
    if (isProxy(this._graph, taskId)) return;

    this._bm25Index.removeDocument(taskId);
    deleteTask(this._graph, taskId);

    if (this.knowledgeGraph) {
      const pId = `@tasks::${taskId}`;
      if (this.knowledgeGraph.hasNode(pId)) this.knowledgeGraph.dropNode(pId);
    }

    this.ctx.markDirty();
    this.ctx.emit('task:deleted', { projectId: this.ctx.projectId, taskId });
  }

  private syncRelationsFromFile(taskId: string, desired: RelationFrontmatter[]): void {
    const current: RelationFrontmatter[] = [];
    this._graph.forEachOutEdge(taskId, (_edge, attrs, _src, target) => {
      const proxy = this._graph.hasNode(target) ? this._graph.getNodeAttribute(target, 'proxyFor') : undefined;
      if (proxy) {
        current.push({ to: proxy.nodeId, kind: attrs.kind, graph: proxy.graph });
      } else {
        current.push({ to: target, kind: attrs.kind });
      }
    });

    const diff = diffRelations(current, desired);

    for (const rel of diff.toRemove) {
      if (rel.graph) {
        deleteCrossRelation(this._graph, taskId, rel.graph as TaskCrossGraphType, rel.to);
        if (rel.graph === 'knowledge' && this.knowledgeGraph) {
          deleteMirrorFromKnowledgeGraph(this.knowledgeGraph, taskId, rel.to);
        }
      } else {
        deleteTaskRelation(this._graph, taskId, rel.to);
      }
    }

    for (const rel of diff.toAdd) {
      if (rel.graph) {
        const extGraph = resolveExternalGraph(this.ext, rel.graph as TaskCrossGraphType);
        createCrossRelation(this._graph, taskId, rel.graph as TaskCrossGraphType, rel.to, rel.kind, extGraph);
        if (rel.graph === 'knowledge' && this.knowledgeGraph) {
          createMirrorInKnowledgeGraph(this.knowledgeGraph, taskId, rel.to, rel.kind);
        }
      } else {
        createTaskRelation(this._graph, taskId, rel.to, rel.kind);
      }
    }
  }

  // -- Read --

  getTask(taskId: string) {
    return getTask(this._graph, taskId);
  }

  listTasks(opts?: {
    status?: TaskStatus; priority?: TaskPriority; tag?: string; filter?: string; assignee?: string; limit?: number;
  }) {
    return listTasks(this._graph, opts);
  }

  async searchTasks(query: string, opts?: {
    topK?: number; bfsDepth?: number; maxResults?: number; minScore?: number; bfsDecay?: number;
    searchMode?: 'hybrid' | 'vector' | 'keyword'; rrfK?: number;
  }): Promise<TaskSearchResult[]> {
    const embedding = opts?.searchMode === 'keyword' ? [] : await this.embedFns.query(query);
    return searchTasks(this._graph, embedding, { ...opts, queryText: query, bm25Index: this._bm25Index });
  }

  listRelations(taskId: string) {
    return listTaskRelations(this._graph, taskId, this.ext);
  }

  findLinkedTasks(targetGraph: TaskCrossGraphType, targetNodeId: string, kind?: string, projectId?: string) {
    return findLinkedTasks(this._graph, targetGraph, targetNodeId, kind, projectId || this.ctx.projectId);
  }
}
