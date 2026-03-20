import fs from 'fs';
import path from 'path';
import { createFileIndexGraph, type FileIndexGraph, type FileIndexNodeAttributes } from '@/graphs/file-index-types';
import { getLanguage, getMimeType } from '@/graphs/file-lang';
import type { EmbedFns, ExternalGraphs, IncomingCrossLink } from '@/graphs/manager-types';
import { findIncomingCrossLinks } from '@/graphs/manager-types';
import { searchFileIndex, type FileIndexSearchResult } from '@/lib/search/file-index';
import { compressEmbeddings, decompressEmbeddings } from '@/lib/embedding-codec';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Ensure the full directory chain exists from `dir` up to root (`.`).
 * Creates directory nodes and `contains` edges as needed.
 */
export function ensureDirectoryChain(graph: FileIndexGraph, dir: string): void {
  if (dir === '.') {
    ensureRootNode(graph);
    return;
  }

  if (!graph.hasNode(dir)) {
    const parent = path.dirname(dir);
    const parentDir = parent === '.' ? '.' : parent;
    graph.addNode(dir, {
      kind: 'directory',
      filePath: dir,
      fileName: path.basename(dir),
      directory: parentDir,
      extension: '',
      language: null,
      mimeType: null,
      size: 0,
      fileCount: 0,
      embedding: [],
      mtime: 0,
    });
    ensureDirectoryChain(graph, parentDir);
    if (!graph.hasEdge(parentDir, dir)) {
      graph.addEdge(parentDir, dir, { kind: 'contains' });
    }
  }
}

function ensureRootNode(graph: FileIndexGraph): void {
  if (!graph.hasNode('.')) {
    graph.addNode('.', {
      kind: 'directory',
      filePath: '.',
      fileName: '.',
      directory: '',
      extension: '',
      language: null,
      mimeType: null,
      size: 0,
      fileCount: 0,
      embedding: [],
      mtime: 0,
    });
  }
}

/**
 * Add or update a file entry in the graph.
 * Creates parent directory chain + `contains` edges automatically.
 */
export function updateFileEntry(
  graph: FileIndexGraph,
  filePath: string,
  size: number,
  mtime: number,
  embedding: number[],
): void {
  const ext = path.extname(filePath);
  const dir = path.dirname(filePath);
  const directory = dir === '.' ? '.' : dir;

  const attrs: FileIndexNodeAttributes = {
    kind: 'file',
    filePath,
    fileName: path.basename(filePath),
    directory,
    extension: ext,
    language: getLanguage(ext),
    mimeType: getMimeType(ext),
    size,
    fileCount: 0,
    embedding,
    mtime,
  };

  if (graph.hasNode(filePath)) {
    graph.replaceNodeAttributes(filePath, attrs);
  } else {
    graph.addNode(filePath, attrs);
    ensureDirectoryChain(graph, directory);
    if (!graph.hasEdge(directory, filePath)) {
      graph.addEdge(directory, filePath, { kind: 'contains' });
    }
  }
}

/**
 * Remove a file node from the graph.
 * Cleans up empty directory nodes (directories with no remaining children).
 */
export function removeFileEntry(graph: FileIndexGraph, filePath: string): void {
  if (!graph.hasNode(filePath)) return;
  const dir = graph.getNodeAttribute(filePath, 'directory');
  graph.dropNode(filePath);
  cleanEmptyDirs(graph, dir);
}

/** Recursively remove directory nodes that have no children. */
function cleanEmptyDirs(graph: FileIndexGraph, dir: string): void {
  if (!dir || dir === '') return;
  if (!graph.hasNode(dir)) return;
  if (graph.getNodeAttribute(dir, 'kind') !== 'directory') return;

  // Never remove root
  if (dir === '.') return;

  // Count outgoing `contains` edges
  const children = graph.outDegree(dir);
  if (children > 0) return;

  // No children — remove this directory
  const parent = graph.getNodeAttribute(dir, 'directory');
  graph.dropNode(dir);
  cleanEmptyDirs(graph, parent);
}

/**
 * Get mtime for a file node. Returns 0 if not found.
 */
export function getFileEntryMtime(graph: FileIndexGraph, filePath: string): number {
  if (!graph.hasNode(filePath)) return 0;
  return graph.getNodeAttribute(filePath, 'mtime');
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface FileListEntry {
  filePath: string;
  kind: 'file' | 'directory';
  fileName: string;
  extension: string;
  language: string | null;
  mimeType: string | null;
  size: number;
  fileCount: number;
}

/**
 * List files (and directories when browsing a directory).
 * When `directory` is provided, returns immediate children of that directory.
 * Otherwise returns all file nodes matching the filters.
 */
export function listAllFiles(
  graph: FileIndexGraph,
  options: {
    directory?: string;
    extension?: string;
    language?: string;
    filter?: string;
    limit?: number;
  } = {},
): FileListEntry[] {
  const { directory, extension, language, filter, limit = 50 } = options;
  const lowerFilter = filter?.toLowerCase();
  const results: FileListEntry[] = [];

  if (directory !== undefined) {
    // List immediate children of the specified directory
    const dirId = directory || '.';
    if (!graph.hasNode(dirId)) return [];

    graph.forEachOutNeighbor(dirId, (childId) => {
      const attrs = graph.getNodeAttributes(childId);
      if (graph.getEdgeAttribute(graph.edge(dirId, childId)!, 'kind') !== 'contains') return;
      if (extension && attrs.extension !== extension) return;
      if (language && attrs.language !== language) return;
      if (lowerFilter && !attrs.filePath.toLowerCase().includes(lowerFilter)) return;
      results.push(toEntry(attrs));
    });
  } else {
    // List all files matching filters (no dirs in flat mode)
    graph.forEachNode((_, attrs) => {
      if (attrs.kind !== 'file') return;
      if (extension && attrs.extension !== extension) return;
      if (language && attrs.language !== language) return;
      if (lowerFilter && !attrs.filePath.toLowerCase().includes(lowerFilter)) return;
      results.push(toEntry(attrs));
    });
  }

  results.sort((a, b) => a.filePath.localeCompare(b.filePath));
  return results.slice(0, limit);
}

function toEntry(attrs: FileIndexNodeAttributes): FileListEntry {
  return {
    filePath: attrs.filePath,
    kind: attrs.kind,
    fileName: attrs.fileName,
    extension: attrs.extension,
    language: attrs.language,
    mimeType: attrs.mimeType,
    size: attrs.size,
    fileCount: attrs.fileCount,
  };
}

/**
 * Get full info for a specific file or directory.
 */
export function getFileInfo(
  graph: FileIndexGraph,
  filePath: string,
): (FileListEntry & { directory: string; mtime: number }) | null {
  if (!graph.hasNode(filePath)) return null;
  const attrs = graph.getNodeAttributes(filePath);
  return {
    ...toEntry(attrs),
    directory: attrs.directory,
    mtime: attrs.mtime,
  };
}

/**
 * Recompute `size` and `fileCount` aggregates on all directory nodes.
 * Call after a full scan/drain to ensure stats are up to date.
 */
export function rebuildDirectoryStats(graph: FileIndexGraph): void {
  // Reset all directory stats
  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'directory') {
      graph.setNodeAttribute(id, 'size', 0);
      graph.setNodeAttribute(id, 'fileCount', 0);
    }
  });

  // Walk all file nodes and accumulate to their direct parent
  graph.forEachNode((_, attrs) => {
    if (attrs.kind !== 'file') return;
    const dir = attrs.directory;
    if (!graph.hasNode(dir)) return;
    graph.setNodeAttribute(dir, 'size', graph.getNodeAttribute(dir, 'size') + attrs.size);
    graph.setNodeAttribute(dir, 'fileCount', graph.getNodeAttribute(dir, 'fileCount') + 1);
  });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveFileIndexGraph(graph: FileIndexGraph, graphMemory: string, embeddingFingerprint?: string): void {
  fs.mkdirSync(graphMemory, { recursive: true });
  const file = path.join(graphMemory, 'file-index.json');
  const tmp = file + '.tmp';
  try {
    const exported = graph.export();
    compressEmbeddings(exported);
    fs.writeFileSync(tmp, JSON.stringify({ embeddingModel: embeddingFingerprint, graph: exported }));
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore cleanup error */ }
    throw err;
  }
}

export function loadFileIndexGraph(graphMemory: string, fresh = false, embeddingFingerprint?: string): FileIndexGraph {
  const graph = createFileIndexGraph();
  if (fresh) return graph;
  const file = path.join(graphMemory, 'file-index.json');

  if (!fs.existsSync(file)) return graph;

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const stored = data.embeddingModel as string | undefined;

    if (embeddingFingerprint && stored !== embeddingFingerprint) {
      process.stderr.write(`[file-index] Embedding config changed, re-indexing file index\n`);
      return graph;
    }

    decompressEmbeddings(data.graph);
    graph.import(data.graph);
    process.stderr.write(`[file-index] Loaded ${graph.order} nodes, ${graph.size} edges\n`);
  } catch (err) {
    process.stderr.write(`[file-index] Failed to load graph, starting fresh: ${err}\n`);
  }

  return graph;
}

// ---------------------------------------------------------------------------
// FileIndexGraphManager — unified API for file index graph operations
// ---------------------------------------------------------------------------

export class FileIndexGraphManager {
  constructor(
    private _graph: FileIndexGraph,
    private embedFns: EmbedFns,
    private ext: ExternalGraphs = {},
  ) {}

  get graph(): FileIndexGraph { return this._graph; }

  // -- Write (used by indexer) --

  updateFileEntry(filePath: string, size: number, mtime: number, embedding: number[]): void {
    updateFileEntry(this._graph, filePath, size, mtime, embedding);
  }

  removeFileEntry(filePath: string): void {
    removeFileEntry(this._graph, filePath);
  }

  rebuildDirectoryStats(): void {
    rebuildDirectoryStats(this._graph);
  }

  getFileEntryMtime(filePath: string): number {
    return getFileEntryMtime(this._graph, filePath);
  }

  // -- Read --

  listAllFiles(options?: {
    directory?: string; extension?: string; language?: string; filter?: string; limit?: number;
  }): FileListEntry[] {
    return listAllFiles(this._graph, options);
  }

  getFileInfo(filePath: string): (ReturnType<typeof getFileInfo> & { crossLinks?: IncomingCrossLink[] }) | null {
    const info = getFileInfo(this._graph, filePath);
    if (!info) return null;
    const crossLinks = findIncomingCrossLinks(this.ext, 'files', filePath);
    return crossLinks.length > 0 ? { ...info, crossLinks } : info;
  }

  async search(query: string, opts?: {
    topK?: number; minScore?: number;
  }): Promise<FileIndexSearchResult[]> {
    const embedding = await this.embedFns.query(query);
    return searchFileIndex(this._graph, embedding, opts);
  }
}
