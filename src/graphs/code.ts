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
  for (const { from, to, attrs } of parsed.edges) {
    if (!graph.hasNode(to)) {
      if (attrs.kind === 'imports') pendingImports.push(to);
      continue;
    }
    if (graph.hasNode(from) && !graph.hasEdge(from, to)) {
      graph.addEdgeWithKey(`${from}→${to}`, from, to, attrs);
    }
  }

  // Store pending imports on the file node for post-drain resolution
  if (pendingImports.length > 0 && graph.hasNode(parsed.fileId)) {
    graph.setNodeAttribute(parsed.fileId, 'pendingImports', pendingImports);
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
  limit: number = 20,
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
  fs.writeFileSync(tmp, JSON.stringify({ embeddingModel: embeddingFingerprint, graph: graph.export() }));
  fs.renameSync(tmp, file);
}

export function loadCodeGraph(graphMemory: string, fresh = false, embeddingFingerprint?: string): CodeGraph {
  const graph = createCodeGraph();
  if (fresh) return graph;
  const file = path.join(graphMemory, 'code.json');

  if (!fs.existsSync(file)) return graph;

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const stored = data.embeddingModel as string | undefined;

    if (embeddingFingerprint && stored !== embeddingFingerprint) {
      process.stderr.write(`[code-graph] Embedding config changed, re-indexing code graph\n`);
      return graph;
    }

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
  private _bm25Index = new BM25Index<CodeNodeAttributes>((attrs) => `${attrs.name} ${attrs.signature} ${attrs.docComment}`);

  constructor(
    private _graph: CodeGraph,
    private embedFns: EmbedFns,
    private ext: ExternalGraphs = {},
  ) {
    _graph.forEachNode((id, attrs) => {
      this._bm25Index.addDocument(id, attrs);
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
    updateCodeFile(this._graph, parsed);
    // Add new nodes to BM25
    this._graph.forEachNode((id, attrs) => {
      if (attrs.fileId === parsed.fileId) this._bm25Index.addDocument(id, attrs);
    });
  }

  removeFile(fileId: string): void {
    this._graph.forEachNode((id, attrs) => {
      if (attrs.fileId === fileId) this._bm25Index.removeDocument(id);
    });
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

  getSymbol(nodeId: string): ({ id: string; crossLinks?: IncomingCrossLink[] } & CodeNodeAttributes) | null {
    if (!this._graph.hasNode(nodeId)) return null;
    const crossLinks = findIncomingCrossLinks(this.ext, 'code', nodeId);
    return { id: nodeId, ...this._graph.getNodeAttributes(nodeId), ...(crossLinks.length > 0 ? { crossLinks } : {}) };
  }

  async search(query: string, opts?: {
    topK?: number; bfsDepth?: number; maxResults?: number; minScore?: number; bfsDecay?: number;
    searchMode?: SearchMode;
  }): Promise<CodeSearchResult[]> {
    const embedding = opts?.searchMode === 'keyword' ? [] : await this.embedFns.query(query);
    return searchCode(this._graph, embedding, { ...opts, queryText: query, bm25Index: this._bm25Index });
  }

  async searchFiles(query: string, opts?: {
    topK?: number; minScore?: number;
  }): Promise<CodeFileSearchResult[]> {
    const embedding = await this.embedFns.query(query);
    return searchCodeFiles(this._graph, embedding, opts);
  }
}
