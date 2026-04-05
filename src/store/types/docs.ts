import type { MetaMixin, PaginationOptions, SearchQuery, SearchResult } from './common';

// ---------------------------------------------------------------------------
// Docs Store (indexed)
// ---------------------------------------------------------------------------

export type DocNodeKind = 'file' | 'chunk';

export interface DocNode {
  id: number;
  kind: DocNodeKind;
  fileId: string;
  title: string;
  content: string;
  level: number;
  language?: string;
  symbols: string[];
  mtime: number;
}

export interface DocFileEntry {
  id: number;
  fileId: string;
  title: string;
  chunkCount: number;
  mtime: number;
}

export interface DocsStore extends MetaMixin {
  /** Remove all indexed data for this project */
  clear(): void;

  /** Replace all nodes for a doc file (file node + chunk nodes + edges). embeddings: ref → vector */
  updateFile(fileId: string, chunks: Omit<DocNode, 'id' | 'kind'>[], mtime: number, embeddings: Map<string, number[]>): void;

  /** Remove all nodes for a file */
  removeFile(fileId: string): void;

  /** Resolve pending cross-file link edges after full index */
  resolveLinks(edges: Array<{ fromFileId: string; toFileId: string }>): void;

  /** Get mtime for a file (null if not indexed) */
  getFileMtime(fileId: string): number | null;

  /** List doc files */
  listFiles(filter?: string, pagination?: PaginationOptions): { results: DocFileEntry[]; total: number };

  /** Get all chunk nodes for a file, sorted by level */
  getFileChunks(fileId: string): DocNode[];

  /** Get a single node */
  getNode(nodeId: number): DocNode | null;

  /** Search chunks */
  search(query: SearchQuery): SearchResult[];

  /** Search doc files by path */
  searchFiles(query: SearchQuery): SearchResult[];

  /** List code snippets (chunks with language set), optionally filtered by language */
  listSnippets(language?: string, pagination?: PaginationOptions): { results: DocNode[]; total: number };

  /** Search code snippets */
  searchSnippets(query: SearchQuery, language?: string): SearchResult[];

  /** Find chunks that reference a given symbol name */
  findBySymbol(symbol: string): DocNode[];
}
