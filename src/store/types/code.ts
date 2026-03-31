import type { MetaMixin, PaginationOptions, SearchQuery, SearchResult } from './common';

// ---------------------------------------------------------------------------
// Code Store (indexed)
// ---------------------------------------------------------------------------

/** Parser decides what kinds exist per language (e.g. 'function', 'struct', 'trait', 'macro') */
export type CodeNodeKind = string;

/** Parser decides what edge kinds exist per language (e.g. 'contains', 'imports', 'implements') */
export type CodeEdgeKind = string;

export interface CodeSymbol {
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
}

export interface CodeEdge {
  fromId: number;
  toId: number;
  kind: CodeEdgeKind;
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
   * Replace all symbols for a file (called by indexer).
   * Handles insert/update of nodes and intra-file edges (contains).
   * embeddings: symbolId → vector (keyed by symbol name or temp ref from parser)
   */
  updateFile(fileId: string, symbols: Omit<CodeSymbol, 'id'>[], edges: Array<{ fromName: string; toName: string; kind: CodeEdgeKind }>, mtime: number, embeddings: Map<string, number[]>): void;

  /** Remove all symbols and edges for a file */
  removeFile(fileId: string): void;

  /** Resolve pending cross-file edges (imports, extends, implements) after full index */
  resolveEdges(edges: Array<{ fromName: string; toName: string; kind: CodeEdgeKind }>): void;

  /** Get mtime for a file (null if not indexed) */
  getFileMtime(fileId: string): number | null;

  /** List indexed files with symbol counts */
  listFiles(filter?: string, pagination?: PaginationOptions): { results: CodeFileEntry[]; total: number };

  /** Get all symbols for a file, sorted by startLine */
  getFileSymbols(fileId: string): CodeSymbol[];

  /** Get a single symbol with its edges */
  getSymbol(symbolId: number): (CodeSymbol & { edges: Array<{ id: number; kind: CodeEdgeKind; direction: 'in' | 'out' }> }) | null;

  /** Search symbols (hybrid: FTS5 + sqlite-vec) */
  search(query: SearchQuery): SearchResult[];

  /** Search files by path */
  searchFiles(query: SearchQuery): SearchResult[];

  /** Find symbols by exact name (for cross-references, explain-symbol) */
  findByName(name: string): CodeSymbol[];
}
