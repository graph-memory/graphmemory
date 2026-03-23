import fs from 'fs';
import path from 'path';
import type { CodeGraph, CodeNodeAttributes } from '@/graphs/code-types';
import { createCodeGraph } from '@/graphs/code-types';
import type { ParsedFile } from '@/lib/parsers/code';
import type { EmbedFns, ExternalGraphs, IncomingCrossLink } from '@/graphs/manager-types';
import { findIncomingCrossLinks } from '@/graphs/manager-types';
import { searchCode, type CodeSearchResult } from '@/lib/search/code';
import { searchCodeFiles, type CodeFileSearchResult } from '@/lib/search/files';
import { BM25Index, type SearchMode } from '@/lib/search/bm25';
import { compressEmbeddings, decompressEmbeddings } from '@/lib/embedding-codec';
import { readJsonWithTmpFallback, validateGraphStructure } from '@/lib/graph-persistence';
import { BM25_BODY_MAX_CHARS, LIST_LIMIT_SMALL, GRAPH_DATA_VERSION } from '@/lib/defaults';

export type { CodeGraph };
export { createCodeGraph };

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Replace all nodes/edges for a given file. */
export function updateCodeFile(graph: CodeGraph, parsed: ParsedFile): void {
  removeCodeFile(graph, parsed.fileId);

  for (const { id, attrs } of parsed.nodes) {
    graph.addNode(id, attrs);
  }

  const pendingImports: string[] = [];
  const pendingEdges: Array<{ from: string; toName: string; kind: 'extends' | 'implements' }> = [];
  for (const { from, to, attrs } of parsed.edges) {
    if (!graph.hasNode(to)) {
      if (attrs.kind === 'imports') {
        pendingImports.push(to);
      } else if (attrs.kind === 'extends' || attrs.kind === 'implements') {
        // Target class/interface may be in another file — defer resolution
        const toName = to.split('::').pop()!;
        pendingEdges.push({ from, toName, kind: attrs.kind });
      }
      continue;
    }
    if (graph.hasNode(from) && !graph.hasEdge(from, to)) {
      graph.addEdgeWithKey(`${from}→${to}`, from, to, attrs);
    }
  }

  // Store pending data on the file node for post-drain resolution
  if (graph.hasNode(parsed.fileId)) {
    if (pendingImports.length > 0) {
      graph.setNodeAttribute(parsed.fileId, 'pendingImports', pendingImports);
    }
    if (pendingEdges.length > 0) {
      graph.setNodeAttribute(parsed.fileId, 'pendingEdges', pendingEdges);
    }
  }
}

/**
 * Resolve pending import edges after all files have been indexed.
 * Creates 'imports' edges from file nodes to targets that are now in the graph.
 */
export function resolvePendingImports(graph: CodeGraph): number {
  let created = 0;
  graph.forEachNode((id, attrs: CodeNodeAttributes) => {
    if (!attrs.pendingImports || attrs.pendingImports.length === 0) return;
    const remaining: string[] = [];
    for (const targetId of attrs.pendingImports) {
      if (graph.hasNode(targetId) && id !== targetId) {
        const edgeKey = `${id}→${targetId}`;
        if (!graph.hasEdge(edgeKey)) {
          graph.addEdgeWithKey(edgeKey, id, targetId, { kind: 'imports' });
          created++;
        }
      } else {
        remaining.push(targetId);
      }
    }
    graph.setNodeAttribute(id, 'pendingImports', remaining.length > 0 ? remaining : undefined);
  });
  return created;
}

/**
 * Resolve pending extends/implements edges after all files have been indexed.
 * When multiple candidates share the same name, prefers the one whose file
 * is imported by the source file (falls back to first match).
 */
export function resolvePendingEdges(graph: CodeGraph): number {
  const nameIndex = new Map<string, string[]>();
  graph.forEachNode((id, attrs: CodeNodeAttributes) => {
    if (attrs.kind === 'class' || attrs.kind === 'interface') {
      const list = nameIndex.get(attrs.name) ?? [];
      list.push(id);
      nameIndex.set(attrs.name, list);
    }
  });

  // Build file → imported file IDs index for disambiguation
  const fileImports = new Map<string, Set<string>>();
  graph.forEachNode((id, attrs: CodeNodeAttributes) => {
    if (attrs.kind === 'file') {
      const imported = new Set<string>();
      graph.forEachOutEdge(id, (_edge, edgeAttrs, _src, target) => {
        if (edgeAttrs.kind === 'imports') imported.add(target);
      });
      fileImports.set(id, imported);
    }
  });

  let created = 0;
  graph.forEachNode((id, attrs: CodeNodeAttributes) => {
    if (!attrs.pendingEdges || attrs.pendingEdges.length === 0) return;
    const remaining: typeof attrs.pendingEdges = [];
    for (const edge of attrs.pendingEdges) {
      const candidates = nameIndex.get(edge.toName);
      if (candidates && candidates.length > 0 && graph.hasNode(edge.from)) {
        let toId: string;
        if (candidates.length === 1) {
          toId = candidates[0];
        } else {
          // Disambiguate: prefer candidate whose file is imported by edge.from's file
          const fromFileId = edge.from.split('::')[0];
          const imports = fileImports.get(fromFileId);
          const match = imports && candidates.find(c => {
            const cFileId = c.split('::')[0];
            return imports.has(cFileId);
          });
          toId = match ?? candidates[0];
        }
        if (toId !== edge.from && !graph.hasEdge(edge.from, toId)) {
          graph.addEdgeWithKey(`${edge.from}→${toId}`, edge.from, toId, { kind: edge.kind });
          created++;
        }
      } else {
        remaining.push(edge);
      }
    }
    graph.setNodeAttribute(id, 'pendingEdges', remaining.length > 0 ? remaining : undefined);
  });
  return created;
}

/** Remove all nodes (and their incident edges) belonging to a file. */
export function removeCodeFile(graph: CodeGraph, fileId: string): void {
  const toRemove = graph.filterNodes(
    (_, attrs: CodeNodeAttributes) => attrs.fileId === fileId,
  );
  toRemove.forEach(id => graph.dropNode(id));
}

/** Return all nodes for a file, sorted by startLine. */
export function getFileSymbols(
  graph: CodeGraph,
  fileId: string,
): Array<{ id: string } & CodeNodeAttributes> {
  return graph
    .filterNodes((_, attrs: CodeNodeAttributes) => attrs.fileId === fileId)
    .map(id => ({ id, ...graph.getNodeAttributes(id) }))
    .sort((a, b) => a.startLine - b.startLine);
}

/** Return mtime for any node in the file (0 if not indexed). */
export function getCodeFileMtime(graph: CodeGraph, fileId: string): number {
  const nodes = graph.filterNodes((_, attrs: CodeNodeAttributes) => attrs.fileId === fileId);
  if (nodes.length === 0) return 0;
  return graph.getNodeAttribute(nodes[0], 'mtime');
}

/** List all indexed files with symbol counts. */
export function listCodeFiles(
  graph: CodeGraph,
  filter?: string,
  limit: number = LIST_LIMIT_SMALL,
): Array<{ fileId: string; symbolCount: number }> {
  const files = new Map<string, number>();
  const lowerFilter = filter?.toLowerCase();

  graph.forEachNode((_, attrs: CodeNodeAttributes) => {
    files.set(attrs.fileId, (files.get(attrs.fileId) ?? 0) + 1);
  });

  let result = [...files.entries()]
    .map(([fileId, symbolCount]) => ({ fileId, symbolCount }))
    .sort((a, b) => a.fileId.localeCompare(b.fileId));

  if (lowerFilter) {
    result = result.filter(f => f.fileId.toLowerCase().includes(lowerFilter));
  }

  return result.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveCodeGraph(graph: CodeGraph, graphMemory: string, embeddingFingerprint?: string): void {
  fs.mkdirSync(graphMemory, { recursive: true });
  const file = path.join(graphMemory, 'code.json');
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

export function loadCodeGraph(graphMemory: string, fresh = false, embeddingFingerprint?: string): CodeGraph {
  const graph = createCodeGraph();
  if (fresh) return graph;
  const file = path.join(graphMemory, 'code.json');

  const data = readJsonWithTmpFallback(file);
  if (!data) return graph;

  try {
    const storedVersion = data.version as number | undefined;
    if (storedVersion !== GRAPH_DATA_VERSION) {
      process.stderr.write(`[code-graph] Data version changed (${storedVersion ?? 'none'} → ${GRAPH_DATA_VERSION}), re-indexing code graph\n`);
      return graph;
    }

    const stored = data.embeddingModel as string | undefined;
    if (embeddingFingerprint && stored !== embeddingFingerprint) {
      process.stderr.write(`[code-graph] Embedding config changed, re-indexing code graph\n`);
      return graph;
    }

    if (!validateGraphStructure(data.graph)) {
      process.stderr.write(`[code-graph] Invalid graph structure in ${file}, starting fresh\n`);
      return graph;
    }

    decompressEmbeddings(data.graph);
    graph.import(data.graph);
    process.stderr.write(`[code-graph] Loaded ${graph.order} nodes, ${graph.size} edges\n`);
  } catch (err) {
    process.stderr.write(`[code-graph] Failed to load graph, starting fresh: ${err}\n`);
  }

  return graph;
}

// ---------------------------------------------------------------------------
// CodeGraphManager — unified API for code graph operations
// ---------------------------------------------------------------------------

export class CodeGraphManager {
  private _bm25Index = new BM25Index<CodeNodeAttributes>((attrs) => `${attrs.name} ${attrs.signature} ${attrs.docComment} ${attrs.body.slice(0, BM25_BODY_MAX_CHARS)}`);
  private _fileBm25 = new BM25Index<{ fileId: string }>((attrs) => attrs.fileId);

  constructor(
    private _graph: CodeGraph,
    private embedFns: EmbedFns,
    private ext: ExternalGraphs = {},
  ) {
    _graph.forEachNode((id, attrs) => {
      this._bm25Index.addDocument(id, attrs);
      if (attrs.kind === 'file') this._fileBm25.addDocument(attrs.fileId, { fileId: attrs.fileId });
    });
  }

  get graph(): CodeGraph { return this._graph; }
  get bm25Index(): BM25Index<CodeNodeAttributes> { return this._bm25Index; }

  // -- Write (used by indexer) --

  updateFile(parsed: ParsedFile): void {
    // Remove old nodes from BM25
    this._graph.forEachNode((id, attrs) => {
      if (attrs.fileId === parsed.fileId) this._bm25Index.removeDocument(id);
    });
    this._fileBm25.removeDocument(parsed.fileId);
    updateCodeFile(this._graph, parsed);
    // Add new nodes to BM25
    this._graph.forEachNode((id, attrs) => {
      if (attrs.fileId === parsed.fileId) this._bm25Index.addDocument(id, attrs);
    });
    this._fileBm25.addDocument(parsed.fileId, { fileId: parsed.fileId });
  }

  removeFile(fileId: string): void {
    this._graph.forEachNode((id, attrs) => {
      if (attrs.fileId === fileId) this._bm25Index.removeDocument(id);
    });
    this._fileBm25.removeDocument(fileId);
    removeCodeFile(this._graph, fileId);
  }

  // -- Read --

  listFiles(filter?: string, limit?: number) {
    return listCodeFiles(this._graph, filter, limit);
  }

  getFileSymbols(fileId: string) {
    return getFileSymbols(this._graph, fileId);
  }

  getFileMtime(fileId: string): number {
    return getCodeFileMtime(this._graph, fileId);
  }

  getSymbolEdges(nodeId: string): Array<{ source: string; target: string; kind: string }> {
    if (!this._graph.hasNode(nodeId)) return [];
    const edges: Array<{ source: string; target: string; kind: string }> = [];
    this._graph.forEachOutEdge(nodeId, (_edge, attrs, source, target) => {
      edges.push({ source, target, kind: attrs.kind });
    });
    this._graph.forEachInEdge(nodeId, (_edge, attrs, source, target) => {
      edges.push({ source, target, kind: attrs.kind });
    });
    return edges;
  }

  getSymbol(nodeId: string): ({ id: string; crossLinks?: IncomingCrossLink[] } & CodeNodeAttributes) | null {
    if (!this._graph.hasNode(nodeId)) return null;
    const crossLinks = findIncomingCrossLinks(this.ext, 'code', nodeId);
    return { id: nodeId, ...this._graph.getNodeAttributes(nodeId), ...(crossLinks.length > 0 ? { crossLinks } : {}) };
  }

  async search(query: string, opts?: {
    topK?: number; bfsDepth?: number; maxResults?: number; minScore?: number; bfsDecay?: number;
    searchMode?: SearchMode; includeBody?: boolean;
  }): Promise<CodeSearchResult[]> {
    const embedding = opts?.searchMode === 'keyword' ? [] : await this.embedFns.query(query);
    return searchCode(this._graph, embedding, { ...opts, queryText: query, bm25Index: this._bm25Index });
  }

  async searchFiles(query: string, opts?: {
    topK?: number; minScore?: number;
  }): Promise<CodeFileSearchResult[]> {
    const embedding = await this.embedFns.query(query);
    return searchCodeFiles(this._graph, embedding, { ...opts, queryText: query, bm25Index: this._fileBm25 });
  }
}
