import type { MetaMixin, PaginationOptions, SearchQuery, SearchResult } from './common';

// ---------------------------------------------------------------------------
// Docs Store (indexed)
// ---------------------------------------------------------------------------

export interface DocChunk {
  id: number;
  fileId: string;
  title: string;
  content: string;
  level: number;
  language?: string;
  symbols: string[];
}

export interface DocFileEntry {
  id: number;
  fileId: string;
  title: string;
  chunkCount: number;
  mtime: number;
}

export interface DocsStore extends MetaMixin {
  /** Replace all chunks for a doc file. embeddings: temp chunk ref → vector */
  updateFile(fileId: string, chunks: Omit<DocChunk, 'id'>[], mtime: number, embeddings: Map<string, number[]>): void;

  /** Remove all chunks for a file */
  removeFile(fileId: string): void;

  /** Resolve pending cross-file link edges after full index */
  resolveLinks(edges: Array<{ fromFileId: string; toFileId: string }>): void;

  /** Get mtime for a file (null if not indexed) */
  getFileMtime(fileId: string): number | null;

  /** List doc files */
  listFiles(filter?: string, pagination?: PaginationOptions): { results: DocFileEntry[]; total: number };

  /** Get all chunks for a file, sorted by level */
  getFileChunks(fileId: string): DocChunk[];

  /** Get a single chunk */
  getNode(chunkId: number): DocChunk | null;

  /** Search chunks */
  search(query: SearchQuery): SearchResult[];

  /** Search doc files by path */
  searchFiles(query: SearchQuery): SearchResult[];

  /** List code snippets (chunks with language set), optionally filtered by language */
  listSnippets(language?: string, pagination?: PaginationOptions): { results: DocChunk[]; total: number };

  /** Search code snippets */
  searchSnippets(query: SearchQuery, language?: string): SearchResult[];

  /** Find chunks that reference a given symbol name */
  findBySymbol(symbol: string): DocChunk[];
}
