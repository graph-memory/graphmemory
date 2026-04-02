export type FileIndexNodeKind = 'file' | 'directory';

export type FileIndexEdgeKind = 'contains';

export interface FileIndexNodeAttributes {
  kind: FileIndexNodeKind;
  filePath: string;        // relative path from projectDir (= node ID)
  fileName: string;        // basename, e.g. "config.ts"
  directory: string;       // parent dir path, e.g. "src/lib" or "."
  extension: string;       // e.g. ".ts", ".md", ".png", "" (dirs: "")
  language: string | null; // "typescript", "markdown", etc. (dirs: null)
  mimeType: string | null; // "text/typescript", "image/png", etc. (dirs: null)
  size: number;            // bytes (dirs: total size of direct children files)
  fileCount: number;       // 0 for files; count of direct children for dirs
  embedding: number[];     // embedded from filePath (files only; [] for dirs)
  mtime: number;           // file mtimeMs (dirs: 0)
}

export interface FileIndexEdgeAttributes {
  kind: FileIndexEdgeKind;
}

// FileIndexGraph type alias and createFileIndexGraph() removed — indexed graphs now use SQLite Store.
