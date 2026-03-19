import fs from 'fs';
import path from 'path';
import type { KnowledgeGraph, KnowledgeNodeAttributes, KnowledgeEdgeAttributes, CrossGraphType } from '@/graphs/knowledge-types';
import { createKnowledgeGraph, slugify } from '@/graphs/knowledge-types';
import type { DirectedGraph } from 'graphology';
import type { EmbedFns, GraphManagerContext, ExternalGraphs } from '@/graphs/manager-types';
import { resolveExternalGraph, VersionConflictError } from '@/graphs/manager-types';
import { searchKnowledge, type KnowledgeSearchResult } from '@/lib/search/knowledge';
import { BM25Index } from '@/lib/search/bm25';
import { mirrorNoteCreate, mirrorNoteUpdate, mirrorNoteRelation, mirrorAttachmentEvent, deleteMirrorDir, writeAttachment, deleteAttachment, getAttachmentPath as getAttPath, sanitizeFilename } from '@/lib/file-mirror';
import type { MirrorWriteTracker } from '@/lib/mirror-watcher';
import type { ParsedNoteFile } from '@/lib/file-import';
import type { AttachmentMeta } from '@/graphs/attachment-types';
import { scanAttachments } from '@/graphs/attachment-types';
import { diffRelations } from '@/lib/file-import';
import type { RelationFrontmatter } from '@/lib/file-mirror';

export type { KnowledgeGraph };
export { createKnowledgeGraph };

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

/** Build the proxy node ID. With projectId: `@docs::frontend::guide.md::Setup`, without: `@docs::guide.md::Setup` */
export function proxyId(targetGraph: CrossGraphType, nodeId: string, projectId?: string): string {
  return projectId ? `@${targetGraph}::${projectId}::${nodeId}` : `@${targetGraph}::${nodeId}`;
}

/** Check whether a node is a cross-graph proxy. */
export function isProxy(graph: KnowledgeGraph, nodeId: string): boolean {
  if (!graph.hasNode(nodeId)) return false;
  return graph.getNodeAttribute(nodeId, 'proxyFor') !== undefined;
}

/** Ensure a proxy node exists for the given external target. Returns its ID. */
function ensureProxyNode(graph: KnowledgeGraph, targetGraph: CrossGraphType, nodeId: string, projectId?: string): string {
  const id = proxyId(targetGraph, nodeId, projectId);
  if (!graph.hasNode(id)) {
    graph.addNode(id, {
      title: '',
      content: '',
      tags: [],
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
function cleanupProxy(graph: KnowledgeGraph, nodeId: string): void {
  if (!graph.hasNode(nodeId)) return;
  if (!isProxy(graph, nodeId)) return;
  if (graph.degree(nodeId) === 0) {
    graph.dropNode(nodeId);
  }
}

/**
 * Remove all proxy nodes whose target no longer exists in the external graph.
 * Called after doc/code file removal in the indexer.
 */
export function cleanupProxies(
  graph: KnowledgeGraph,
  targetGraph: CrossGraphType,
  externalGraph: DirectedGraph,
  projectId?: string,
): void {
  const toRemove: string[] = [];
  graph.forEachNode((id, attrs: KnowledgeNodeAttributes) => {
    if (attrs.proxyFor && attrs.proxyFor.graph === targetGraph) {
      // In workspace mode, only clean proxies belonging to this project
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
// CRUD — Notes
// ---------------------------------------------------------------------------

/** Create a note, return its slug ID. */
export function createNote(
  graph: KnowledgeGraph,
  title: string,
  content: string,
  tags: string[],
  embedding: number[],
  author = '',
): string {
  const id = slugify(title, graph);
  const now = Date.now();
  graph.addNode(id, {
    title,
    content,
    tags,
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

/** Partial update of a note. Returns true if found and updated. Throws VersionConflictError if expectedVersion is provided and doesn't match. */
export function updateNote(
  graph: KnowledgeGraph,
  noteId: string,
  patch: { title?: string; content?: string; tags?: string[] },
  embedding?: number[],
  author = '',
  expectedVersion?: number,
): boolean {
  if (!graph.hasNode(noteId)) return false;

  if (expectedVersion !== undefined) {
    const current = graph.getNodeAttribute(noteId, 'version');
    if (current !== expectedVersion) throw new VersionConflictError(current, expectedVersion);
  }

  if (patch.title !== undefined)   graph.setNodeAttribute(noteId, 'title', patch.title);
  if (patch.content !== undefined) graph.setNodeAttribute(noteId, 'content', patch.content);
  if (patch.tags !== undefined)    graph.setNodeAttribute(noteId, 'tags', patch.tags);
  if (embedding !== undefined)     graph.setNodeAttribute(noteId, 'embedding', embedding);
  if (author)                      graph.setNodeAttribute(noteId, 'updatedBy', author);

  graph.setNodeAttribute(noteId, 'version', graph.getNodeAttribute(noteId, 'version') + 1);
  graph.setNodeAttribute(noteId, 'updatedAt', Date.now());
  return true;
}

/** Delete a note and all its incident edges. Also cleans up orphaned proxy nodes. */
export function deleteNote(graph: KnowledgeGraph, noteId: string): boolean {
  if (!graph.hasNode(noteId)) return false;

  // Collect proxy neighbors before dropping the note
  const proxyNeighbors: string[] = [];
  graph.forEachNeighbor(noteId, (neighbor) => {
    if (isProxy(graph, neighbor)) proxyNeighbors.push(neighbor);
  });

  graph.dropNode(noteId);

  // Cleanup orphaned proxies (they lost an edge when the note was dropped)
  for (const p of proxyNeighbors) {
    cleanupProxy(graph, p);
  }

  return true;
}

/** Get a note by ID, or null if not found. Excludes proxy nodes. */
export function getNote(
  graph: KnowledgeGraph,
  noteId: string,
): ({ id: string } & KnowledgeNodeAttributes) | null {
  if (!graph.hasNode(noteId)) return null;
  if (isProxy(graph, noteId)) return null;
  return { id: noteId, ...graph.getNodeAttributes(noteId) };
}

/** List notes with optional filter (substring in title/id) and tag filter. Excludes proxy nodes. */
export function listNotes(
  graph: KnowledgeGraph,
  filter?: string,
  tag?: string,
  limit: number = 20,
): Array<{ id: string; title: string; content: string; tags: string[]; updatedAt: number }> {
  const lowerFilter = filter?.toLowerCase();
  const lowerTag = tag?.toLowerCase();

  const results: Array<{ id: string; title: string; content: string; tags: string[]; updatedAt: number }> = [];

  graph.forEachNode((id, attrs: KnowledgeNodeAttributes) => {
    if (attrs.proxyFor) return; // skip proxy nodes
    if (lowerFilter) {
      const match = id.toLowerCase().includes(lowerFilter) ||
                    attrs.title.toLowerCase().includes(lowerFilter);
      if (!match) return;
    }
    if (lowerTag) {
      if (!attrs.tags.some(t => t.toLowerCase() === lowerTag)) return;
    }
    results.push({ id, title: attrs.title, content: attrs.content.slice(0, 500), tags: attrs.tags, updatedAt: attrs.updatedAt });
  });

  return results
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// CRUD — Relations (note ↔ note)
// ---------------------------------------------------------------------------

/** Create a directed relation between two notes. Returns true if created. */
export function createRelation(
  graph: KnowledgeGraph,
  fromId: string,
  toId: string,
  kind: string,
): boolean {
  if (!graph.hasNode(fromId) || !graph.hasNode(toId)) return false;
  if (graph.hasEdge(fromId, toId)) return false;
  graph.addEdgeWithKey(`${fromId}→${toId}`, fromId, toId, { kind });
  return true;
}

/** Delete a relation. Cleans up orphaned proxy nodes. Returns true if it existed. */
export function deleteRelation(
  graph: KnowledgeGraph,
  fromId: string,
  toId: string,
): boolean {
  if (!graph.hasEdge(fromId, toId)) return false;
  graph.dropEdge(fromId, toId);
  // Clean up proxy if it became orphaned
  cleanupProxy(graph, fromId);
  cleanupProxy(graph, toId);
  return true;
}

export interface RelationEntry {
  fromId: string;
  toId: string;
  kind: string;
  targetGraph?: CrossGraphType;
  title?: string;
}

/** List all relations for a note (both incoming and outgoing). Resolves proxy IDs and titles. */
export function listRelations(
  graph: KnowledgeGraph,
  noteId: string,
  externalGraphs?: ExternalGraphs,
): RelationEntry[] {
  if (!graph.hasNode(noteId)) return [];

  const results: RelationEntry[] = [];

  function resolveTitle(nodeId: string, targetGraph?: CrossGraphType): string | undefined {
    if (!targetGraph) {
      // Same-graph note
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

  function resolveEntry(source: string, target: string, kind: string): RelationEntry {
    // Check if either end is a proxy node and resolve it
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
    // Same-graph note↔note: resolve the "other" side's title
    const otherId = source === noteId ? target : source;
    const title = resolveTitle(otherId);
    return { fromId: source, toId: target, kind, ...(title ? { title } : {}) };
  }

  graph.forEachOutEdge(noteId, (_edge, attrs: KnowledgeEdgeAttributes, source, target) => {
    results.push(resolveEntry(source, target, attrs.kind));
  });

  graph.forEachInEdge(noteId, (_edge, attrs: KnowledgeEdgeAttributes, source, target) => {
    results.push(resolveEntry(source, target, attrs.kind));
  });

  return results;
}

// ---------------------------------------------------------------------------
// Reverse lookup: find notes linked to a target
// ---------------------------------------------------------------------------

export interface LinkedNoteEntry {
  noteId: string;
  title: string;
  kind: string;
  tags: string[];
}

/**
 * Find all notes that have a cross-graph relation to the given target node.
 * Optionally filter by relation kind.
 */
export function findLinkedNotes(
  graph: KnowledgeGraph,
  targetGraph: CrossGraphType,
  targetNodeId: string,
  kind?: string,
  projectId?: string,
): LinkedNoteEntry[] {
  // Check both project-scoped and legacy proxy IDs
  const candidates = [proxyId(targetGraph, targetNodeId, projectId)];
  if (projectId) candidates.push(proxyId(targetGraph, targetNodeId));

  const results: LinkedNoteEntry[] = [];
  const seen = new Set<string>();
  for (const pId of candidates) {
    if (!graph.hasNode(pId)) continue;
    graph.forEachInEdge(pId, (_edge, attrs: KnowledgeEdgeAttributes, source) => {
      if (seen.has(source)) return;
      if (isProxy(graph, source)) return;
      if (kind && attrs.kind !== kind) return;
      const noteAttrs = graph.getNodeAttributes(source);
      seen.add(source);
      results.push({
        noteId: source,
        title: noteAttrs.title,
        kind: attrs.kind,
        tags: noteAttrs.tags,
      });
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Cross-graph relations (note → doc/code node)
// ---------------------------------------------------------------------------

/**
 * Create a cross-graph relation from a note to a node in the doc or code graph.
 * Optionally validates that the target exists in the external graph.
 */
export function createCrossRelation(
  graph: KnowledgeGraph,
  fromNoteId: string,
  targetGraph: CrossGraphType,
  targetNodeId: string,
  kind: string,
  externalGraph?: DirectedGraph,
  projectId?: string,
): boolean {
  // Source must be a real note (not a proxy)
  if (!graph.hasNode(fromNoteId) || isProxy(graph, fromNoteId)) return false;

  // Validate target exists in external graph if provided
  if (externalGraph && !externalGraph.hasNode(targetNodeId)) return false;

  const pId = ensureProxyNode(graph, targetGraph, targetNodeId, projectId);

  if (graph.hasEdge(fromNoteId, pId)) return false;
  graph.addEdgeWithKey(`${fromNoteId}→${pId}`, fromNoteId, pId, { kind });
  return true;
}

/**
 * Delete a cross-graph relation. Cleans up orphaned proxy node.
 */
export function deleteCrossRelation(
  graph: KnowledgeGraph,
  fromNoteId: string,
  targetGraph: CrossGraphType,
  targetNodeId: string,
  projectId?: string,
): boolean {
  // Try project-scoped first, then legacy
  const candidates = [proxyId(targetGraph, targetNodeId, projectId)];
  if (projectId) candidates.push(proxyId(targetGraph, targetNodeId));

  for (const pId of candidates) {
    if (graph.hasEdge(fromNoteId, pId)) {
      graph.dropEdge(fromNoteId, pId);
      cleanupProxy(graph, pId);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveKnowledgeGraph(graph: KnowledgeGraph, graphMemory: string, embeddingFingerprint?: string): void {
  fs.mkdirSync(graphMemory, { recursive: true });
  const file = path.join(graphMemory, 'knowledge.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ embeddingModel: embeddingFingerprint, graph: graph.export() }));
  fs.renameSync(tmp, file);
}

export function loadKnowledgeGraph(graphMemory: string, fresh = false, embeddingFingerprint?: string): KnowledgeGraph {
  const graph = createKnowledgeGraph();
  if (fresh) return graph;
  const file = path.join(graphMemory, 'knowledge.json');

  if (!fs.existsSync(file)) return graph;

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const stored = data.embeddingModel as string | undefined;

    if (embeddingFingerprint && stored !== embeddingFingerprint) {
      process.stderr.write(`[knowledge-graph] Embedding config changed, re-indexing knowledge graph\n`);
      return graph;
    }

    graph.import(data.graph);
    process.stderr.write(`[knowledge-graph] Loaded ${graph.order} nodes, ${graph.size} edges\n`);
  } catch (err) {
    process.stderr.write(`[knowledge-graph] Failed to load graph, starting fresh: ${err}\n`);
  }

  return graph;
}

// ---------------------------------------------------------------------------
// Bidirectional mirror helpers (Knowledge ↔ Task)
// ---------------------------------------------------------------------------

/**
 * Create a mirror proxy in TaskGraph when a note links to a task.
 * Creates `@knowledge::noteId` proxy node + edge proxy→taskId in TaskGraph.
 */
function createMirrorInTaskGraph(
  taskGraph: DirectedGraph,
  noteId: string,
  taskId: string,
  kind: string,
): void {
  const mirrorProxyId = `@knowledge::${noteId}`;
  if (!taskGraph.hasNode(mirrorProxyId)) {
    taskGraph.addNode(mirrorProxyId, {
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
      proxyFor: { graph: 'knowledge', nodeId: noteId },
    });
  }
  if (!taskGraph.hasNode(taskId)) return;
  const edgeKey = `${mirrorProxyId}→${taskId}`;
  if (!taskGraph.hasEdge(edgeKey)) {
    taskGraph.addEdgeWithKey(edgeKey, mirrorProxyId, taskId, { kind });
  }
}

/**
 * Remove the mirror proxy edge/node from TaskGraph when a note→task relation is deleted.
 */
function deleteMirrorFromTaskGraph(
  taskGraph: DirectedGraph,
  noteId: string,
  taskId: string,
): void {
  const mirrorProxyId = `@knowledge::${noteId}`;
  const edgeKey = `${mirrorProxyId}→${taskId}`;
  if (taskGraph.hasEdge(edgeKey)) {
    taskGraph.dropEdge(edgeKey);
  }
  // Cleanup orphan proxy
  if (taskGraph.hasNode(mirrorProxyId)) {
    const proxyFor = taskGraph.getNodeAttribute(mirrorProxyId, 'proxyFor');
    if (proxyFor && taskGraph.degree(mirrorProxyId) === 0) {
      taskGraph.dropNode(mirrorProxyId);
    }
  }
}

// ---------------------------------------------------------------------------
// KnowledgeGraphManager — unified API for knowledge graph operations
// ---------------------------------------------------------------------------

export class KnowledgeGraphManager {
  private taskGraph?: DirectedGraph;
  private mirrorTracker?: MirrorWriteTracker;
  private _bm25Index: BM25Index<KnowledgeNodeAttributes>;

  get externalGraphs(): ExternalGraphs { return this.ext; }

  constructor(
    private _graph: KnowledgeGraph,
    private embedFns: EmbedFns,
    private ctx: GraphManagerContext,
    private ext: ExternalGraphs = {},
  ) {
    this.taskGraph = ext.taskGraph;
    this._bm25Index = new BM25Index<KnowledgeNodeAttributes>(
      (attrs) => `${attrs.title} ${attrs.content} ${attrs.tags.join(' ')}`,
    );
    this._graph.forEachNode((id, attrs) => {
      if (!attrs.proxyFor) this._bm25Index.addDocument(id, attrs);
    });
  }

  get graph(): KnowledgeGraph { return this._graph; }
  get bm25Index(): BM25Index<KnowledgeNodeAttributes> { return this._bm25Index; }

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
  getNodeUpdatedAt(noteId: string): number | null {
    if (!this._graph.hasNode(noteId)) return null;
    if (isProxy(this._graph, noteId)) return null;
    return this._graph.getNodeAttribute(noteId, 'updatedAt') ?? null;
  }

  private get notesDir(): string | undefined {
    const base = this.ctx.mirrorDir ?? this.ctx.projectDir;
    return base ? path.join(base, '.notes') : undefined;
  }

  private recordMirrorWrites(noteId: string): void {
    const dir = this.notesDir;
    if (!dir || !this.mirrorTracker) return;
    const entityDir = path.join(dir, noteId);
    this.mirrorTracker.recordWrite(path.join(entityDir, 'events.jsonl'));
    this.mirrorTracker.recordWrite(path.join(entityDir, 'note.md'));
    this.mirrorTracker.recordWrite(path.join(entityDir, 'content.md'));
  }

  // -- Write (mutations with embed + dirty + emit + cross-graph cleanup) --

  async createNote(title: string, content: string, tags: string[] = []): Promise<string> {
    const embedding = await this.embedFns.document(`${title} ${content}`);
    const noteId = createNote(this._graph, title, content, tags, embedding, this.ctx.author);
    this._bm25Index.addDocument(noteId, this._graph.getNodeAttributes(noteId));
    this.ctx.markDirty();
    this.ctx.emit('note:created', { projectId: this.ctx.projectId, noteId });
    const dir = this.notesDir;
    if (dir) {
      const attrs = this._graph.getNodeAttributes(noteId);
      mirrorNoteCreate(dir, noteId, attrs, []);
      this.recordMirrorWrites(noteId);
    }
    return noteId;
  }

  async updateNote(noteId: string, patch: { title?: string; content?: string; tags?: string[] }, expectedVersion?: number): Promise<boolean> {
    const existing = getNote(this._graph, noteId);
    if (!existing) return false;

    const embedText = `${patch.title ?? existing.title} ${patch.content ?? existing.content}`;
    const embedding = await this.embedFns.document(embedText);
    updateNote(this._graph, noteId, patch, embedding, this.ctx.author, expectedVersion);
    this._bm25Index.updateDocument(noteId, this._graph.getNodeAttributes(noteId));
    this.ctx.markDirty();
    this.ctx.emit('note:updated', { projectId: this.ctx.projectId, noteId });
    const dir = this.notesDir;
    if (dir) {
      const attrs = this._graph.getNodeAttributes(noteId);
      const relations = listRelations(this._graph, noteId, this.ext);
      mirrorNoteUpdate(dir, noteId, { ...patch, by: this.ctx.author }, attrs, relations);
      this.recordMirrorWrites(noteId);
    }
    return true;
  }

  deleteNote(noteId: string): boolean {
    if (this.notesDir) deleteMirrorDir(this.notesDir, noteId);

    this._bm25Index.removeDocument(noteId);
    const ok = deleteNote(this._graph, noteId);
    if (!ok) return false;

    // Clean up proxy in TaskGraph if any task links to this note
    if (this.taskGraph) {
      const toRemove: string[] = [];
      this.taskGraph.forEachNode((id, attrs) => {
        if (attrs.proxyFor?.graph === 'knowledge' && attrs.proxyFor.nodeId === noteId) {
          toRemove.push(id);
        }
      });
      for (const id of toRemove) this.taskGraph.dropNode(id);
    }

    this.ctx.markDirty();
    this.ctx.emit('note:deleted', { projectId: this.ctx.projectId, noteId });
    return true;
  }

  createRelation(fromId: string, toId: string, kind: string, targetGraph?: CrossGraphType, projectId?: string): boolean {
    const pid = projectId || this.ctx.projectId;
    let ok: boolean;
    if (targetGraph) {
      const extGraph = resolveExternalGraph(this.ext, targetGraph, pid);
      ok = createCrossRelation(this._graph, fromId, targetGraph, toId, kind, extGraph, pid);
      // Bidirectional: create mirror proxy in TaskGraph
      if (ok && targetGraph === 'tasks' && this.taskGraph) {
        createMirrorInTaskGraph(this.taskGraph, fromId, toId, kind);
      }
    } else {
      ok = createRelation(this._graph, fromId, toId, kind);
    }
    if (ok) {
      this.ctx.markDirty();
      const dir = this.notesDir;
      if (dir) {
        const attrs = this._graph.getNodeAttributes(fromId);
        const relations = listRelations(this._graph, fromId, this.ext);
        mirrorNoteRelation(dir, fromId, 'add', kind, toId, attrs, relations, targetGraph);
        this.recordMirrorWrites(fromId);
      }
    }
    return ok;
  }

  deleteRelation(fromId: string, toId: string, targetGraph?: CrossGraphType, projectId?: string): boolean {
    const pid = projectId || this.ctx.projectId;
    // Read edge kind before deleting (for event log)
    let kind = '';
    try {
      const actualToId = targetGraph ? proxyId(targetGraph, toId, pid) : toId;
      if (this._graph.hasEdge(fromId, actualToId)) {
        kind = this._graph.getEdgeAttribute(this._graph.edge(fromId, actualToId)!, 'kind') ?? '';
      }
    } catch { /* ignore */ }

    let ok: boolean;
    if (targetGraph) {
      ok = deleteCrossRelation(this._graph, fromId, targetGraph, toId, pid);
      // Bidirectional: remove mirror proxy from TaskGraph
      if (ok && targetGraph === 'tasks' && this.taskGraph) {
        deleteMirrorFromTaskGraph(this.taskGraph, fromId, toId);
      }
    } else {
      ok = deleteRelation(this._graph, fromId, toId);
    }
    if (ok) {
      this.ctx.markDirty();
      const dir = this.notesDir;
      if (dir) {
        const attrs = this._graph.getNodeAttributes(fromId);
        const relations = listRelations(this._graph, fromId, this.ext);
        mirrorNoteRelation(dir, fromId, 'remove', kind, toId, attrs, relations, targetGraph);
        this.recordMirrorWrites(fromId);
      }
    }
    return ok;
  }

  // -- Attachments --

  addAttachment(noteId: string, filename: string, data: Buffer): AttachmentMeta | null {
    const dir = this.notesDir;
    if (!dir) return null;
    if (!this._graph.hasNode(noteId) || isProxy(this._graph, noteId)) return null;

    const safe = sanitizeFilename(filename);
    if (!safe) return null;

    writeAttachment(dir, noteId, safe, data);
    this.mirrorTracker?.recordWrite(path.join(dir, noteId, 'attachments', safe));
    mirrorAttachmentEvent(path.join(dir, noteId), 'add', safe);
    this.mirrorTracker?.recordWrite(path.join(dir, noteId, 'events.jsonl'));

    const attachments = scanAttachments(path.join(dir, noteId));
    this._graph.setNodeAttribute(noteId, 'attachments', attachments);
    this._graph.setNodeAttribute(noteId, 'updatedAt', Date.now());
    this.ctx.markDirty();
    this.ctx.emit('note:attachment:added', { projectId: this.ctx.projectId, noteId, filename: safe });

    return attachments.find(a => a.filename === safe) ?? null;
  }

  removeAttachment(noteId: string, filename: string): boolean {
    const dir = this.notesDir;
    if (!dir) return false;
    if (!this._graph.hasNode(noteId) || isProxy(this._graph, noteId)) return false;

    const safe = sanitizeFilename(filename);
    const deleted = deleteAttachment(dir, noteId, safe);
    if (!deleted) return false;

    this.mirrorTracker?.recordWrite(path.join(dir, noteId, 'attachments', safe));
    mirrorAttachmentEvent(path.join(dir, noteId), 'remove', safe);
    this.mirrorTracker?.recordWrite(path.join(dir, noteId, 'events.jsonl'));

    const attachments = scanAttachments(path.join(dir, noteId));
    this._graph.setNodeAttribute(noteId, 'attachments', attachments);
    this._graph.setNodeAttribute(noteId, 'updatedAt', Date.now());
    this.ctx.markDirty();
    this.ctx.emit('note:attachment:deleted', { projectId: this.ctx.projectId, noteId, filename: safe });
    return true;
  }

  syncAttachments(noteId: string): void {
    const dir = this.notesDir;
    if (!dir) return;
    if (!this._graph.hasNode(noteId) || isProxy(this._graph, noteId)) return;

    const attachments = scanAttachments(path.join(dir, noteId));
    this._graph.setNodeAttribute(noteId, 'attachments', attachments);
    this.ctx.markDirty();
  }

  listAttachments(noteId: string): AttachmentMeta[] {
    if (!this._graph.hasNode(noteId) || isProxy(this._graph, noteId)) return [];
    return this._graph.getNodeAttribute(noteId, 'attachments') ?? [];
  }

  getAttachmentPath(noteId: string, filename: string): string | null {
    const dir = this.notesDir;
    if (!dir) return null;
    return getAttPath(dir, noteId, filename);
  }

  // -- Import from file (reverse mirror — does NOT write back to file) --

  async importFromFile(parsed: ParsedNoteFile): Promise<void> {
    const exists = this._graph.hasNode(parsed.id) && !isProxy(this._graph, parsed.id);
    const embedding = await this.embedFns.document(`${parsed.title} ${parsed.content}`);
    const now = Date.now();

    if (exists) {
      const existing = this._graph.getNodeAttributes(parsed.id);
      this._graph.mergeNodeAttributes(parsed.id, {
        title: parsed.title,
        content: parsed.content,
        tags: parsed.tags,
        embedding,
        attachments: parsed.attachments,
        updatedAt: now,
        createdAt: existing.createdAt,
        version: parsed.version ?? existing.version + 1,
        // preserve createdBy from graph if file doesn't have it
        ...(parsed.createdBy != null ? { createdBy: parsed.createdBy } : {}),
        ...(parsed.updatedBy != null ? { updatedBy: parsed.updatedBy } : {}),
      });
    } else {
      this._graph.addNode(parsed.id, {
        title: parsed.title,
        content: parsed.content,
        tags: parsed.tags,
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

    // Sync relations
    this.syncRelationsFromFile(parsed.id, parsed.relations);

    this.ctx.markDirty();
    this.ctx.emit(exists ? 'note:updated' : 'note:created', { projectId: this.ctx.projectId, noteId: parsed.id });
  }

  updateContentFromFile(noteId: string, content: string): void {
    if (!this._graph.hasNode(noteId) || isProxy(this._graph, noteId)) return;
    this._graph.setNodeAttribute(noteId, 'content', content);
    this._graph.setNodeAttribute(noteId, 'updatedAt', Date.now());
    this._graph.setNodeAttribute(noteId, 'version', (this._graph.getNodeAttribute(noteId, 'version') ?? 0) + 1);
    this.ctx.markDirty();
    this.ctx.emit('note:updated', { projectId: this.ctx.projectId, noteId });
  }

  deleteFromFile(noteId: string): void {
    if (!this._graph.hasNode(noteId)) return;
    if (isProxy(this._graph, noteId)) return;

    this._bm25Index.removeDocument(noteId);
    deleteNote(this._graph, noteId);

    if (this.taskGraph) {
      const pId = `@knowledge::${noteId}`;
      if (this.taskGraph.hasNode(pId)) this.taskGraph.dropNode(pId);
    }

    this.ctx.markDirty();
    this.ctx.emit('note:deleted', { projectId: this.ctx.projectId, noteId });
  }

  private syncRelationsFromFile(noteId: string, desired: RelationFrontmatter[]): void {
    // Build current outgoing relations from graph
    const current: RelationFrontmatter[] = [];
    this._graph.forEachOutEdge(noteId, (_edge, attrs, _src, target) => {
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
        deleteCrossRelation(this._graph, noteId, rel.graph as CrossGraphType, rel.to);
        if (rel.graph === 'tasks' && this.taskGraph) {
          deleteMirrorFromTaskGraph(this.taskGraph, noteId, rel.to);
        }
      } else {
        deleteRelation(this._graph, noteId, rel.to);
      }
    }

    for (const rel of diff.toAdd) {
      if (rel.graph) {
        const extGraph = resolveExternalGraph(this.ext, rel.graph as CrossGraphType);
        createCrossRelation(this._graph, noteId, rel.graph as CrossGraphType, rel.to, rel.kind, extGraph);
        if (rel.graph === 'tasks' && this.taskGraph) {
          createMirrorInTaskGraph(this.taskGraph, noteId, rel.to, rel.kind);
        }
      } else {
        createRelation(this._graph, noteId, rel.to, rel.kind);
      }
    }
  }

  // -- Read --

  getNote(noteId: string) {
    const note = getNote(this._graph, noteId);
    if (!note) return null;
    const relations = listRelations(this._graph, noteId, this.ext);
    return { ...note, relations };
  }

  listNotes(filter?: string, tag?: string, limit?: number) {
    return listNotes(this._graph, filter, tag, limit);
  }

  async searchNotes(query: string, opts?: {
    topK?: number; bfsDepth?: number; maxResults?: number; minScore?: number; bfsDecay?: number;
    searchMode?: 'hybrid' | 'vector' | 'keyword'; rrfK?: number;
  }): Promise<KnowledgeSearchResult[]> {
    const embedding = opts?.searchMode === 'keyword' ? [] : await this.embedFns.query(query);
    return searchKnowledge(this._graph, embedding, { ...opts, queryText: query, bm25Index: this._bm25Index });
  }

  listRelations(noteId: string) {
    return listRelations(this._graph, noteId, this.ext);
  }

  findLinkedNotes(targetGraph: CrossGraphType, targetNodeId: string, kind?: string, projectId?: string) {
    return findLinkedNotes(this._graph, targetGraph, targetNodeId, kind, projectId || this.ctx.projectId);
  }
}
