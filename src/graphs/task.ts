import fs from 'fs';
import path from 'path';
import type { TaskGraph, TaskNodeAttributes, TaskEdgeAttributes, TaskCrossGraphType, TaskStatus, TaskPriority, EpicStatus } from '@/graphs/task-types';
import type { AttachmentMeta } from '@/graphs/attachment-types';
import { createTaskGraph, PRIORITY_ORDER, isTerminal } from '@/graphs/task-types';
import { generateId } from '@/graphs/knowledge-types';
import type { DirectedGraph } from 'graphology';
import type { EmbedFns, GraphManagerContext, ExternalGraphs } from '@/graphs/manager-types';
import { resolveExternalGraph, VersionConflictError } from '@/graphs/manager-types';
import { searchTasks, type TaskSearchResult } from '@/lib/search/tasks';
import { BM25Index } from '@/lib/search/bm25';
import { mirrorTaskCreate, mirrorTaskUpdate, mirrorTaskRelation, mirrorAttachmentEvent, deleteMirrorDir, writeAttachment, deleteAttachment, getAttachmentPath as getAttPath, sanitizeFilename } from '@/lib/file-mirror';
import { compressEmbeddings, decompressEmbeddings } from '@/lib/embedding-codec';
import { readJsonWithTmpFallback, validateGraphStructure } from '@/lib/graph-persistence';
import { LIST_PAGE_SIZE, CONTENT_PREVIEW_LEN, GRAPH_DATA_VERSION } from '@/lib/defaults';
import type { PaginatedResult } from '@/lib/pagination';
import type { MirrorWriteTracker } from '@/lib/mirror-watcher';
import type { ParsedTaskFile } from '@/lib/file-import';
import { createLogger } from '@/lib/logger';

const log = createLogger('task-graph');
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
      order: 0,
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
// Order helpers
// ---------------------------------------------------------------------------

const ORDER_GAP = 1000;

/** Compute the next order value for a given status group. */
export function nextOrderForStatus(graph: TaskGraph, status: TaskStatus): number {
  let max = -ORDER_GAP;
  graph.forEachNode((_id, attrs: TaskNodeAttributes) => {
    if (attrs.proxyFor) return;
    if (attrs.status === status && (attrs.order ?? 0) > max) {
      max = attrs.order ?? 0;
    }
  });
  return max + ORDER_GAP;
}

/** Rebalance order values for all tasks in a status group to multiples of ORDER_GAP. */
export function rebalanceOrders(graph: TaskGraph, status: TaskStatus): void {
  const nodes: Array<{ id: string; order: number }> = [];
  graph.forEachNode((id, attrs: TaskNodeAttributes) => {
    if (attrs.proxyFor) return;
    if (attrs.status === status) {
      nodes.push({ id, order: attrs.order ?? 0 });
    }
  });
  nodes.sort((a, b) => a.order - b.order);
  for (let i = 0; i < nodes.length; i++) {
    graph.setNodeAttribute(nodes[i].id, 'order', i * ORDER_GAP);
  }
}

/** Reorder a task: set new order (and optionally new status). Rebalances if gap is too small. */
export function reorderTask(
  graph: TaskGraph,
  taskId: string,
  newOrder: number,
  newStatus?: TaskStatus,
): boolean {
  if (!graph.hasNode(taskId)) return false;
  if (isProxy(graph, taskId)) return false;

  const oldStatus = graph.getNodeAttribute(taskId, 'status');
  const targetStatus = newStatus ?? oldStatus;

  if (newStatus !== undefined && newStatus !== oldStatus) {
    // Handle status change with completedAt auto-logic
    graph.setNodeAttribute(taskId, 'status', newStatus);
    if (isTerminal(newStatus) && !isTerminal(oldStatus)) {
      graph.setNodeAttribute(taskId, 'completedAt', Date.now());
    } else if (!isTerminal(newStatus) && isTerminal(oldStatus)) {
      graph.setNodeAttribute(taskId, 'completedAt', null);
    }
  }

  graph.setNodeAttribute(taskId, 'order', newOrder);
  graph.setNodeAttribute(taskId, 'version', graph.getNodeAttribute(taskId, 'version') + 1);
  graph.setNodeAttribute(taskId, 'updatedAt', Date.now());

  // Check if rebalance needed: look for collisions in the target status group
  let needsRebalance = false;
  graph.forEachNode((id, attrs: TaskNodeAttributes) => {
    if (id === taskId || attrs.proxyFor) return;
    if (attrs.status === targetStatus && attrs.order === newOrder) {
      needsRebalance = true;
    }
  });
  if (needsRebalance) {
    rebalanceOrders(graph, targetStatus);
  }

  return true;
}

// ---------------------------------------------------------------------------
// CRUD — Tasks
// ---------------------------------------------------------------------------

/** Create a task, return its UUID ID. */
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
  order?: number,
): string {
  const id = generateId();
  const now = Date.now();
  const effectiveOrder = order ?? nextOrderForStatus(graph, status);
  graph.addNode(id, {
    title,
    description,
    status,
    priority,
    tags,
    order: effectiveOrder,
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
    order?: number;
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
  if (patch.order !== undefined)       graph.setNodeAttribute(taskId, 'order', patch.order);
  if (patch.dueDate !== undefined)     graph.setNodeAttribute(taskId, 'dueDate', patch.dueDate);
  if (patch.estimate !== undefined)    graph.setNodeAttribute(taskId, 'estimate', patch.estimate);
  if (patch.assignee !== undefined)    graph.setNodeAttribute(taskId, 'assignee', patch.assignee);
  if (embedding !== undefined)         graph.setNodeAttribute(taskId, 'embedding', embedding);
  if (author)                          graph.setNodeAttribute(taskId, 'updatedBy', author);

  // Handle status change with completedAt auto-logic
  if (patch.status !== undefined) {
    const oldStatus = graph.getNodeAttribute(taskId, 'status');
    graph.setNodeAttribute(taskId, 'status', patch.status);
    if (isTerminal(patch.status) && !isTerminal(oldStatus)) {
      graph.setNodeAttribute(taskId, 'completedAt', Date.now());
    } else if (!isTerminal(patch.status) && isTerminal(oldStatus)) {
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
  targetOrder?: number,
): boolean {
  if (!graph.hasNode(taskId)) return false;
  if (isProxy(graph, taskId)) return false;

  if (expectedVersion !== undefined) {
    const current = graph.getNodeAttribute(taskId, 'version');
    if (current !== expectedVersion) throw new VersionConflictError(current, expectedVersion);
  }

  const oldStatus = graph.getNodeAttribute(taskId, 'status');
  graph.setNodeAttribute(taskId, 'status', newStatus);

  if (isTerminal(newStatus) && !isTerminal(oldStatus)) {
    graph.setNodeAttribute(taskId, 'completedAt', Date.now());
  } else if (!isTerminal(newStatus) && isTerminal(oldStatus)) {
    graph.setNodeAttribute(taskId, 'completedAt', null);
  }

  // Update order: use provided targetOrder, or append to end of new status group
  const effectiveOrder = targetOrder ?? (oldStatus !== newStatus ? nextOrderForStatus(graph, newStatus) : graph.getNodeAttribute(taskId, 'order'));
  graph.setNodeAttribute(taskId, 'order', effectiveOrder);

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
  order: number;
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

/** Get a task by ID, or null if not found. Excludes proxy nodes and epics. */
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
  if (graph.getNodeAttribute(taskId, 'nodeType') === 'epic') return null;

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
    order: attrs.order ?? 0,
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

/** List tasks with optional filters. Excludes proxy nodes and epics. */
export function listTasks(
  graph: TaskGraph,
  opts: {
    status?: TaskStatus;
    priority?: TaskPriority;
    tag?: string;
    filter?: string;
    assignee?: string;
    limit?: number;
    offset?: number;
  } = {},
): PaginatedResult<TaskEntry> {
  const { status, priority, tag, filter, assignee, limit = LIST_PAGE_SIZE, offset = 0 } = opts;
  const lowerFilter = filter?.toLowerCase();
  const lowerTag = tag?.toLowerCase();

  const results: TaskEntry[] = [];

  graph.forEachNode((id, attrs: TaskNodeAttributes) => {
    if (attrs.proxyFor) return;
    if (attrs.nodeType === 'epic') return;
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
      order: attrs.order ?? 0,
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

  const sorted = results.sort((a, b) => {
    // Sort by priority (critical first), then order (ascending), then dueDate (earliest first, nulls last)
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    const oDiff = a.order - b.order;
    if (oDiff !== 0) return oDiff;
    if (a.dueDate === null && b.dueDate === null) return 0;
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate - b.dueDate;
  });
  return { results: sorted.slice(offset, offset + limit), total: sorted.length };
}

// ---------------------------------------------------------------------------
// CRUD — Epics (stored in same graph with nodeType='epic')
// ---------------------------------------------------------------------------

export interface EpicEntry {
  id: string;
  title: string;
  description: string;
  status: EpicStatus;
  priority: TaskPriority;
  tags: string[];
  order: number;
  createdAt: number;
  updatedAt: number;
  version: number;
  attachments: AttachmentMeta[];
  progress: { done: number; total: number };
}

function epicProgress(graph: TaskGraph, epicId: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  graph.forEachInEdge(epicId, (_edge, edgeAttrs: TaskEdgeAttributes, source) => {
    if (edgeAttrs.kind !== 'belongs_to') return;
    if (isProxy(graph, source)) return;
    total++;
    const s = graph.getNodeAttribute(source, 'status');
    if (isTerminal(s)) done++;
  });
  return { done, total };
}

export function createEpic(
  graph: TaskGraph,
  title: string,
  description: string,
  status: EpicStatus,
  priority: TaskPriority,
  tags: string[],
  embedding: number[],
  author = '',
  order?: number,
): string {
  const id = generateId();
  const now = Date.now();
  const effectiveOrder = order ?? nextOrderForStatus(graph, status as unknown as TaskStatus);
  graph.addNode(id, {
    title,
    description,
    status: status as unknown as TaskStatus,
    priority,
    tags,
    order: effectiveOrder,
    dueDate: null,
    estimate: null,
    completedAt: null,
    assignee: null,
    nodeType: 'epic',
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

export function updateEpic(
  graph: TaskGraph,
  epicId: string,
  patch: Partial<Pick<TaskNodeAttributes, 'title' | 'description' | 'priority' | 'tags'>>,
  newStatus?: EpicStatus,
  expectedVersion?: number,
  author?: string,
): boolean {
  if (!graph.hasNode(epicId)) return false;
  if (graph.getNodeAttribute(epicId, 'nodeType') !== 'epic') return false;

  const current = graph.getNodeAttribute(epicId, 'version');
  if (expectedVersion !== undefined && current !== expectedVersion) {
    throw new VersionConflictError(current, expectedVersion);
  }

  const now = Date.now();
  if (patch.title !== undefined) graph.setNodeAttribute(epicId, 'title', patch.title);
  if (patch.description !== undefined) graph.setNodeAttribute(epicId, 'description', patch.description);
  if (patch.priority !== undefined) graph.setNodeAttribute(epicId, 'priority', patch.priority);
  if (patch.tags !== undefined) graph.setNodeAttribute(epicId, 'tags', patch.tags);
  if (newStatus !== undefined) {
    graph.setNodeAttribute(epicId, 'status', newStatus as unknown as TaskStatus);
    if (isTerminal(newStatus) && !graph.getNodeAttribute(epicId, 'completedAt')) {
      graph.setNodeAttribute(epicId, 'completedAt', now);
    } else if (!isTerminal(newStatus)) {
      graph.setNodeAttribute(epicId, 'completedAt', null);
    }
  }
  graph.setNodeAttribute(epicId, 'version', current + 1);
  graph.setNodeAttribute(epicId, 'updatedAt', now);
  if (author) graph.setNodeAttribute(epicId, 'updatedBy', author);
  return true;
}

export function deleteEpic(graph: TaskGraph, epicId: string): boolean {
  if (!graph.hasNode(epicId)) return false;
  if (graph.getNodeAttribute(epicId, 'nodeType') !== 'epic') return false;
  graph.dropNode(epicId);
  return true;
}

export function getEpic(graph: TaskGraph, epicId: string): (EpicEntry & { crossLinks: CrossLinkEntry[] }) | null {
  if (!graph.hasNode(epicId)) return null;
  if (graph.getNodeAttribute(epicId, 'nodeType') !== 'epic') return null;

  const attrs = graph.getNodeAttributes(epicId);
  const crossLinks: CrossLinkEntry[] = [];

  graph.forEachOutEdge(epicId, (_edge, edgeAttrs: TaskEdgeAttributes, _source, target) => {
    if (!isProxy(graph, target)) return;
    const proxyFor = graph.getNodeAttribute(target, 'proxyFor');
    if (proxyFor) {
      crossLinks.push({ nodeId: proxyFor.nodeId, targetGraph: proxyFor.graph, kind: edgeAttrs.kind, direction: 'outgoing' });
    }
  });

  graph.forEachInEdge(epicId, (_edge, edgeAttrs: TaskEdgeAttributes, source) => {
    if (!isProxy(graph, source)) return;
    const proxyFor = graph.getNodeAttribute(source, 'proxyFor');
    if (proxyFor) {
      crossLinks.push({ nodeId: proxyFor.nodeId, targetGraph: proxyFor.graph, kind: edgeAttrs.kind, direction: 'incoming' });
    }
  });

  return {
    id: epicId,
    title: attrs.title,
    description: attrs.description,
    status: attrs.status as unknown as EpicStatus,
    priority: attrs.priority,
    tags: attrs.tags,
    order: attrs.order ?? 0,
    createdAt: attrs.createdAt,
    updatedAt: attrs.updatedAt,
    version: attrs.version,
    attachments: attrs.attachments ?? [],
    progress: epicProgress(graph, epicId),
    crossLinks,
  };
}

export function listEpics(
  graph: TaskGraph,
  opts: { status?: EpicStatus; priority?: TaskPriority; tag?: string; filter?: string; limit?: number; offset?: number } = {},
): PaginatedResult<EpicEntry> {
  const { status, priority, tag, filter, limit = LIST_PAGE_SIZE, offset = 0 } = opts;
  const lowerFilter = filter?.toLowerCase();
  const lowerTag = tag?.toLowerCase();
  const results: EpicEntry[] = [];

  graph.forEachNode((id, attrs: TaskNodeAttributes) => {
    if (attrs.proxyFor) return;
    if (attrs.nodeType !== 'epic') return;
    if (status && (attrs.status as unknown as EpicStatus) !== status) return;
    if (priority && attrs.priority !== priority) return;
    if (lowerTag && !attrs.tags.some(t => t.toLowerCase() === lowerTag)) return;
    if (lowerFilter) {
      const match = id.toLowerCase().includes(lowerFilter) || attrs.title.toLowerCase().includes(lowerFilter);
      if (!match) return;
    }
    results.push({
      id,
      title: attrs.title,
      description: attrs.description?.slice(0, CONTENT_PREVIEW_LEN),
      status: attrs.status as unknown as EpicStatus,
      priority: attrs.priority,
      tags: attrs.tags,
      order: attrs.order ?? 0,
      createdAt: attrs.createdAt,
      updatedAt: attrs.updatedAt,
      version: attrs.version,
      attachments: attrs.attachments ?? [],
      progress: epicProgress(graph, id),
    });
  });

  const sorted = results.sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.order - b.order;
  });
  return { results: sorted.slice(offset, offset + limit), total: sorted.length };
}

export function linkTaskToEpic(graph: TaskGraph, taskId: string, epicId: string): boolean {
  if (!graph.hasNode(taskId) || !graph.hasNode(epicId)) return false;
  if (graph.getNodeAttribute(epicId, 'nodeType') !== 'epic') return false;
  if (isProxy(graph, taskId)) return false;
  const edgeKey = `${taskId}→${epicId}`;
  if (graph.hasEdge(edgeKey)) return false;
  graph.addEdgeWithKey(edgeKey, taskId, epicId, { kind: 'belongs_to' });
  return true;
}

export function unlinkTaskFromEpic(graph: TaskGraph, taskId: string, epicId: string): boolean {
  const edgeKey = `${taskId}→${epicId}`;
  if (!graph.hasEdge(edgeKey)) return false;
  graph.dropEdge(edgeKey);
  return true;
}

/** List tasks belonging to an epic (via belongs_to edges). */
export function listEpicTasks(graph: TaskGraph, epicId: string): TaskEntry[] {
  if (!graph.hasNode(epicId)) return [];
  const results: TaskEntry[] = [];
  graph.forEachInEdge(epicId, (_edge, edgeAttrs: TaskEdgeAttributes, source) => {
    if (edgeAttrs.kind !== 'belongs_to') return;
    if (isProxy(graph, source)) return;
    const attrs = graph.getNodeAttributes(source);
    results.push({
      id: source,
      title: attrs.title,
      description: attrs.description?.slice(0, CONTENT_PREVIEW_LEN),
      status: attrs.status,
      priority: attrs.priority,
      tags: attrs.tags,
      order: attrs.order ?? 0,
      dueDate: attrs.dueDate,
      estimate: attrs.estimate,
      completedAt: attrs.completedAt,
      assignee: attrs.assignee ?? null,
      createdAt: attrs.createdAt,
      updatedAt: attrs.updatedAt,
      version: attrs.version,
      attachments: attrs.attachments ?? [],
    });
  });
  return results.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.order - b.order);
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
    // Outgoing: taskId → proxy(targetId) — task created this link
    if (graph.hasEdge(fromTaskId, pId)) {
      graph.dropEdge(fromTaskId, pId);
      cleanupProxy(graph, pId);
      return true;
    }
    // Incoming: proxy(targetId) → taskId — mirror from another graph
    if (graph.hasEdge(pId, fromTaskId)) {
      graph.dropEdge(pId, fromTaskId);
      cleanupProxy(graph, pId);
      return true;
    }
  }

  // Also check reverse proxy direction: proxy(fromId) → targetId
  // This handles the case when resolveEntry swaps fromId/toId for incoming mirrors,
  // e.g. UI sends {fromId: noteId, toId: taskId} but the edge is @knowledge::noteId → taskId
  const reverseCandidates = [proxyId(targetGraph, fromTaskId, projectId)];
  if (projectId) reverseCandidates.push(proxyId(targetGraph, fromTaskId));

  for (const pId of reverseCandidates) {
    if (graph.hasEdge(pId, targetNodeId)) {
      graph.dropEdge(pId, targetNodeId);
      cleanupProxy(graph, pId);
      return true;
    }
    if (graph.hasEdge(targetNodeId, pId)) {
      graph.dropEdge(targetNodeId, pId);
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
    fs.writeFileSync(tmp, JSON.stringify({ version: GRAPH_DATA_VERSION, embeddingModel: embeddingFingerprint, graph: exported }));
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
    const storedVersion = data.version as number | undefined;
    const stored = data.embeddingModel as string | undefined;
    const needsReEmbed = (storedVersion !== GRAPH_DATA_VERSION) ||
      (embeddingFingerprint != null && stored !== embeddingFingerprint);

    if (needsReEmbed && storedVersion !== GRAPH_DATA_VERSION) {
      log.warn({ storedVersion: storedVersion ?? 'none', currentVersion: GRAPH_DATA_VERSION }, 'Data version changed, preserving user data, clearing embeddings');
    } else if (needsReEmbed) {
      log.warn('Embedding config changed, preserving user data, clearing embeddings');
    }

    if (!validateGraphStructure(data.graph)) {
      log.warn({ file }, 'Invalid graph structure, starting fresh');
      return graph;
    }

    decompressEmbeddings(data.graph);
    graph.import(data.graph);

    if (needsReEmbed) {
      graph.forEachNode((id, attrs) => {
        if (!attrs.proxyFor) graph.setNodeAttribute(id, 'embedding', []);
      });
      log.info({ nodes: graph.order }, 'Loaded graph (embeddings cleared for re-generation)');
    } else {
      log.info({ nodes: graph.order, edges: graph.size }, 'Loaded graph');
    }
  } catch (err) {
    log.error({ err }, 'Failed to load graph, starting fresh');
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
  projectId?: string,
): void {
  const mirrorProxyId = projectId ? `@tasks::${projectId}::${taskId}` : `@tasks::${taskId}`;
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
      proxyFor: { graph: 'tasks', nodeId: taskId, ...(projectId ? { projectId } : {}) },
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
  projectId?: string,
): void {
  const candidates = projectId
    ? [`@tasks::${projectId}::${taskId}`, `@tasks::${taskId}`]
    : [`@tasks::${taskId}`];
  for (const mirrorProxyId of candidates) {
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
}

// ---------------------------------------------------------------------------
// TaskGraphManager — unified API for task graph operations
// ---------------------------------------------------------------------------

export class TaskGraphManager {
  private knowledgeGraph?: DirectedGraph;
  private mirrorTracker?: MirrorWriteTracker;
  private _bm25Index: BM25Index<TaskNodeAttributes>;

  get projectDir(): string | undefined { return this.ctx.projectDir; }

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
    // Migration: assign order to existing nodes that don't have it
    this._migrateOrderField();
    this._graph.forEachNode((id, attrs) => {
      if (!attrs.proxyFor) this._bm25Index.addDocument(id, attrs);
    });
  }

  /** One-time migration: assign order to nodes that lack it (pre-order-field data). */
  private _migrateOrderField(): void {
    const byStatus = new Map<TaskStatus, Array<{ id: string; priority: number; dueDate: number | null }>>();
    this._graph.forEachNode((id, attrs: TaskNodeAttributes) => {
      if (attrs.proxyFor) return;
      if (attrs.order !== undefined && attrs.order !== null) return;
      let arr = byStatus.get(attrs.status);
      if (!arr) { arr = []; byStatus.set(attrs.status, arr); }
      arr.push({ id, priority: PRIORITY_ORDER[attrs.priority] ?? 3, dueDate: attrs.dueDate });
    });
    for (const [, nodes] of byStatus) {
      nodes.sort((a, b) => {
        const pDiff = a.priority - b.priority;
        if (pDiff !== 0) return pDiff;
        if (a.dueDate === null && b.dueDate === null) return 0;
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate - b.dueDate;
      });
      for (let i = 0; i < nodes.length; i++) {
        this._graph.setNodeAttribute(nodes[i].id, 'order', i * 1000);
      }
    }
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
    order?: number,
    author?: string,
  ): Promise<string> {
    const by = author ?? this.ctx.author;
    const embedding = await this.embedFns.document(`${title} ${description}`);
    const taskId = createTask(this._graph, title, description, status, priority, tags, embedding, dueDate, estimate, by, assignee, order);
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
  }, expectedVersion?: number, author?: string): Promise<boolean> {
    const by = author ?? this.ctx.author;
    const existing = getTask(this._graph, taskId);
    if (!existing) return false;

    const embedText = `${patch.title ?? existing.title} ${patch.description ?? existing.description}`;
    const embedding = await this.embedFns.document(embedText);
    updateTask(this._graph, taskId, patch, embedding, by, expectedVersion);
    this._bm25Index.updateDocument(taskId, this._graph.getNodeAttributes(taskId));
    this.ctx.markDirty();
    this.ctx.emit('task:updated', { projectId: this.ctx.projectId, taskId });
    const dir = this.tasksDir;
    if (dir) {
      const attrs = this._graph.getNodeAttributes(taskId);
      const relations = listTaskRelations(this._graph, taskId, this.ext);
      mirrorTaskUpdate(dir, taskId, { ...patch, by }, attrs, relations);
      this.recordMirrorWrites(taskId);
    }
    return true;
  }

  deleteTask(taskId: string, _author?: string): boolean {
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

  moveTask(taskId: string, status: TaskStatus, expectedVersion?: number, targetOrder?: number, author?: string): boolean {
    const by = author ?? this.ctx.author;
    const ok = moveTask(this._graph, taskId, status, expectedVersion, targetOrder);
    if (!ok) return false;
    this.ctx.markDirty();
    this.ctx.emit('task:moved', { projectId: this.ctx.projectId, taskId, status });
    const dir = this.tasksDir;
    if (dir) {
      const attrs = this._graph.getNodeAttributes(taskId);
      const relations = listTaskRelations(this._graph, taskId, this.ext);
      mirrorTaskUpdate(dir, taskId, { status, completedAt: attrs.completedAt, by }, attrs, relations);
      this.recordMirrorWrites(taskId);
    }
    return true;
  }

  reorderTask(taskId: string, order: number, status?: TaskStatus, author?: string): boolean {
    const by = author ?? this.ctx.author;
    const ok = reorderTask(this._graph, taskId, order, status);
    if (!ok) return false;
    this.ctx.markDirty();
    this.ctx.emit('task:reordered', { projectId: this.ctx.projectId, taskId });
    const dir = this.tasksDir;
    if (dir) {
      const attrs = this._graph.getNodeAttributes(taskId);
      const relations = listTaskRelations(this._graph, taskId, this.ext);
      mirrorTaskUpdate(dir, taskId, { order, ...(status ? { status, completedAt: attrs.completedAt } : {}), by }, attrs, relations);
      this.recordMirrorWrites(taskId);
    }
    return true;
  }

  linkTasks(fromId: string, toId: string, kind: string, author?: string): boolean {
    const by = author ?? this.ctx.author;
    const ok = createTaskRelation(this._graph, fromId, toId, kind);
    if (ok) {
      this.ctx.markDirty();
      this.ctx.emit('task:relation:added', { projectId: this.ctx.projectId, taskId: fromId, toId, kind });
      const dir = this.tasksDir;
      if (dir) {
        const fromAttrs = this._graph.getNodeAttributes(fromId);
        const fromRels = listTaskRelations(this._graph, fromId, this.ext);
        mirrorTaskRelation(dir, fromId, 'add', kind, toId, fromAttrs, fromRels, undefined, by);
        this.recordMirrorWrites(fromId);
      }
    }
    return ok;
  }

  createCrossLink(taskId: string, targetId: string, targetGraph: TaskCrossGraphType, kind: string, projectId?: string, author?: string): boolean {
    const by = author ?? this.ctx.author;
    const pid = projectId || this.ctx.projectId;
    const extGraph = resolveExternalGraph(this.ext, targetGraph, pid);
    const ok = createCrossRelation(this._graph, taskId, targetGraph, targetId, kind, extGraph, pid);
    // Bidirectional: create mirror proxy in KnowledgeGraph
    if (ok && targetGraph === 'knowledge' && this.knowledgeGraph) {
      createMirrorInKnowledgeGraph(this.knowledgeGraph, taskId, targetId, kind, pid);
    }
    if (ok) {
      this.ctx.markDirty();
      this.ctx.emit('task:relation:added', { projectId: this.ctx.projectId, taskId, toId: targetId, kind, targetGraph });
      const dir = this.tasksDir;
      if (dir) {
        const attrs = this._graph.getNodeAttributes(taskId);
        const relations = listTaskRelations(this._graph, taskId, this.ext);
        mirrorTaskRelation(dir, taskId, 'add', kind, targetId, attrs, relations, targetGraph, by);
        this.recordMirrorWrites(taskId);
      }
    }
    return ok;
  }

  deleteCrossLink(taskId: string, targetId: string, targetGraph: TaskCrossGraphType, projectId?: string, author?: string): boolean {
    const by = author ?? this.ctx.author;
    const pid = projectId || this.ctx.projectId;
    // Read edge kind before deleting — check both directions
    let kind = '';
    try {
      for (const tid of [targetId, taskId]) {
        const pnId = proxyId(targetGraph, tid, pid);
        const other = tid === targetId ? taskId : targetId;
        if (this._graph.hasEdge(other, pnId)) {
          const ek = this._graph.edge(other, pnId);
          if (ek) { kind = this._graph.getEdgeAttribute(ek, 'kind') ?? ''; break; }
        }
        if (this._graph.hasEdge(pnId, other)) {
          const ek = this._graph.edge(pnId, other);
          if (ek) { kind = this._graph.getEdgeAttribute(ek, 'kind') ?? ''; break; }
        }
      }
    } catch { /* ignore */ }

    const ok = deleteCrossRelation(this._graph, taskId, targetGraph, targetId, pid);
    if (ok && targetGraph === 'knowledge' && this.knowledgeGraph) {
      // Remove mirror/original edge from KnowledgeGraph in both directions.
      // Case 1: task created the link → mirror is @tasks::taskId → noteId
      deleteMirrorFromKnowledgeGraph(this.knowledgeGraph, taskId, targetId, pid);
      // Case 2: note created the link → original is noteId → @tasks::taskId (or targetId → @tasks::taskId)
      // Try both ID interpretations since resolveEntry may have swapped them
      for (const [noteCandidate, taskCandidate] of [[targetId, taskId], [taskId, targetId]]) {
        const proxyCandidates = pid
          ? [`@tasks::${pid}::${taskCandidate}`, `@tasks::${taskCandidate}`]
          : [`@tasks::${taskCandidate}`];
        for (const taskProxy of proxyCandidates) {
          if (this.knowledgeGraph.hasNode(taskProxy)) {
            // noteId → @tasks::taskId
            if (this.knowledgeGraph.hasEdge(noteCandidate, taskProxy)) {
              this.knowledgeGraph.dropEdge(noteCandidate, taskProxy);
              if (this.knowledgeGraph.degree(taskProxy) === 0) {
                this.knowledgeGraph.dropNode(taskProxy);
              }
            }
            // @tasks::taskId → noteId (mirror direction)
            if (this.knowledgeGraph.hasEdge(taskProxy, noteCandidate)) {
              this.knowledgeGraph.dropEdge(taskProxy, noteCandidate);
              if (this.knowledgeGraph.degree(taskProxy) === 0) {
                this.knowledgeGraph.dropNode(taskProxy);
              }
            }
          }
        }
      }
    }
    if (ok) {
      this.ctx.markDirty();
      this.ctx.emit('task:relation:deleted', { projectId: this.ctx.projectId, taskId, toId: targetId, kind, targetGraph });
      const dir = this.tasksDir;
      if (dir) {
        // taskId might actually be a noteId for incoming mirrors — use the real task node
        const realTaskId = this._graph.hasNode(taskId) && !isProxy(this._graph, taskId) ? taskId : targetId;
        if (this._graph.hasNode(realTaskId) && !isProxy(this._graph, realTaskId)) {
          const attrs = this._graph.getNodeAttributes(realTaskId);
          const relations = listTaskRelations(this._graph, realTaskId, this.ext);
          mirrorTaskRelation(dir, realTaskId, 'remove', kind, targetId, attrs, relations, targetGraph, by);
          this.recordMirrorWrites(realTaskId);
        }
      }
    }
    return ok;
  }

  deleteTaskLink(fromId: string, toId: string, author?: string): boolean {
    const by = author ?? this.ctx.author;
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
      this.ctx.emit('task:relation:deleted', { projectId: this.ctx.projectId, taskId: fromId, toId, kind });
      const dir = this.tasksDir;
      if (dir) {
        const fromAttrs = this._graph.getNodeAttributes(fromId);
        const fromRels = listTaskRelations(this._graph, fromId, this.ext);
        mirrorTaskRelation(dir, fromId, 'remove', kind, toId, fromAttrs, fromRels, undefined, by);
        this.recordMirrorWrites(fromId);
      }
    }
    return ok;
  }

  // -- Attachments --

  addAttachment(taskId: string, filename: string, data: Buffer, author?: string): AttachmentMeta | null {
    const by = author ?? this.ctx.author;
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
    mirrorAttachmentEvent(entityDir, 'add', safe, by);
    this.mirrorTracker?.recordWrite(path.join(entityDir, 'events.jsonl'));

    const attachments = scanAttachments(entityDir);
    this._graph.setNodeAttribute(taskId, 'attachments', attachments);
    this._graph.setNodeAttribute(taskId, 'updatedAt', Date.now());
    this.ctx.markDirty();
    this.ctx.emit('task:attachment:added', { projectId: this.ctx.projectId, taskId, filename: safe });

    return attachments.find(a => a.filename === safe) ?? null;
  }

  removeAttachment(taskId: string, filename: string, author?: string): boolean {
    const by = author ?? this.ctx.author;
    const dir = this.tasksDir;
    if (!dir) return false;
    if (!this._graph.hasNode(taskId) || isProxy(this._graph, taskId)) return false;

    const safe = sanitizeFilename(filename);
    const entityDir = path.join(dir, taskId);
    const deleted = deleteAttachment(dir, taskId, safe);
    if (!deleted) return false;

    this.mirrorTracker?.recordWrite(path.join(entityDir, 'attachments', safe));
    mirrorAttachmentEvent(entityDir, 'remove', safe, by);
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
        order: (parsed as any).order ?? existing.order,
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
        order: (parsed as any).order ?? nextOrderForStatus(this._graph, parsed.status),
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
    status?: TaskStatus; priority?: TaskPriority; tag?: string; filter?: string; assignee?: string; limit?: number; offset?: number;
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

  // -- Epic operations --

  private get epicsDir(): string | undefined {
    const base = this.ctx.mirrorDir ?? this.ctx.projectDir;
    return base ? path.join(base, '.epics') : undefined;
  }

  private recordEpicMirrorWrites(epicId: string): void {
    const dir = this.epicsDir;
    if (!dir || !this.mirrorTracker) return;
    const entityDir = path.join(dir, epicId);
    this.mirrorTracker.recordWrite(path.join(entityDir, 'events.jsonl'));
    this.mirrorTracker.recordWrite(path.join(entityDir, 'task.md'));
    this.mirrorTracker.recordWrite(path.join(entityDir, 'description.md'));
  }

  async createEpic(
    title: string,
    description: string,
    status: EpicStatus = 'open',
    priority: TaskPriority = 'medium',
    tags: string[] = [],
    author?: string,
  ): Promise<string> {
    const by = author ?? this.ctx.author;
    const embedding = await this.embedFns.document(`${title}\n${description}`);
    const epicId = createEpic(this._graph, title, description, status, priority, tags, embedding, by);
    this._bm25Index.addDocument(epicId, this._graph.getNodeAttributes(epicId));
    this.ctx.markDirty();
    this.ctx.emit('epic:created', { projectId: this.ctx.projectId, epicId, title, status });
    const dir = this.epicsDir;
    if (dir) {
      mirrorTaskCreate(dir, epicId, this._graph.getNodeAttributes(epicId), []);
      this.recordEpicMirrorWrites(epicId);
    }
    return epicId;
  }

  async updateEpic(
    epicId: string,
    patch: Partial<Pick<TaskNodeAttributes, 'title' | 'description' | 'priority' | 'tags'>>,
    newStatus?: EpicStatus,
    expectedVersion?: number,
    author?: string,
  ): Promise<boolean> {
    const by = author ?? this.ctx.author;
    const ok = updateEpic(this._graph, epicId, patch, newStatus, expectedVersion, by);
    if (!ok) return false;
    if (patch.title !== undefined || patch.description !== undefined || patch.tags !== undefined) {
      const attrs = this._graph.getNodeAttributes(epicId);
      this._bm25Index.updateDocument(epicId, attrs);
      const embedding = await this.embedFns.document(`${attrs.title}\n${attrs.description}`);
      this._graph.setNodeAttribute(epicId, 'embedding', embedding);
    }
    this.ctx.markDirty();
    this.ctx.emit('epic:updated', { projectId: this.ctx.projectId, epicId });
    const dir = this.epicsDir;
    if (dir) {
      const attrs = this._graph.getNodeAttributes(epicId);
      const relations = listTaskRelations(this._graph, epicId, this.ext);
      mirrorTaskUpdate(dir, epicId, { ...patch, ...(newStatus ? { status: newStatus as unknown as TaskStatus } : {}), by }, attrs, relations);
      this.recordEpicMirrorWrites(epicId);
    }
    return true;
  }

  deleteEpic(epicId: string, _author?: string): boolean {
    const dir = this.epicsDir;
    if (dir) deleteMirrorDir(dir, epicId);
    this._bm25Index.removeDocument(epicId);
    const ok = deleteEpic(this._graph, epicId);
    if (!ok) return false;
    this.ctx.markDirty();
    this.ctx.emit('epic:deleted', { projectId: this.ctx.projectId, epicId });
    return true;
  }

  getEpic(epicId: string) {
    return getEpic(this._graph, epicId);
  }

  listEpics(opts?: Parameters<typeof listEpics>[1]) {
    return listEpics(this._graph, opts);
  }

  async searchEpics(query: string, opts?: {
    topK?: number; minScore?: number; searchMode?: 'hybrid' | 'vector' | 'keyword';
    bfsDepth?: number; maxResults?: number; bfsDecay?: number;
  }) {
    const embedding = opts?.searchMode === 'keyword' ? [] : await this.embedFns.query(query);
    const results = searchTasks(this._graph, embedding, { ...opts, queryText: query, bm25Index: this._bm25Index });
    return results.filter(r => this._graph.hasNode(r.id) && this._graph.getNodeAttribute(r.id, 'nodeType') === 'epic');
  }

  linkTaskToEpic(taskId: string, epicId: string, author?: string): boolean {
    const by = author ?? this.ctx.author;
    const ok = linkTaskToEpic(this._graph, taskId, epicId);
    if (!ok) return false;
    this.ctx.markDirty();
    this.ctx.emit('epic:linked', { projectId: this.ctx.projectId, taskId, epicId });
    // Write relation event so it survives restart via event replay
    const dir = this.tasksDir;
    if (dir && this._graph.hasNode(taskId) && !isProxy(this._graph, taskId)) {
      const attrs = this._graph.getNodeAttributes(taskId);
      const relations = listTaskRelations(this._graph, taskId, this.ext);
      mirrorTaskRelation(dir, taskId, 'add', 'belongs_to', epicId, attrs, relations, undefined, by);
      this.recordMirrorWrites(taskId);
    }
    return true;
  }

  unlinkTaskFromEpic(taskId: string, epicId: string, author?: string): boolean {
    const by = author ?? this.ctx.author;
    const ok = unlinkTaskFromEpic(this._graph, taskId, epicId);
    if (!ok) return false;
    this.ctx.markDirty();
    this.ctx.emit('epic:unlinked', { projectId: this.ctx.projectId, taskId, epicId });
    // Write relation event so removal survives restart via event replay
    const dir = this.tasksDir;
    if (dir && this._graph.hasNode(taskId) && !isProxy(this._graph, taskId)) {
      const attrs = this._graph.getNodeAttributes(taskId);
      const relations = listTaskRelations(this._graph, taskId, this.ext);
      mirrorTaskRelation(dir, taskId, 'remove', 'belongs_to', epicId, attrs, relations, undefined, by);
      this.recordMirrorWrites(taskId);
    }
    return true;
  }

  listEpicTasks(epicId: string) {
    return listEpicTasks(this._graph, epicId);
  }
}
