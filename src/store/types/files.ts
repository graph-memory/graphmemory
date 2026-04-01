import type { MetaMixin, PaginationOptions, SearchQuery, SearchResult } from './common';

// ---------------------------------------------------------------------------
// File Index Store (indexed)
// ---------------------------------------------------------------------------

export type FileNodeKind = 'file' | 'directory';

export interface FileNode {
  id: number;
  kind: FileNodeKind;
  filePath: string;
  fileName: string;
  directory: string;
  extension: string;
  language: string | null;
  mimeType: string | null;
  size: number;
  mtime: number;
}

export interface FileListOptions extends PaginationOptions {
  /** Browse a specific directory (list children) */
  directory?: string;
  /** Filter by extension */
  extension?: string;
  /** Substring match on path */
  filter?: string;
}

export interface FilesStore extends MetaMixin {
  /** Add or update a file entry */
  updateFile(filePath: string, size: number, mtime: number, embedding: number[]): void;

  /** Remove a file entry (auto-cleans empty parent dirs) */
  removeFile(filePath: string): void;

  /** Get mtime for a file (null if not indexed) */
  getFileMtime(filePath: string): number | null;

  /** List files/directories */
  listFiles(opts?: FileListOptions): { results: FileNode[]; total: number };

  /** Get info for a single file or directory */
  getFileInfo(filePath: string): FileNode | null;

  /** Search files by path */
  search(query: SearchQuery): SearchResult[];
}
