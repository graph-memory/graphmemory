import fs from 'fs';
import path from 'path';
import type { SkillGraph, SkillNodeAttributes, SkillEdgeAttributes, SkillCrossGraphType, SkillSource } from '@/graphs/skill-types';
import type { AttachmentMeta } from '@/graphs/attachment-types';
import { createSkillGraph } from '@/graphs/skill-types';
import { slugify } from '@/graphs/knowledge-types';
import type { DirectedGraph } from 'graphology';
import type { EmbedFn, GraphManagerContext, ExternalGraphs } from '@/graphs/manager-types';
import { resolveExternalGraph, VersionConflictError } from '@/graphs/manager-types';
import { searchSkills, type SkillSearchResult } from '@/lib/search/skills';
import { BM25Index } from '@/lib/search/bm25';
import { writeSkillFile, deleteMirrorDir, writeAttachment, deleteAttachment, getAttachmentPath as getAttPath, sanitizeFilename } from '@/lib/file-mirror';
import type { MirrorWriteTracker } from '@/lib/mirror-watcher';
import type { ParsedSkillFile } from '@/lib/file-import';
import { scanAttachments } from '@/graphs/attachment-types';
import { diffRelations } from '@/lib/file-import';
import type { RelationFrontmatter } from '@/lib/file-mirror';

export type { SkillGraph };
export { createSkillGraph };

// ---------------------------------------------------------------------------
// Proxy helpers
// ---------------------------------------------------------------------------

/** Build the proxy node ID: `@docs::guide.md::Setup` or `@knowledge::my-note` */
export function proxyId(targetGraph: SkillCrossGraphType, nodeId: string): string {
  return `@${targetGraph}::${nodeId}`;
}

/** Check whether a node is a cross-graph proxy. */
export function isProxy(graph: SkillGraph, nodeId: string): boolean {
  if (!graph.hasNode(nodeId)) return false;
  return graph.getNodeAttribute(nodeId, 'proxyFor') !== undefined;
}

/** Ensure a proxy node exists for the given external target. Returns its ID. */
function ensureProxyNode(graph: SkillGraph, targetGraph: SkillCrossGraphType, nodeId: string): string {
  const id = proxyId(targetGraph, nodeId);
  if (!graph.hasNode(id)) {
    graph.addNode(id, {
      title: '',
      description: '',
      steps: [],
      triggers: [],
      inputHints: [],
      filePatterns: [],
      tags: [],
      source: 'user',
      confidence: 1,
      usageCount: 0,
      lastUsedAt: null,
      embedding: [],
      attachments: [],
      createdAt: 0,
      updatedAt: 0,
      version: 0,
      proxyFor: { graph: targetGraph, nodeId },
    });
  }
  return id;
}

/** Remove a proxy node if it has zero incident edges. */
function cleanupProxy(graph: SkillGraph, nodeId: string): void {
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
  graph: SkillGraph,
  targetGraph: SkillCrossGraphType,
  externalGraph: DirectedGraph,
): void {
  const toRemove: string[] = [];
  graph.forEachNode((id, attrs: SkillNodeAttributes) => {
    if (attrs.proxyFor && attrs.proxyFor.graph === targetGraph) {
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
// CRUD — Skills
// ---------------------------------------------------------------------------

/** Create a skill, return its slug ID. */
export function createSkill(
  graph: SkillGraph,
  title: string,
  description: string,
  steps: string[],
  triggers: string[],
  inputHints: string[],
  filePatterns: string[],
  tags: string[],
  source: SkillSource,
  confidence: number,
  embedding: number[],
  author = '',
): string {
  const id = slugify(title, graph);
  const now = Date.now();
  graph.addNode(id, {
    title,
    description,
    steps,
    triggers,
    inputHints,
    filePatterns,
    tags,
    source,
    confidence,
    usageCount: 0,
    lastUsedAt: null,
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

/** Partial update of a skill. Returns true if found and updated. Throws VersionConflictError if expectedVersion is provided and doesn't match. */
export function updateSkill(
  graph: SkillGraph,
  skillId: string,
  patch: {
    title?: string;
    description?: string;
    steps?: string[];
    triggers?: string[];
    inputHints?: string[];
    filePatterns?: string[];
    tags?: string[];
    source?: SkillSource;
    confidence?: number;
  },
  embedding?: number[],
  author = '',
  expectedVersion?: number,
): boolean {
  if (!graph.hasNode(skillId)) return false;
  if (isProxy(graph, skillId)) return false;

  if (expectedVersion !== undefined) {
    const current = graph.getNodeAttribute(skillId, 'version');
    if (current !== expectedVersion) throw new VersionConflictError(current, expectedVersion);
  }

  if (patch.title !== undefined)        graph.setNodeAttribute(skillId, 'title', patch.title);
  if (patch.description !== undefined)  graph.setNodeAttribute(skillId, 'description', patch.description);
  if (patch.steps !== undefined)        graph.setNodeAttribute(skillId, 'steps', patch.steps);
  if (patch.triggers !== undefined)     graph.setNodeAttribute(skillId, 'triggers', patch.triggers);
  if (patch.inputHints !== undefined)   graph.setNodeAttribute(skillId, 'inputHints', patch.inputHints);
  if (patch.filePatterns !== undefined) graph.setNodeAttribute(skillId, 'filePatterns', patch.filePatterns);
  if (patch.tags !== undefined)         graph.setNodeAttribute(skillId, 'tags', patch.tags);
  if (patch.source !== undefined)       graph.setNodeAttribute(skillId, 'source', patch.source);
  if (patch.confidence !== undefined)   graph.setNodeAttribute(skillId, 'confidence', patch.confidence);
  if (embedding !== undefined)          graph.setNodeAttribute(skillId, 'embedding', embedding);
  if (author)                           graph.setNodeAttribute(skillId, 'updatedBy', author);

  graph.setNodeAttribute(skillId, 'version', graph.getNodeAttribute(skillId, 'version') + 1);
  graph.setNodeAttribute(skillId, 'updatedAt', Date.now());
  return true;
}

/** Increment usageCount and set lastUsedAt. Returns true if found. */
export function bumpUsage(graph: SkillGraph, skillId: string): boolean {
  if (!graph.hasNode(skillId)) return false;
  if (isProxy(graph, skillId)) return false;

  const count = graph.getNodeAttribute(skillId, 'usageCount');
  graph.setNodeAttribute(skillId, 'usageCount', count + 1);
  graph.setNodeAttribute(skillId, 'lastUsedAt', Date.now());
  graph.setNodeAttribute(skillId, 'version', graph.getNodeAttribute(skillId, 'version') + 1);
  graph.setNodeAttribute(skillId, 'updatedAt', Date.now());
  return true;
}

/** Delete a skill and all its incident edges. Also cleans up orphaned proxy nodes. */
export function deleteSkill(graph: SkillGraph, skillId: string): boolean {
  if (!graph.hasNode(skillId)) return false;
  if (isProxy(graph, skillId)) return false;

  const proxyNeighbors: string[] = [];
  graph.forEachNeighbor(skillId, (neighbor) => {
    if (isProxy(graph, neighbor)) proxyNeighbors.push(neighbor);
  });

  graph.dropNode(skillId);

  for (const p of proxyNeighbors) {
    cleanupProxy(graph, p);
  }

  return true;
}

export interface SkillEntry {
  id: string;
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
  version: number;
  createdAt: number;
  updatedAt: number;
  attachments: AttachmentMeta[];
}

export interface CrossLinkEntry {
  nodeId: string;
  targetGraph: string;
  kind: string;
  direction: 'outgoing' | 'incoming';
}

/** Get a skill by ID, or null if not found. Excludes proxy nodes. */
export function getSkill(
  graph: SkillGraph,
  skillId: string,
): (SkillEntry & {
  dependsOn: Array<{ id: string; title: string }>;
  dependedBy: Array<{ id: string; title: string }>;
  related: Array<{ id: string; title: string }>;
  variants: Array<{ id: string; title: string }>;
  crossLinks: CrossLinkEntry[];
}) | null {
  if (!graph.hasNode(skillId)) return null;
  if (isProxy(graph, skillId)) return null;

  const attrs = graph.getNodeAttributes(skillId);
  const dependsOn: Array<{ id: string; title: string }> = [];
  const dependedBy: Array<{ id: string; title: string }> = [];
  const related: Array<{ id: string; title: string }> = [];
  const variants: Array<{ id: string; title: string }> = [];
  const crossLinks: CrossLinkEntry[] = [];

  // Incoming edges
  graph.forEachInEdge(skillId, (_edge, edgeAttrs: SkillEdgeAttributes, source) => {
    if (isProxy(graph, source)) {
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
    if (edgeAttrs.kind === 'depends_on') {
      // source depends_on this skill → this skill is depended by source
      dependedBy.push({ id: source, title: srcAttrs.title });
    } else if (edgeAttrs.kind === 'related_to') {
      related.push({ id: source, title: srcAttrs.title });
    } else if (edgeAttrs.kind === 'variant_of') {
      variants.push({ id: source, title: srcAttrs.title });
    }
  });

  // Outgoing edges
  graph.forEachOutEdge(skillId, (_edge, edgeAttrs: SkillEdgeAttributes, _source, target) => {
    if (isProxy(graph, target)) {
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
    if (edgeAttrs.kind === 'depends_on') {
      dependsOn.push({ id: target, title: tgtAttrs.title });
    } else if (edgeAttrs.kind === 'related_to') {
      if (!related.some(r => r.id === target)) {
        related.push({ id: target, title: tgtAttrs.title });
      }
    } else if (edgeAttrs.kind === 'variant_of') {
      if (!variants.some(v => v.id === target)) {
        variants.push({ id: target, title: tgtAttrs.title });
      }
    }
  });

  return {
    id: skillId,
    title: attrs.title,
    description: attrs.description,
    steps: attrs.steps,
    triggers: attrs.triggers,
    inputHints: attrs.inputHints,
    filePatterns: attrs.filePatterns,
    tags: attrs.tags,
    source: attrs.source,
    confidence: attrs.confidence,
    usageCount: attrs.usageCount,
    lastUsedAt: attrs.lastUsedAt,
    version: attrs.version,
    createdAt: attrs.createdAt,
    updatedAt: attrs.updatedAt,
    attachments: attrs.attachments ?? [],
    dependsOn,
    dependedBy,
    related,
    variants,
    crossLinks,
  };
}

/** List skills with optional filters. Excludes proxy nodes. */
export function listSkills(
  graph: SkillGraph,
  opts: {
    source?: SkillSource;
    tag?: string;
    filter?: string;
    limit?: number;
  } = {},
): SkillEntry[] {
  const { source, tag, filter, limit = 50 } = opts;
  const lowerFilter = filter?.toLowerCase();
  const lowerTag = tag?.toLowerCase();

  const results: SkillEntry[] = [];

  graph.forEachNode((id, attrs: SkillNodeAttributes) => {
    if (attrs.proxyFor) return;
    if (source && attrs.source !== source) return;
    if (lowerTag && !attrs.tags.some(t => t.toLowerCase() === lowerTag)) return;
    if (lowerFilter) {
      const match = id.toLowerCase().includes(lowerFilter) ||
                    attrs.title.toLowerCase().includes(lowerFilter);
      if (!match) return;
    }
    results.push({
      id,
      title: attrs.title,
      description: attrs.description,
      steps: attrs.steps,
      triggers: attrs.triggers,
      inputHints: attrs.inputHints,
      filePatterns: attrs.filePatterns,
      tags: attrs.tags,
      source: attrs.source,
      confidence: attrs.confidence,
      usageCount: attrs.usageCount,
      lastUsedAt: attrs.lastUsedAt,
      version: attrs.version,
      createdAt: attrs.createdAt,
      updatedAt: attrs.updatedAt,
      attachments: attrs.attachments ?? [],
    });
  });

  return results
    .sort((a, b) => {
      // Sort by usageCount desc, then updatedAt desc
      if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// CRUD — Skill Relations (skill ↔ skill)
// ---------------------------------------------------------------------------

/** Create a directed relation between two skills. Returns true if created. */
export function createSkillRelation(
  graph: SkillGraph,
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

/** Delete a skill relation. Returns true if it existed. */
export function deleteSkillRelation(
  graph: SkillGraph,
  fromId: string,
  toId: string,
): boolean {
  if (!graph.hasEdge(fromId, toId)) return false;
  graph.dropEdge(fromId, toId);
  return true;
}

export interface SkillRelationEntry {
  fromId: string;
  toId: string;
  kind: string;
  targetGraph?: SkillCrossGraphType;
  title?: string;
}

/** List all relations for a skill (both incoming and outgoing). Resolves proxy IDs and titles. */
export function listSkillRelations(
  graph: SkillGraph,
  skillId: string,
  externalGraphs?: ExternalGraphs,
): SkillRelationEntry[] {
  if (!graph.hasNode(skillId)) return [];

  const results: SkillRelationEntry[] = [];

  function resolveTitle(nodeId: string, targetGraph?: SkillCrossGraphType): string | undefined {
    if (!targetGraph) {
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

  function resolveEntry(source: string, target: string, kind: string): SkillRelationEntry {
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
    const otherId = source === skillId ? target : source;
    const title = resolveTitle(otherId);
    return { fromId: source, toId: target, kind, ...(title ? { title } : {}) };
  }

  graph.forEachOutEdge(skillId, (_edge, attrs: SkillEdgeAttributes, source, target) => {
    results.push(resolveEntry(source, target, attrs.kind));
  });

  graph.forEachInEdge(skillId, (_edge, attrs: SkillEdgeAttributes, source, target) => {
    results.push(resolveEntry(source, target, attrs.kind));
  });

  return results;
}

// ---------------------------------------------------------------------------
// Reverse lookup: find skills linked to a target
// ---------------------------------------------------------------------------

export interface LinkedSkillEntry {
  skillId: string;
  title: string;
  kind: string;
  source: SkillSource;
  confidence: number;
  tags: string[];
}

/**
 * Find all skills that have a cross-graph relation to the given target node.
 * Optionally filter by relation kind.
 */
export function findLinkedSkills(
  graph: SkillGraph,
  targetGraph: SkillCrossGraphType,
  targetNodeId: string,
  kind?: string,
): LinkedSkillEntry[] {
  const pId = proxyId(targetGraph, targetNodeId);
  if (!graph.hasNode(pId)) return [];

  const results: LinkedSkillEntry[] = [];
  graph.forEachInEdge(pId, (_edge, attrs: SkillEdgeAttributes, source) => {
    if (isProxy(graph, source)) return;
    if (kind && attrs.kind !== kind) return;
    const skillAttrs = graph.getNodeAttributes(source);
    results.push({
      skillId: source,
      title: skillAttrs.title,
      kind: attrs.kind,
      source: skillAttrs.source,
      confidence: skillAttrs.confidence,
      tags: skillAttrs.tags,
    });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Cross-graph relations (skill → doc/code/file/knowledge/task node)
// ---------------------------------------------------------------------------

/**
 * Create a cross-graph relation from a skill to a node in an external graph.
 * Optionally validates that the target exists in the external graph.
 */
export function createCrossRelation(
  graph: SkillGraph,
  fromSkillId: string,
  targetGraph: SkillCrossGraphType,
  targetNodeId: string,
  kind: string,
  externalGraph?: DirectedGraph,
): boolean {
  if (!graph.hasNode(fromSkillId) || isProxy(graph, fromSkillId)) return false;
  if (externalGraph && !externalGraph.hasNode(targetNodeId)) return false;

  const pId = ensureProxyNode(graph, targetGraph, targetNodeId);
  if (graph.hasEdge(fromSkillId, pId)) return false;
  graph.addEdgeWithKey(`${fromSkillId}→${pId}`, fromSkillId, pId, { kind });
  return true;
}

/**
 * Delete a cross-graph relation. Cleans up orphaned proxy node.
 */
export function deleteCrossRelation(
  graph: SkillGraph,
  fromSkillId: string,
  targetGraph: SkillCrossGraphType,
  targetNodeId: string,
): boolean {
  const pId = proxyId(targetGraph, targetNodeId);
  if (!graph.hasEdge(fromSkillId, pId)) return false;
  graph.dropEdge(fromSkillId, pId);
  cleanupProxy(graph, pId);
  return true;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveSkillGraph(graph: SkillGraph, graphMemory: string, embeddingModel?: string): void {
  fs.mkdirSync(graphMemory, { recursive: true });
  const file = path.join(graphMemory, 'skills.json');
  fs.writeFileSync(file, JSON.stringify({ embeddingModel, graph: graph.export() }));
}

export function loadSkillGraph(graphMemory: string, fresh = false, embeddingModel?: string): SkillGraph {
  const graph = createSkillGraph();
  if (fresh) return graph;
  const file = path.join(graphMemory, 'skills.json');

  if (!fs.existsSync(file)) return graph;

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const storedModel = data.embeddingModel as string | undefined;

    if (embeddingModel && storedModel && storedModel !== embeddingModel) {
      process.stderr.write(`[skill-graph] Embedding model changed (${storedModel} → ${embeddingModel}), re-indexing skill graph\n`);
      return graph;
    }

    graph.import(data.graph);
    process.stderr.write(`[skill-graph] Loaded ${graph.order} nodes, ${graph.size} edges\n`);
  } catch (err) {
    process.stderr.write(`[skill-graph] Failed to load graph, starting fresh: ${err}\n`);
  }

  return graph;
}

// ---------------------------------------------------------------------------
// Bidirectional mirror helpers (Skill ↔ Knowledge, Skill ↔ Task)
// ---------------------------------------------------------------------------

/**
 * Create a mirror proxy in KnowledgeGraph when a skill links to a note.
 */
function createMirrorInKnowledgeGraph(
  knowledgeGraph: DirectedGraph,
  skillId: string,
  noteId: string,
  kind: string,
): void {
  const mirrorProxyId = `@skills::${skillId}`;
  if (!knowledgeGraph.hasNode(mirrorProxyId)) {
    knowledgeGraph.addNode(mirrorProxyId, {
      title: '',
      content: '',
      tags: [],
      embedding: [],
      attachments: [],
      createdAt: 0,
      updatedAt: 0,
      proxyFor: { graph: 'skills', nodeId: skillId },
    });
  }
  if (!knowledgeGraph.hasNode(noteId)) return;
  const edgeKey = `${mirrorProxyId}→${noteId}`;
  if (!knowledgeGraph.hasEdge(edgeKey)) {
    knowledgeGraph.addEdgeWithKey(edgeKey, mirrorProxyId, noteId, { kind });
  }
}

function deleteMirrorFromKnowledgeGraph(
  knowledgeGraph: DirectedGraph,
  skillId: string,
  noteId: string,
): void {
  const mirrorProxyId = `@skills::${skillId}`;
  const edgeKey = `${mirrorProxyId}→${noteId}`;
  if (knowledgeGraph.hasEdge(edgeKey)) {
    knowledgeGraph.dropEdge(edgeKey);
  }
  if (knowledgeGraph.hasNode(mirrorProxyId)) {
    const proxyFor = knowledgeGraph.getNodeAttribute(mirrorProxyId, 'proxyFor');
    if (proxyFor && knowledgeGraph.degree(mirrorProxyId) === 0) {
      knowledgeGraph.dropNode(mirrorProxyId);
    }
  }
}

/**
 * Create a mirror proxy in TaskGraph when a skill links to a task.
 */
function createMirrorInTaskGraph(
  taskGraph: DirectedGraph,
  skillId: string,
  taskId: string,
  kind: string,
): void {
  const mirrorProxyId = `@skills::${skillId}`;
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
      embedding: [],
      attachments: [],
      createdAt: 0,
      updatedAt: 0,
      proxyFor: { graph: 'skills', nodeId: skillId },
    });
  }
  if (!taskGraph.hasNode(taskId)) return;
  const edgeKey = `${mirrorProxyId}→${taskId}`;
  if (!taskGraph.hasEdge(edgeKey)) {
    taskGraph.addEdgeWithKey(edgeKey, mirrorProxyId, taskId, { kind });
  }
}

function deleteMirrorFromTaskGraph(
  taskGraph: DirectedGraph,
  skillId: string,
  taskId: string,
): void {
  const mirrorProxyId = `@skills::${skillId}`;
  const edgeKey = `${mirrorProxyId}→${taskId}`;
  if (taskGraph.hasEdge(edgeKey)) {
    taskGraph.dropEdge(edgeKey);
  }
  if (taskGraph.hasNode(mirrorProxyId)) {
    const proxyFor = taskGraph.getNodeAttribute(mirrorProxyId, 'proxyFor');
    if (proxyFor && taskGraph.degree(mirrorProxyId) === 0) {
      taskGraph.dropNode(mirrorProxyId);
    }
  }
}

// ---------------------------------------------------------------------------
// SkillGraphManager — unified API for skill graph operations
// ---------------------------------------------------------------------------

export class SkillGraphManager {
  private knowledgeGraph?: DirectedGraph;
  private taskGraph?: DirectedGraph;
  private mirrorTracker?: MirrorWriteTracker;
  private _bm25Index: BM25Index<SkillNodeAttributes>;

  constructor(
    private _graph: SkillGraph,
    private embedFn: EmbedFn,
    private ctx: GraphManagerContext,
    private ext: ExternalGraphs = {},
  ) {
    this.knowledgeGraph = ext.knowledgeGraph;
    this.taskGraph = ext.taskGraph;
    this._bm25Index = new BM25Index<SkillNodeAttributes>(
      (attrs) => `${attrs.title} ${attrs.description} ${attrs.triggers.join(' ')} ${attrs.tags.join(' ')}`,
    );
    this._graph.forEachNode((id, attrs) => {
      if (!attrs.proxyFor) this._bm25Index.addDocument(id, attrs);
    });
  }

  get graph(): SkillGraph { return this._graph; }
  get bm25Index(): BM25Index<SkillNodeAttributes> { return this._bm25Index; }

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
  getNodeUpdatedAt(skillId: string): number | null {
    if (!this._graph.hasNode(skillId)) return null;
    if (isProxy(this._graph, skillId)) return null;
    return this._graph.getNodeAttribute(skillId, 'updatedAt') ?? null;
  }

  private get skillsDir(): string | undefined {
    return this.ctx.projectDir ? path.join(this.ctx.projectDir, '.skills') : undefined;
  }

  private mirrorSkill(skillId: string): void {
    const dir = this.skillsDir;
    if (!dir) return;
    const skill = getSkill(this._graph, skillId);
    if (!skill) return;
    const relations = listSkillRelations(this._graph, skillId, this.ext);
    writeSkillFile(dir, skillId, skill, relations);
    this.mirrorTracker?.recordWrite(path.join(dir, skillId, 'skill.md'));
  }

  // -- Write (mutations with embed + dirty + emit + cross-graph cleanup) --

  async createSkill(
    title: string,
    description: string,
    steps: string[] = [],
    triggers: string[] = [],
    inputHints: string[] = [],
    filePatterns: string[] = [],
    tags: string[] = [],
    source: SkillSource = 'user',
    confidence: number = 1,
  ): Promise<string> {
    const embedding = await this.embedFn(`${title} ${description}`);
    const skillId = createSkill(this._graph, title, description, steps, triggers, inputHints, filePatterns, tags, source, confidence, embedding, this.ctx.author);
    this._bm25Index.addDocument(skillId, this._graph.getNodeAttributes(skillId));
    this.ctx.markDirty();
    this.ctx.emit('skill:created', { projectId: this.ctx.projectId, skillId });
    this.mirrorSkill(skillId);
    return skillId;
  }

  async updateSkill(skillId: string, patch: {
    title?: string; description?: string; steps?: string[]; triggers?: string[];
    inputHints?: string[]; filePatterns?: string[]; tags?: string[];
    source?: SkillSource; confidence?: number;
  }, expectedVersion?: number): Promise<boolean> {
    const existing = getSkill(this._graph, skillId);
    if (!existing) return false;

    const embedText = `${patch.title ?? existing.title} ${patch.description ?? existing.description}`;
    const embedding = await this.embedFn(embedText);
    updateSkill(this._graph, skillId, patch, embedding, this.ctx.author, expectedVersion);
    this._bm25Index.updateDocument(skillId, this._graph.getNodeAttributes(skillId));
    this.ctx.markDirty();
    this.ctx.emit('skill:updated', { projectId: this.ctx.projectId, skillId });
    this.mirrorSkill(skillId);
    return true;
  }

  deleteSkill(skillId: string): boolean {
    if (this.skillsDir) deleteMirrorDir(this.skillsDir, skillId);

    this._bm25Index.removeDocument(skillId);
    const ok = deleteSkill(this._graph, skillId);
    if (!ok) return false;

    // Clean up proxy in KnowledgeGraph if any note links to this skill
    if (this.knowledgeGraph) {
      const pId = `@skills::${skillId}`;
      if (this.knowledgeGraph.hasNode(pId)) {
        this.knowledgeGraph.dropNode(pId);
      }
    }

    // Clean up proxy in TaskGraph if any task links to this skill
    if (this.taskGraph) {
      const pId = `@skills::${skillId}`;
      if (this.taskGraph.hasNode(pId)) {
        this.taskGraph.dropNode(pId);
      }
    }

    this.ctx.markDirty();
    this.ctx.emit('skill:deleted', { projectId: this.ctx.projectId, skillId });
    return true;
  }

  bumpUsage(skillId: string): boolean {
    const ok = bumpUsage(this._graph, skillId);
    if (!ok) return false;
    this.ctx.markDirty();
    this.ctx.emit('skill:updated', { projectId: this.ctx.projectId, skillId });
    this.mirrorSkill(skillId);
    return true;
  }

  linkSkills(fromId: string, toId: string, kind: string): boolean {
    const ok = createSkillRelation(this._graph, fromId, toId, kind);
    if (ok) {
      this.ctx.markDirty();
      this.mirrorSkill(fromId);
      this.mirrorSkill(toId);
    }
    return ok;
  }

  createCrossLink(skillId: string, targetId: string, targetGraph: SkillCrossGraphType, kind: string): boolean {
    const extGraph = resolveExternalGraph(this.ext, targetGraph);
    const ok = createCrossRelation(this._graph, skillId, targetGraph, targetId, kind, extGraph);
    // Bidirectional: create mirror proxy in KnowledgeGraph
    if (ok && targetGraph === 'knowledge' && this.knowledgeGraph) {
      createMirrorInKnowledgeGraph(this.knowledgeGraph, skillId, targetId, kind);
    }
    // Bidirectional: create mirror proxy in TaskGraph
    if (ok && targetGraph === 'tasks' && this.taskGraph) {
      createMirrorInTaskGraph(this.taskGraph, skillId, targetId, kind);
    }
    if (ok) {
      this.ctx.markDirty();
      this.mirrorSkill(skillId);
    }
    return ok;
  }

  deleteCrossLink(skillId: string, targetId: string, targetGraph: SkillCrossGraphType): boolean {
    const ok = deleteCrossRelation(this._graph, skillId, targetGraph, targetId);
    if (ok && targetGraph === 'knowledge' && this.knowledgeGraph) {
      deleteMirrorFromKnowledgeGraph(this.knowledgeGraph, skillId, targetId);
    }
    if (ok && targetGraph === 'tasks' && this.taskGraph) {
      deleteMirrorFromTaskGraph(this.taskGraph, skillId, targetId);
    }
    if (ok) {
      this.ctx.markDirty();
      this.mirrorSkill(skillId);
    }
    return ok;
  }

  deleteSkillLink(fromId: string, toId: string): boolean {
    const ok = deleteSkillRelation(this._graph, fromId, toId);
    if (ok) {
      this.ctx.markDirty();
      this.mirrorSkill(fromId);
      this.mirrorSkill(toId);
    }
    return ok;
  }

  // -- Attachments --

  addAttachment(skillId: string, filename: string, data: Buffer): AttachmentMeta | null {
    const dir = this.skillsDir;
    if (!dir) return null;
    if (!this._graph.hasNode(skillId) || isProxy(this._graph, skillId)) return null;

    const safe = sanitizeFilename(filename);
    if (!safe) return null;

    writeAttachment(dir, skillId, safe, data);
    this.mirrorTracker?.recordWrite(path.join(dir, skillId, safe));

    const attachments = scanAttachments(path.join(dir, skillId), 'skill.md');
    this._graph.setNodeAttribute(skillId, 'attachments', attachments);
    this._graph.setNodeAttribute(skillId, 'updatedAt', Date.now());
    this.ctx.markDirty();
    this.ctx.emit('skill:attachment:added', { projectId: this.ctx.projectId, skillId, filename: safe });

    return attachments.find(a => a.filename === safe) ?? null;
  }

  removeAttachment(skillId: string, filename: string): boolean {
    const dir = this.skillsDir;
    if (!dir) return false;
    if (!this._graph.hasNode(skillId) || isProxy(this._graph, skillId)) return false;

    const safe = sanitizeFilename(filename);
    const deleted = deleteAttachment(dir, skillId, safe);
    if (!deleted) return false;

    this.mirrorTracker?.recordWrite(path.join(dir, skillId, safe));

    const attachments = scanAttachments(path.join(dir, skillId), 'skill.md');
    this._graph.setNodeAttribute(skillId, 'attachments', attachments);
    this._graph.setNodeAttribute(skillId, 'updatedAt', Date.now());
    this.ctx.markDirty();
    this.ctx.emit('skill:attachment:deleted', { projectId: this.ctx.projectId, skillId, filename: safe });
    return true;
  }

  syncAttachments(skillId: string): void {
    const dir = this.skillsDir;
    if (!dir) return;
    if (!this._graph.hasNode(skillId) || isProxy(this._graph, skillId)) return;

    const attachments = scanAttachments(path.join(dir, skillId), 'skill.md');
    this._graph.setNodeAttribute(skillId, 'attachments', attachments);
    this.ctx.markDirty();
  }

  listAttachments(skillId: string): AttachmentMeta[] {
    if (!this._graph.hasNode(skillId) || isProxy(this._graph, skillId)) return [];
    return this._graph.getNodeAttribute(skillId, 'attachments') ?? [];
  }

  getAttachmentPath(skillId: string, filename: string): string | null {
    const dir = this.skillsDir;
    if (!dir) return null;
    return getAttPath(dir, skillId, filename);
  }

  // -- Import from file (reverse mirror — does NOT write back to file) --

  async importFromFile(parsed: ParsedSkillFile): Promise<void> {
    const exists = this._graph.hasNode(parsed.id) && !isProxy(this._graph, parsed.id);
    const embedding = await this.embedFn(`${parsed.title} ${parsed.description}`);
    const now = Date.now();

    if (exists) {
      const existing = this._graph.getNodeAttributes(parsed.id);
      this._graph.mergeNodeAttributes(parsed.id, {
        title: parsed.title,
        description: parsed.description,
        steps: parsed.steps,
        triggers: parsed.triggers,
        inputHints: parsed.inputHints,
        filePatterns: parsed.filePatterns,
        tags: parsed.tags,
        source: parsed.source,
        confidence: parsed.confidence,
        embedding,
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
        steps: parsed.steps,
        triggers: parsed.triggers,
        inputHints: parsed.inputHints,
        filePatterns: parsed.filePatterns,
        tags: parsed.tags,
        source: parsed.source,
        confidence: parsed.confidence,
        usageCount: parsed.usageCount ?? 0,
        lastUsedAt: parsed.lastUsedAt ?? null,
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
    this.ctx.emit(exists ? 'skill:updated' : 'skill:created', { projectId: this.ctx.projectId, skillId: parsed.id });
  }

  deleteFromFile(skillId: string): void {
    if (!this._graph.hasNode(skillId)) return;
    if (isProxy(this._graph, skillId)) return;

    deleteSkill(this._graph, skillId);

    if (this.knowledgeGraph) {
      const pId = `@skills::${skillId}`;
      if (this.knowledgeGraph.hasNode(pId)) this.knowledgeGraph.dropNode(pId);
    }

    if (this.taskGraph) {
      const pId = `@skills::${skillId}`;
      if (this.taskGraph.hasNode(pId)) this.taskGraph.dropNode(pId);
    }

    this.ctx.markDirty();
    this.ctx.emit('skill:deleted', { projectId: this.ctx.projectId, skillId });
  }

  private syncRelationsFromFile(skillId: string, desired: RelationFrontmatter[]): void {
    const current: RelationFrontmatter[] = [];
    this._graph.forEachOutEdge(skillId, (_edge, attrs, _src, target) => {
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
        deleteCrossRelation(this._graph, skillId, rel.graph as SkillCrossGraphType, rel.to);
        if (rel.graph === 'knowledge' && this.knowledgeGraph) {
          deleteMirrorFromKnowledgeGraph(this.knowledgeGraph, skillId, rel.to);
        }
        if (rel.graph === 'tasks' && this.taskGraph) {
          deleteMirrorFromTaskGraph(this.taskGraph, skillId, rel.to);
        }
      } else {
        deleteSkillRelation(this._graph, skillId, rel.to);
      }
    }

    for (const rel of diff.toAdd) {
      if (rel.graph) {
        const extGraph = resolveExternalGraph(this.ext, rel.graph as SkillCrossGraphType);
        createCrossRelation(this._graph, skillId, rel.graph as SkillCrossGraphType, rel.to, rel.kind, extGraph);
        if (rel.graph === 'knowledge' && this.knowledgeGraph) {
          createMirrorInKnowledgeGraph(this.knowledgeGraph, skillId, rel.to, rel.kind);
        }
        if (rel.graph === 'tasks' && this.taskGraph) {
          createMirrorInTaskGraph(this.taskGraph, skillId, rel.to, rel.kind);
        }
      } else {
        createSkillRelation(this._graph, skillId, rel.to, rel.kind);
      }
    }
  }

  // -- Read --

  getSkill(skillId: string) {
    return getSkill(this._graph, skillId);
  }

  listSkills(opts?: {
    source?: SkillSource; tag?: string; filter?: string; limit?: number;
  }) {
    return listSkills(this._graph, opts);
  }

  async searchSkills(query: string, opts?: {
    topK?: number; bfsDepth?: number; maxResults?: number; minScore?: number; bfsDecay?: number;
    searchMode?: 'hybrid' | 'vector' | 'keyword'; rrfK?: number;
  }): Promise<SkillSearchResult[]> {
    const embedding = await this.embedFn(query);
    return searchSkills(this._graph, embedding, { ...opts, queryText: query, bm25Index: this._bm25Index });
  }

  listRelations(skillId: string) {
    return listSkillRelations(this._graph, skillId, this.ext);
  }

  findLinkedSkills(targetGraph: SkillCrossGraphType, targetNodeId: string, kind?: string) {
    return findLinkedSkills(this._graph, targetGraph, targetNodeId, kind);
  }
}
