import fs from 'fs';
import path from 'path';
import micromatch from 'micromatch';
import { embed, embedBatch } from '@/lib/embedder';
import { parseFile, clearWikiIndexCache } from '@/lib/parsers/docs';
import { updateFile, removeFile, getFileMtime, resolvePendingLinks, type DocGraph } from '@/graphs/docs';
import { parseCodeFile } from '@/lib/parsers/code';
import { updateCodeFile, removeCodeFile, getCodeFileMtime, resolvePendingImports, resolvePendingEdges, type CodeGraph } from '@/graphs/code';
import { startWatcher, ALWAYS_IGNORED, type WatcherHandle } from '@/lib/watcher';
import { INDEXER_PREVIEW_LEN } from '@/lib/defaults';
import { normalizePathForEmbed } from '@/lib/path-utils';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import { cleanupProxies as cleanupKnowledgeProxies } from '@/graphs/knowledge';
import type { TaskGraph } from '@/graphs/task-types';
import { cleanupProxies as cleanupTaskProxies } from '@/graphs/task';
import type { SkillGraph } from '@/graphs/skill-types';
import { cleanupProxies as cleanupSkillProxies } from '@/graphs/skill';
import type { FileIndexGraph } from '@/graphs/file-index-types';
import { updateFileEntry, removeFileEntry, getFileEntryMtime, rebuildDirectoryStats } from '@/graphs/file-index';
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
  docGraph: DocGraph | undefined,
  codeGraph: CodeGraph | undefined,
  config: ProjectIndexerConfig,
  knowledgeGraph?: KnowledgeGraph,
  fileIndexGraph?: FileIndexGraph,
  taskGraph?: TaskGraph,
  skillGraph?: SkillGraph,
): ProjectIndexer {
  // Three independent serial queues — docs, code, and file index.
  // Array-based to avoid promise chain memory accumulation during scan.

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
  // Per-file indexing
  // ---------------------------------------------------------------------------

  async function indexDocFile(absolutePath: string): Promise<void> {
    if (!docGraph) return;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      // File disappeared — remove stale node from graph if present
      const fileId = path.relative(config.projectDir, absolutePath);
      if (docGraph.hasNode(fileId)) {
        removeFile(docGraph, fileId);
        if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'docs', docGraph, config.projectId);
        if (taskGraph) cleanupTaskProxies(taskGraph, 'docs', docGraph, config.projectId);
        if (skillGraph) cleanupSkillProxies(skillGraph, 'docs', docGraph, config.projectId);
      }
      return;
    }
    const mtime = stat.mtimeMs;
    const fileId = path.relative(config.projectDir, absolutePath);
    if (getFileMtime(docGraph, fileId) === mtime) return;
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
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].embedding = embeddings[i];
    }
    updateFile(docGraph, chunks, mtime);
    if (rootChunk && docGraph.hasNode(rootChunk.id)) {
      docGraph.setNodeAttribute(rootChunk.id, 'fileEmbedding', embeddings[chunks.length]);
    }
    log.info({ fileId, chunks: chunks.length }, 'indexed doc');
  }

  async function indexCodeFile(absolutePath: string): Promise<void> {
    if (!codeGraph) return;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      const fileId = path.relative(config.projectDir, absolutePath);
      if (codeGraph.hasNode(fileId)) {
        removeCodeFile(codeGraph, fileId);
        if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'code', codeGraph, config.projectId);
        if (taskGraph) cleanupTaskProxies(taskGraph, 'code', codeGraph, config.projectId);
        if (skillGraph) cleanupSkillProxies(skillGraph, 'code', codeGraph, config.projectId);
      }
      return;
    }
    const mtime = stat.mtimeMs;
    const fileId = path.relative(config.projectDir, absolutePath);
    if (getCodeFileMtime(codeGraph, fileId) === mtime) return;
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
    const fileEmbedContent = fileNode?.attrs.body ?? ''; // body = importSummary for file nodes
    batchInputs.push({ title: fileEmbedTitle, content: fileEmbedContent });
    const embeddings = await embedBatch(batchInputs, config.codeModelName);
    for (let i = 0; i < parsed.nodes.length; i++) {
      parsed.nodes[i].attrs.embedding = embeddings[i];
    }
    updateCodeFile(codeGraph, parsed);
    if (codeGraph.hasNode(fileId)) {
      codeGraph.setNodeAttribute(fileId, 'fileEmbedding', embeddings[parsed.nodes.length]);
    }
    log.info({ fileId, symbols: parsed.nodes.length }, 'indexed code');
  }

  async function indexFileEntry(absolutePath: string): Promise<void> {
    if (!fileIndexGraph) return;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      const filePath = path.relative(config.projectDir, absolutePath);
      if (fileIndexGraph.hasNode(filePath)) {
        removeFileEntry(fileIndexGraph, filePath);
        if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'files', fileIndexGraph, config.projectId);
        if (taskGraph) cleanupTaskProxies(taskGraph, 'files', fileIndexGraph, config.projectId);
        if (skillGraph) cleanupSkillProxies(skillGraph, 'files', fileIndexGraph, config.projectId);
      }
      return;
    }
    const mtime = stat.mtimeMs;
    const filePath = path.relative(config.projectDir, absolutePath);
    if (getFileEntryMtime(fileIndexGraph, filePath) === mtime) return;
    const embedding = await embed(normalizePathForEmbed(filePath), '', config.filesModelName);
    updateFileEntry(fileIndexGraph, filePath, stat.size, mtime, embedding);
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
    if ((!currentPhase || currentPhase === 'docs') && docGraph && config.docsInclude && !isExcluded(rel, docsExclude) && micromatch.isMatch(rel, config.docsInclude)) {
      if (rel.endsWith('.md')) clearWikiIndexCache(config.projectDir);
      enqueueDoc(() => indexDocFile(absolutePath));
    }
    if ((!currentPhase || currentPhase === 'code') && codeGraph && config.codeInclude && !isExcluded(rel, codeExclude) && micromatch.isMatch(rel, config.codeInclude)) {
      enqueueCode(() => indexCodeFile(absolutePath));
    }
    if ((!currentPhase || currentPhase === 'files') && fileIndexGraph && !isExcluded(rel, filesExclude)) {
      enqueueFile(() => indexFileEntry(absolutePath));
    }
  }

  function dispatchRemove(absolutePath: string): void {
    const rel = path.relative(config.projectDir, absolutePath);
    if ((!currentPhase || currentPhase === 'docs') && docGraph && config.docsInclude && !isExcluded(rel, docsExclude) && micromatch.isMatch(rel, config.docsInclude)) {
      if (rel.endsWith('.md')) clearWikiIndexCache(config.projectDir);
      // Enqueue removal to avoid racing with in-flight indexDocFile tasks
      enqueueDoc(async () => {
        removeFile(docGraph, rel);
        if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'docs', docGraph, config.projectId);
        if (taskGraph) cleanupTaskProxies(taskGraph, 'docs', docGraph, config.projectId);
        if (skillGraph) cleanupSkillProxies(skillGraph, 'docs', docGraph, config.projectId);
        log.info({ fileId: rel }, 'removed doc');
      });
    }
    if ((!currentPhase || currentPhase === 'code') && codeGraph && config.codeInclude && !isExcluded(rel, codeExclude) && micromatch.isMatch(rel, config.codeInclude)) {
      enqueueCode(async () => {
        removeCodeFile(codeGraph, rel);
        if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'code', codeGraph, config.projectId);
        if (taskGraph) cleanupTaskProxies(taskGraph, 'code', codeGraph, config.projectId);
        if (skillGraph) cleanupSkillProxies(skillGraph, 'code', codeGraph, config.projectId);
        log.info({ fileId: rel }, 'removed code');
      });
    }
    if ((!currentPhase || currentPhase === 'files') && fileIndexGraph && !isExcluded(rel, filesExclude)) {
      enqueueFile(async () => {
        removeFileEntry(fileIndexGraph, rel);
        if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'files', fileIndexGraph, config.projectId);
        if (taskGraph) cleanupTaskProxies(taskGraph, 'files', fileIndexGraph, config.projectId);
        if (skillGraph) cleanupSkillProxies(skillGraph, 'files', fileIndexGraph, config.projectId);
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
    if (fileIndexGraph) rebuildDirectoryStats(fileIndexGraph);

    // Resolve cross-file edges that were deferred during indexing
    if (docGraph) {
      const docLinks = resolvePendingLinks(docGraph);
      if (docLinks > 0) log.info({ count: docLinks }, 'Resolved deferred doc cross-file links');
      // Clean up any remaining unresolved pending links so they don't persist to disk
      let docOrphans = 0;
      docGraph.forEachNode((nid, nattrs) => {
        if ((nattrs as any).pendingLinks) {
          docGraph.setNodeAttribute(nid, 'pendingLinks', undefined);
          docOrphans++;
        }
      });
      if (docOrphans > 0) log.debug({ count: docOrphans }, 'Cleared unresolvable doc pending links');
    }
    if (codeGraph) {
      const codeImports = resolvePendingImports(codeGraph);
      if (codeImports > 0) log.info({ count: codeImports }, 'Resolved deferred code import edges');
      const codeEdges = resolvePendingEdges(codeGraph);
      if (codeEdges > 0) log.info({ count: codeEdges }, 'Resolved deferred code extends/implements edges');
      // Clean up any remaining unresolved pending edges/imports
      let codeOrphans = 0;
      codeGraph.forEachNode((nid, nattrs) => {
        if ((nattrs as any).pendingEdges) {
          codeGraph.setNodeAttribute(nid, 'pendingEdges', undefined);
          codeOrphans++;
        }
        if ((nattrs as any).pendingImports) {
          codeGraph.setNodeAttribute(nid, 'pendingImports', undefined);
          codeOrphans++;
        }
      });
      if (codeOrphans > 0) log.debug({ count: codeOrphans }, 'Cleared unresolvable code pending edges');
    }

    const totalErrors = docsQueue.errors + codeQueue.errors + fileQueue.errors;
    if (totalErrors > 0) {
      log.warn({ totalErrors, docsErrors: docsQueue.errors, codeErrors: codeQueue.errors, filesErrors: fileQueue.errors }, 'Completed with errors');
    }
  }

  return { scan, watch, drain };
}
