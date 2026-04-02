import type { MetaMixin, PaginationOptions, SearchQuery, SearchResult } from './common';

// ---------------------------------------------------------------------------
// Code Store (indexed)
// ---------------------------------------------------------------------------

/** Parser decides what kinds exist per language (e.g. 'file', 'function', 'struct', 'trait') */
export type CodeNodeKind = string;

export interface CodeNode {
  id: number;
  kind: CodeNodeKind;
  fileId: string;
  language: string;
  name: string;
  signature: string;
  docComment: string;
  body: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  mtime: number;
}

export interface CodeFileEntry {
  id: number;
  fileId: string;
  language: string;
  symbolCount: number;
  mtime: number;
}

export interface CodeStore extends MetaMixin {
  /**
   * Replace all nodes for a file (called by indexer).
   * Inserts file node + symbol nodes + edges (contains, intra-file).
   * embeddings: node name/ref → vector
   */
  updateFile(fileId: string, nodes: Omit<CodeNode, 'id'>[], edges: Array<{ fromName: string; toName: string; kind: string }>, mtime: number, embeddings: Map<string, number[]>): void;

  /** Remove all nodes and edges for a file */
  removeFile(fileId: string): void;

  /** Resolve pending cross-file edges (extends, implements) by symbol name after full index */
  resolveEdges(edges: Array<{ fromName: string; toName: string; kind: string }>): void;

  /** Resolve pending import edges (file → file) by file_id after full index */
  resolveImports(imports: Array<{ fromFileId: string; toFileId: string }>): void;

  /** Get mtime for a file (null if not indexed) */
  getFileMtime(fileId: string): number | null;

  /** List indexed files with symbol counts */
  listFiles(filter?: string, pagination?: PaginationOptions): { results: CodeFileEntry[]; total: number };

  /** Get all symbol nodes for a file, sorted by startLine */
  getFileSymbols(fileId: string): CodeNode[];

  /** Get a single node by id */
  getNode(nodeId: number): CodeNode | null;

  /** Search nodes (hybrid: FTS5 + sqlite-vec) */
  search(query: SearchQuery): SearchResult[];

  /** Search files by path */
  searchFiles(query: SearchQuery): SearchResult[];

  /** Find nodes by exact name (for cross-references, explain-symbol) */
  findByName(name: string): CodeNode[];
}
