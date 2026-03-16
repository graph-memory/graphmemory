import { DirectedGraph } from 'graphology';
import fs from 'fs';
import path from 'path';
import type { Chunk } from '@/lib/parsers/docs';
import type { EmbedFn, ExternalGraphs, IncomingCrossLink } from '@/graphs/manager-types';
import { findIncomingCrossLinks } from '@/graphs/manager-types';
import { search, type SearchResult } from '@/lib/search/docs';
import { searchDocFiles, type DocFileSearchResult } from '@/lib/search/files';
import { BM25Index, type SearchMode } from '@/lib/search/bm25';

export interface NodeAttributes {
  fileId: string;
  title: string;
  content: string;
  embedding: number[];
  fileEmbedding: number[]; // file-level embedding (only on level=1 root chunks); [] until filled
  level: number;    // 1 = root chunk, 2 = ##, 3 = ###
  mtime: number;
  language?: string;   // fenced code block language tag (undefined for text chunks)
  symbols: string[];   // extracted symbol names from code blocks ([] for text chunks)
}

export type DocGraph = DirectedGraph<NodeAttributes>;

export function createGraph(): DocGraph {
  return new DirectedGraph<NodeAttributes>({ multi: false, allowSelfLoops: false });
}

// Replace all chunks for a given file
export function updateFile(
  graph: DocGraph,
  chunks: Chunk[],
  mtime: number,
): void {
  if (chunks.length === 0) return;
  const fileId = chunks[0].fileId;

  removeFile(graph, fileId);

  // Add nodes
  for (const chunk of chunks) {
    graph.addNode(chunk.id, {
      fileId,
      title: chunk.title,
      content: chunk.content,
      embedding: chunk.embedding,
      fileEmbedding: [],
      level: chunk.level,
      mtime,
      language: chunk.language,
      symbols: chunk.symbols ?? [],
    });
  }

  // Sibling edges: consecutive chunks within the same file
  for (let i = 0; i < chunks.length - 1; i++) {
    graph.addEdge(chunks[i].id, chunks[i + 1].id);
  }

  // Cross-file link edges: chunk → root chunk of target file
  for (const chunk of chunks) {
    for (const targetFileId of chunk.links) {
      const targetRootId = targetFileId; // root chunk id === fileId
      if (graph.hasNode(targetRootId) && chunk.id !== targetRootId) {
        if (!graph.hasEdge(chunk.id, targetRootId)) {
          graph.addEdge(chunk.id, targetRootId);
        }
      }
    }
  }
}

export function removeFile(graph: DocGraph, fileId: string): void {
  const toRemove = graph.filterNodes(
    (_, attrs: NodeAttributes) => attrs.fileId === fileId,
  );
  toRemove.forEach(id => graph.dropNode(id));
}

export function getFileChunks(graph: DocGraph, fileId: string): Array<{ id: string } & NodeAttributes> {
  return graph
    .filterNodes((_, attrs: NodeAttributes) => attrs.fileId === fileId)
    .map(id => ({ id, ...graph.getNodeAttributes(id) }))
    .sort((a, b) => a.level - b.level);
}

export function getFileMtime(graph: DocGraph, fileId: string): number {
  const nodes = graph.filterNodes((_, attrs: NodeAttributes) => attrs.fileId === fileId);
  if (nodes.length === 0) return 0;
  return graph.getNodeAttribute(nodes[0], 'mtime');
}

export function listFiles(
  graph: DocGraph,
  filter?: string,
  limit: number = 20,
): Array<{ fileId: string; title: string; chunks: number }> {
  const files = new Map<string, { title: string; chunks: number }>();
  const lowerFilter = filter?.toLowerCase();

  graph.forEachNode((_, attrs: NodeAttributes) => {
    const entry = files.get(attrs.fileId);
    if (!entry) {
      files.set(attrs.fileId, { title: attrs.title, chunks: 1 });
    } else {
      if (attrs.level === 1) entry.title = attrs.title;
      entry.chunks++;
    }
  });

  let result = [...files.entries()]
    .map(([fileId, { title, chunks }]) => ({ fileId, title, chunks }))
    .sort((a, b) => a.fileId.localeCompare(b.fileId));

  if (lowerFilter) {
    result = result.filter(f => f.fileId.toLowerCase().includes(lowerFilter));
  }

  return result.slice(0, limit);
}

export function saveGraph(graph: DocGraph, graphMemory: string): void {
  fs.mkdirSync(graphMemory, { recursive: true });
  const file = path.join(graphMemory, 'docs.json');
  fs.writeFileSync(file, JSON.stringify(graph.export()));
}

export function loadGraph(graphMemory: string, fresh = false): DocGraph {
  const graph = createGraph();
  if (fresh) return graph;
  const file = path.join(graphMemory, 'docs.json');

  if (!fs.existsSync(file)) return graph;

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    graph.import(data);
    process.stderr.write(`[graph] Loaded ${graph.order} nodes, ${graph.size} edges\n`);
  } catch (err) {
    process.stderr.write(`[graph] Failed to load graph, starting fresh: ${err}\n`);
  }

  return graph;
}

// ---------------------------------------------------------------------------
// DocGraphManager — unified API for docs graph operations
// ---------------------------------------------------------------------------

export class DocGraphManager {
  private _bm25Index = new BM25Index<NodeAttributes>((attrs) => `${attrs.title} ${attrs.content}`);

  constructor(
    private _graph: DocGraph,
    private embedFn: EmbedFn,
    private ext: ExternalGraphs = {},
  ) {
    _graph.forEachNode((id, attrs) => {
      this._bm25Index.addDocument(id, attrs);
    });
  }

  get graph(): DocGraph { return this._graph; }
  get bm25Index(): BM25Index<NodeAttributes> { return this._bm25Index; }

  // -- Write (used by indexer) --

  updateFile(chunks: Chunk[], mtime: number): void {
    // Remove old nodes from BM25
    if (chunks.length > 0) {
      const fileId = chunks[0].fileId;
      this._graph.forEachNode((id, attrs) => {
        if (attrs.fileId === fileId) this._bm25Index.removeDocument(id);
      });
    }
    updateFile(this._graph, chunks, mtime);
    // Add new nodes to BM25
    if (chunks.length > 0) {
      const fileId = chunks[0].fileId;
      this._graph.forEachNode((id, attrs) => {
        if (attrs.fileId === fileId) this._bm25Index.addDocument(id, attrs);
      });
    }
  }

  removeFile(fileId: string): void {
    this._graph.forEachNode((id, attrs) => {
      if (attrs.fileId === fileId) this._bm25Index.removeDocument(id);
    });
    removeFile(this._graph, fileId);
  }

  // -- Read --

  listFiles(filter?: string, limit?: number) {
    return listFiles(this._graph, filter, limit);
  }

  getFileChunks(fileId: string) {
    return getFileChunks(this._graph, fileId);
  }

  getFileMtime(fileId: string): number {
    return getFileMtime(this._graph, fileId);
  }

  getNode(nodeId: string): ({ id: string; crossLinks?: IncomingCrossLink[] } & NodeAttributes) | null {
    if (!this._graph.hasNode(nodeId)) return null;
    const crossLinks = findIncomingCrossLinks(this.ext, 'docs', nodeId);
    return { id: nodeId, ...this._graph.getNodeAttributes(nodeId), ...(crossLinks.length > 0 ? { crossLinks } : {}) };
  }

  async search(query: string, opts?: {
    topK?: number; bfsDepth?: number; maxResults?: number; minScore?: number; bfsDecay?: number;
    searchMode?: SearchMode;
  }): Promise<SearchResult[]> {
    const embedding = await this.embedFn(query);
    return search(this._graph, embedding, { ...opts, queryText: query, bm25Index: this._bm25Index });
  }

  async searchFiles(query: string, opts?: {
    topK?: number; minScore?: number;
  }): Promise<DocFileSearchResult[]> {
    const embedding = await this.embedFn(query);
    return searchDocFiles(this._graph, embedding, opts);
  }
}
