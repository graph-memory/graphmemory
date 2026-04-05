import fs from 'fs';
import path from 'path';
import micromatch from 'micromatch';
import { embed, embedBatch } from '@/lib/embedder';
import { parseFile, clearWikiIndexCache, type Chunk } from '@/lib/parsers/docs';
import { parseCodeFile } from '@/lib/parsers/code';
import { startWatcher, ALWAYS_IGNORED, type WatcherHandle } from '@/lib/watcher';
import { INDEXER_PREVIEW_LEN } from '@/lib/defaults';
import { normalizePathForEmbed } from '@/lib/path-utils';
import { getLanguage, getMimeType } from '@/lib/file-lang';
import type { ProjectScopedStore, DocsStore, CodeStore, FilesStore, CodeNode } from '@/store/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('indexer');

export type IndexPhase = 'docs' | 'code' | 'files';

export interface ProjectIndexerConfig {
  projectId?: string;
  projectDir: string;
  maxFileSize?: number;
  docsInclude?: string | string[];
  docsExclude: string[];
  codeInclude?: string | string[];
  codeExclude: string[];
  filesExclude: string[];
  chunkDepth: number;
  docsModelName?: string;
  codeModelName?: string;
  filesModelName?: string;
}

export interface ProjectIndexer {
  /** Walk projectDir, dispatch files to queues. With phase, only the matching queue. */
  scan(phase?: IndexPhase): void;
  /** Start a single chokidar watcher; dispatch add/change/unlink by pattern. */
  watch(): WatcherHandle;
  /** Wait for queues to idle. With phase, only the matching queue (no finalize). Without phase, all queues + finalize. */
  drain(phase?: IndexPhase): Promise<void>;
}

export function createProjectIndexer(
  store: ProjectScopedStore,
  config: ProjectIndexerConfig,
  enabledGraphs: { docs?: boolean; code?: boolean; files?: boolean },
): ProjectIndexer {
  // Three independent serial queues — docs, code, and file index.
  // Array-based to avoid promise chain memory accumulation during scan.

  const docsStore: DocsStore | undefined = enabledGraphs.docs ? store.docs : undefined;
  const codeStore: CodeStore | undefined = enabledGraphs.code ? store.code : undefined;
  const filesStore: FilesStore | undefined = enabledGraphs.files ? store.files : undefined;

  type TaskFn = () => Promise<void>;

  function createSerialQueue(label: string) {
    const pending: TaskFn[] = [];
    let running = false;
    let errors = 0;
    let idleResolve: (() => void) | null = null;
    let idlePromise: Promise<void> = Promise.resolve();

    async function pump(): Promise<void> {
      running = true;
      while (pending.length > 0) {
        const fn = pending.shift()!;
        try { await fn(); } catch (err: unknown) {
          errors++;
          log.error({ err, queue: label }, 'queue error');
        }
      }
      running = false;
      if (idleResolve) { idleResolve(); idleResolve = null; }
    }

    return {
      enqueue(fn: TaskFn): void {
        pending.push(fn);
        if (!running) {
          idlePromise = new Promise<void>(r => { idleResolve = r; });
          void pump();
        }
      },
      waitIdle(): Promise<void> {
        return (pending.length === 0 && !running) ? Promise.resolve() : idlePromise;
      },
      get errors() { return errors; },
    };
  }

  const docsQueue = createSerialQueue('Doc');
  const codeQueue = createSerialQueue('Code');
  const fileQueue = createSerialQueue('File index');

  function enqueueDoc(fn: TaskFn): void { docsQueue.enqueue(fn); }
  function enqueueCode(fn: TaskFn): void { codeQueue.enqueue(fn); }
  function enqueueFile(fn: TaskFn): void { fileQueue.enqueue(fn); }

  // ---------------------------------------------------------------------------
  // Pending cross-file edges — collected during indexing, resolved in drain()
  // ---------------------------------------------------------------------------

  /** Doc cross-file links: fromFileId → toFileId (from wiki-links in markdown) */
  const pendingDocLinks: Array<{ fromFileId: string; toFileId: string }> = [];

  /** Code cross-file imports: file A imports file B */
  const pendingCodeImports: Array<{ fromFileId: string; toFileId: string }> = [];

  /** Code extends/implements: class A extends/implements class B (by name) */
  const pendingCodeEdges: Array<{ fromName: string; toName: string; kind: string }> = [];

  // ---------------------------------------------------------------------------
  // Per-file indexing
  // ---------------------------------------------------------------------------

  async function indexDocFile(absolutePath: string): Promise<void> {
    if (!docsStore) return;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      // File disappeared — remove stale node from store if present
      const fileId = path.relative(config.projectDir, absolutePath);
      docsStore.removeFile(fileId);
      return;
    }
    const mtime = stat.mtimeMs;
    const fileId = path.relative(config.projectDir, absolutePath);
    if (docsStore.getFileMtime(fileId) === mtime) return;
    if (config.maxFileSize && stat.size > config.maxFileSize) {
      log.warn({ fileId, sizeMB: (stat.size / 1024 / 1024).toFixed(1) }, 'skip doc (exceeds size limit)');
      return;
    }
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const chunks = await parseFile(content, absolutePath, config.projectDir, config.chunkDepth);

    // Batch-embed all chunks + file-level in one forward pass
    const batchInputs = chunks.map(c => ({ title: c.title, content: c.content }));
    const rootChunk = chunks.find(c => c.level === 1);
    const normalizedPath = normalizePathForEmbed(fileId);
    const embedText = rootChunk?.title
      ? `${normalizedPath} ${rootChunk.title}`
      : `${normalizedPath} ${rootChunk?.content.slice(0, INDEXER_PREVIEW_LEN) ?? ''}`;
    batchInputs.push({ title: embedText, content: '' });
    const embeddings = await embedBatch(batchInputs, config.docsModelName);

    // Build embeddings map for Store: fileId → file embedding, `fileId#i` → chunk embedding
    const embeddingMap = new Map<string, number[]>();
    embeddingMap.set(fileId, embeddings[chunks.length]); // file-level embedding
    for (let i = 0; i < chunks.length; i++) {
      embeddingMap.set(`${fileId}#${i}`, embeddings[i]);
    }

    // Convert Chunk[] to Store format
    const storeChunks = chunks.map((c: Chunk) => ({
      fileId,
      title: c.title,
      content: c.content,
      level: c.level,
      language: c.language,
      symbols: c.symbols,
      mtime,
    }));

    docsStore.updateFile(fileId, storeChunks, mtime, embeddingMap);

    // Collect cross-file links for deferred resolution
    for (const chunk of chunks) {
      for (const targetFileId of chunk.links) {
        if (targetFileId !== fileId) {
          pendingDocLinks.push({ fromFileId: fileId, toFileId: targetFileId });
        }
      }
    }

    log.info({ fileId, chunks: chunks.length }, 'indexed doc');
  }

  async function indexCodeFile(absolutePath: string): Promise<void> {
    if (!codeStore) return;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      const fileId = path.relative(config.projectDir, absolutePath);
      codeStore.removeFile(fileId);
      return;
    }
    const mtime = stat.mtimeMs;
    const fileId = path.relative(config.projectDir, absolutePath);
    if (codeStore.getFileMtime(fileId) === mtime) return;
    if (config.maxFileSize && stat.size > config.maxFileSize) {
      log.warn({ fileId, sizeMB: (stat.size / 1024 / 1024).toFixed(1) }, 'skip code (exceeds size limit)');
      return;
    }
    const parsed = await parseCodeFile(absolutePath, config.projectDir, mtime);

    // Batch-embed all symbols + file-level in one forward pass
    const batchInputs = parsed.nodes.map(({ attrs }) => ({
      title: attrs.signature,
      content: attrs.kind !== 'file'
        ? [attrs.docComment, attrs.body].filter(Boolean).join('\n')
        : attrs.docComment,
    }));
    // File-level embedding: path + exported symbol names + import summary
    const fileNode = parsed.nodes.find(n => n.attrs.kind === 'file');
    const exportedNames = parsed.nodes
      .filter(n => n.attrs.isExported && n.attrs.kind !== 'file')
      .map(n => n.attrs.name);
    const normalizedCodePath = normalizePathForEmbed(fileId);
    const fileEmbedTitle = exportedNames.length > 0
      ? `${normalizedCodePath} ${exportedNames.join(' ')}`
      : normalizedCodePath;
    const fileEmbedContent = fileNode?.attrs.body ?? '';
    batchInputs.push({ title: fileEmbedTitle, content: fileEmbedContent });
    const embeddings = await embedBatch(batchInputs, config.codeModelName);

    // Build embeddings map for Store: node name → embedding, fileId → file embedding
    const embeddingMap = new Map<string, number[]>();
    embeddingMap.set(fileId, embeddings[parsed.nodes.length]); // file-level embedding
    for (let i = 0; i < parsed.nodes.length; i++) {
      embeddingMap.set(parsed.nodes[i].attrs.name, embeddings[i]);
    }

    // Convert parsed nodes to Store format (Omit<CodeNode, 'id'>)
    const lang = getLanguage(path.extname(fileId)) ?? '';
    const storeNodes: Omit<CodeNode, 'id'>[] = parsed.nodes.map(({ attrs }) => ({
      kind: attrs.kind,
      fileId,
      language: lang,
      name: attrs.name,
      signature: attrs.signature,
      docComment: attrs.docComment,
      body: attrs.body,
      startLine: attrs.startLine,
      endLine: attrs.endLine,
      isExported: attrs.isExported,
      mtime,
    }));

    // Separate intra-file edges from cross-file edges
    const nodeIds = new Set(parsed.nodes.map(n => n.id));
    const intraFileEdges: Array<{ fromName: string; toName: string; kind: string }> = [];
    for (const { from, to, attrs } of parsed.edges) {
      if (nodeIds.has(from) && nodeIds.has(to)) {
        // Both ends in the same file — intra-file edge
        // Use names for Store (Store resolves names → ids internally)
        const fromNode = parsed.nodes.find(n => n.id === from);
        const toNode = parsed.nodes.find(n => n.id === to);
        if (fromNode && toNode) {
          intraFileEdges.push({ fromName: fromNode.attrs.name, toName: toNode.attrs.name, kind: attrs.kind });
        }
      } else {
        // Cross-file edge — collect for deferred resolution
        if (attrs.kind === 'imports') {
          pendingCodeImports.push({ fromFileId: fileId, toFileId: to });
        } else if (attrs.kind === 'extends' || attrs.kind === 'implements') {
          const fromNode = parsed.nodes.find(n => n.id === from);
          const toName = to.split('::').pop()!;
          if (fromNode) {
            pendingCodeEdges.push({ fromName: fromNode.attrs.name, toName, kind: attrs.kind });
          }
        }
      }
    }

    codeStore.updateFile(fileId, storeNodes, intraFileEdges, mtime, embeddingMap);

    log.info({ fileId, symbols: parsed.nodes.length }, 'indexed code');
  }

  async function indexFileEntry(absolutePath: string): Promise<void> {
    if (!filesStore) return;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      const filePath = path.relative(config.projectDir, absolutePath);
      filesStore.removeFile(filePath);
      return;
    }
    const mtime = stat.mtimeMs;
    const filePath = path.relative(config.projectDir, absolutePath);
    if (filesStore.getFileMtime(filePath) === mtime) return;
    const embedding = await embed(normalizePathForEmbed(filePath), '', config.filesModelName);
    const ext = path.extname(filePath);
    filesStore.updateFile(filePath, stat.size, mtime, embedding, {
      language: getLanguage(ext),
      mimeType: getMimeType(ext),
    });
  }

  // ---------------------------------------------------------------------------
  // Dispatch: match a file against both patterns, enqueue as needed
  // ---------------------------------------------------------------------------

  // Pre-accumulated exclude arrays (already includes server + workspace + project + graph)
  const docsExclude  = config.docsExclude;
  const codeExclude  = config.codeExclude;
  const filesExclude = config.filesExclude;
  // Union for directory pruning during scan
  const allExcludePatterns = [...new Set([...docsExclude, ...codeExclude, ...filesExclude])];

  function isExcluded(rel: string, patterns: string[]): boolean {
    return patterns.length > 0 && micromatch.isMatch(rel, patterns);
  }

  // Phase filter — set before scan(), checked in dispatch.
  // undefined = all queues (watcher mode / legacy).
  let currentPhase: IndexPhase | undefined;

  function dispatchAdd(absolutePath: string): void {
    const rel = path.relative(config.projectDir, absolutePath);
    if ((!currentPhase || currentPhase === 'docs') && docsStore && config.docsInclude && !isExcluded(rel, docsExclude) && micromatch.isMatch(rel, config.docsInclude)) {
      if (rel.endsWith('.md')) clearWikiIndexCache(config.projectDir);
      enqueueDoc(() => indexDocFile(absolutePath));
    }
    if ((!currentPhase || currentPhase === 'code') && codeStore && config.codeInclude && !isExcluded(rel, codeExclude) && micromatch.isMatch(rel, config.codeInclude)) {
      enqueueCode(() => indexCodeFile(absolutePath));
    }
    if ((!currentPhase || currentPhase === 'files') && filesStore && !isExcluded(rel, filesExclude)) {
      enqueueFile(() => indexFileEntry(absolutePath));
    }
  }

  function dispatchRemove(absolutePath: string): void {
    const rel = path.relative(config.projectDir, absolutePath);
    if ((!currentPhase || currentPhase === 'docs') && docsStore && config.docsInclude && !isExcluded(rel, docsExclude) && micromatch.isMatch(rel, config.docsInclude)) {
      if (rel.endsWith('.md')) clearWikiIndexCache(config.projectDir);
      enqueueDoc(async () => {
        docsStore.removeFile(rel);
        log.info({ fileId: rel }, 'removed doc');
      });
    }
    if ((!currentPhase || currentPhase === 'code') && codeStore && config.codeInclude && !isExcluded(rel, codeExclude) && micromatch.isMatch(rel, config.codeInclude)) {
      enqueueCode(async () => {
        codeStore.removeFile(rel);
        log.info({ fileId: rel }, 'removed code');
      });
    }
    if ((!currentPhase || currentPhase === 'files') && filesStore && !isExcluded(rel, filesExclude)) {
      enqueueFile(async () => {
        filesStore.removeFile(rel);
        log.info({ fileId: rel }, 'removed file');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function scan(phase?: IndexPhase): void {
    currentPhase = phase;
    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || ALWAYS_IGNORED.has(entry.name)) continue;
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const relDir = path.relative(config.projectDir, full);
          // prune directory if ALL graphs would exclude it
          if (allExcludePatterns.length > 0 && (
            micromatch.isMatch(relDir, allExcludePatterns) ||
            micromatch.isMatch(relDir + '/x', allExcludePatterns)
          )) continue;
          walk(full);
        } else if (entry.isFile()) {
          dispatchAdd(full);
        }
      }
    }
    walk(config.projectDir);
    currentPhase = undefined; // reset for watcher
  }

  function watch(): WatcherHandle {
    return startWatcher(
      config.projectDir,
      {
        onAdd:    (f) => dispatchAdd(f),
        onChange: (f) => dispatchAdd(f),
        onUnlink: (f) => dispatchRemove(f),
      },
      '**/*',
      allExcludePatterns.length > 0 ? allExcludePatterns : undefined,
    );
  }

  async function drain(phase?: IndexPhase): Promise<void> {
    if (phase) {
      // Wait for a single queue — no finalize
      if (phase === 'docs') await docsQueue.waitIdle();
      else if (phase === 'code') await codeQueue.waitIdle();
      else if (phase === 'files') await fileQueue.waitIdle();
      return;
    }

    // No phase = wait all + finalize (legacy / after all phases)
    await Promise.all([docsQueue.waitIdle(), codeQueue.waitIdle(), fileQueue.waitIdle()]);

    // Resolve cross-file edges that were deferred during indexing
    if (docsStore && pendingDocLinks.length > 0) {
      docsStore.resolveLinks(pendingDocLinks);
      log.info({ count: pendingDocLinks.length }, 'Resolved deferred doc cross-file links');
      pendingDocLinks.length = 0;
    }

    if (codeStore) {
      // Resolve import edges (file → file)
      if (pendingCodeImports.length > 0) {
        codeStore.resolveImports(pendingCodeImports);
        log.info({ count: pendingCodeImports.length }, 'Resolved deferred code import edges');
        pendingCodeImports.length = 0;
      }

      // Resolve extends/implements edges (by class/interface name)
      if (pendingCodeEdges.length > 0) {
        codeStore.resolveEdges(pendingCodeEdges);
        log.info({ count: pendingCodeEdges.length }, 'Resolved deferred code extends/implements edges');
        pendingCodeEdges.length = 0;
      }
    }

    const totalErrors = docsQueue.errors + codeQueue.errors + fileQueue.errors;
    if (totalErrors > 0) {
      log.warn({ totalErrors, docsErrors: docsQueue.errors, codeErrors: codeQueue.errors, filesErrors: fileQueue.errors }, 'Completed with errors');
    }
  }

  return { scan, watch, drain };
}
