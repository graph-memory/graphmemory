import fs from 'fs';
import path from 'path';
import micromatch from 'micromatch';
import { embed, embedBatch } from '@/lib/embedder';
import { parseFile } from '@/lib/parsers/docs';
import { updateFile, removeFile, getFileMtime, resolvePendingLinks, type DocGraph } from '@/graphs/docs';
import { parseCodeFile } from '@/lib/parsers/code';
import { updateCodeFile, removeCodeFile, getCodeFileMtime, resolvePendingImports, resolvePendingEdges, type CodeGraph } from '@/graphs/code';
import { startWatcher, ALWAYS_IGNORED, type WatcherHandle } from '@/lib/watcher';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import { cleanupProxies as cleanupKnowledgeProxies } from '@/graphs/knowledge';
import type { TaskGraph } from '@/graphs/task-types';
import { cleanupProxies as cleanupTaskProxies } from '@/graphs/task';
import type { SkillGraph } from '@/graphs/skill-types';
import { cleanupProxies as cleanupSkillProxies } from '@/graphs/skill';
import type { FileIndexGraph } from '@/graphs/file-index-types';
import { updateFileEntry, removeFileEntry, getFileEntryMtime, rebuildDirectoryStats } from '@/graphs/file-index';

export interface ProjectIndexerConfig {
  projectId?: string;
  projectDir: string;
  maxFileSize?: number;
  docsInclude?: string;
  docsExclude: string[];
  codeInclude?: string;
  codeExclude: string[];
  filesExclude: string[];
  chunkDepth: number;
  docsModelName?: string;
  codeModelName?: string;
  filesModelName?: string;
}

export interface ProjectIndexer {
  /** Walk projectDir once, dispatch each file to the matching queue. */
  scan(): void;
  /** Start a single chokidar watcher; dispatch add/change/unlink by pattern. */
  watch(): WatcherHandle;
  /** Resolves when both docs and code queues are empty. */
  drain(): Promise<void>;
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
          process.stderr.write(`[indexer] ${label} error: ${err}\n`);
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
      process.stderr.write(`[indexer] skip doc  ${fileId} (${(stat.size / 1024 / 1024).toFixed(1)} MB exceeds limit)\n`);
      return;
    }
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const chunks = await parseFile(content, absolutePath, config.projectDir, config.chunkDepth);
    // Batch-embed all chunks + file-level in one forward pass
    const batchInputs = chunks.map(c => ({ title: c.title, content: c.content }));
    const rootChunk = chunks.find(c => c.level === 1);
    const embedText = rootChunk?.title
      ? `${fileId} ${rootChunk.title}`
      : `${fileId} ${rootChunk?.content.slice(0, 200) ?? ''}`;
    batchInputs.push({ title: embedText, content: '' });
    const embeddings = await embedBatch(batchInputs, config.docsModelName);
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].embedding = embeddings[i];
    }
    updateFile(docGraph, chunks, mtime);
    if (rootChunk && docGraph.hasNode(rootChunk.id)) {
      docGraph.setNodeAttribute(rootChunk.id, 'fileEmbedding', embeddings[chunks.length]);
    }
    process.stderr.write(`[indexer] doc  ${fileId} (${chunks.length} chunks)\n`);
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
      process.stderr.write(`[indexer] skip code ${fileId} (${(stat.size / 1024 / 1024).toFixed(1)} MB exceeds limit)\n`);
      return;
    }
    const parsed = await parseCodeFile(absolutePath, config.projectDir, mtime);
    // Batch-embed all symbols + file-level in one forward pass
    const batchInputs = parsed.nodes.map(({ attrs }) => ({ title: attrs.signature, content: attrs.docComment }));
    // File-level embedding: path + exported symbol names + import summary
    const fileNode = parsed.nodes.find(n => n.attrs.kind === 'file');
    const exportedNames = parsed.nodes
      .filter(n => n.attrs.isExported && n.attrs.kind !== 'file')
      .map(n => n.attrs.name);
    const fileEmbedTitle = exportedNames.length > 0
      ? `${fileId} ${exportedNames.join(' ')}`
      : fileId;
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
    process.stderr.write(`[indexer] code ${fileId} (${parsed.nodes.length} symbols)\n`);
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
    const embedding = await embed(filePath, '', config.filesModelName);
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

  function dispatchAdd(absolutePath: string): void {
    const rel = path.relative(config.projectDir, absolutePath);
    if (config.docsInclude && !isExcluded(rel, docsExclude) && micromatch.isMatch(rel, config.docsInclude)) {
      enqueueDoc(() => indexDocFile(absolutePath));
    }
    if (codeGraph && config.codeInclude && !isExcluded(rel, codeExclude) && micromatch.isMatch(rel, config.codeInclude)) {
      enqueueCode(() => indexCodeFile(absolutePath));
    }
    if (fileIndexGraph && !isExcluded(rel, filesExclude)) {
      enqueueFile(() => indexFileEntry(absolutePath));
    }
  }

  function dispatchRemove(absolutePath: string): void {
    const rel = path.relative(config.projectDir, absolutePath);
    if (docGraph && config.docsInclude && !isExcluded(rel, docsExclude) && micromatch.isMatch(rel, config.docsInclude)) {
      removeFile(docGraph, rel);
      if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'docs', docGraph, config.projectId);
      if (taskGraph) cleanupTaskProxies(taskGraph, 'docs', docGraph, config.projectId);
      if (skillGraph) cleanupSkillProxies(skillGraph, 'docs', docGraph, config.projectId);
      process.stderr.write(`[indexer] removed doc  ${rel}\n`);
    }
    if (codeGraph && config.codeInclude && !isExcluded(rel, codeExclude) && micromatch.isMatch(rel, config.codeInclude)) {
      removeCodeFile(codeGraph, rel);
      if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'code', codeGraph, config.projectId);
      if (taskGraph) cleanupTaskProxies(taskGraph, 'code', codeGraph, config.projectId);
      if (skillGraph) cleanupSkillProxies(skillGraph, 'code', codeGraph, config.projectId);
      process.stderr.write(`[indexer] removed code ${rel}\n`);
    }
    if (fileIndexGraph && !isExcluded(rel, filesExclude)) {
      removeFileEntry(fileIndexGraph, rel);
      if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'files', fileIndexGraph, config.projectId);
      if (taskGraph) cleanupTaskProxies(taskGraph, 'files', fileIndexGraph, config.projectId);
      if (skillGraph) cleanupSkillProxies(skillGraph, 'files', fileIndexGraph, config.projectId);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function scan(): void {
    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || ALWAYS_IGNORED.has(entry.name)) continue;
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

  async function drain(): Promise<void> {
    await Promise.all([docsQueue.waitIdle(), codeQueue.waitIdle(), fileQueue.waitIdle()]);
    if (fileIndexGraph) rebuildDirectoryStats(fileIndexGraph);

    // Resolve cross-file edges that were deferred during indexing
    if (docGraph) {
      const docLinks = resolvePendingLinks(docGraph);
      if (docLinks > 0) process.stderr.write(`[indexer] Resolved ${docLinks} deferred doc cross-file link(s)\n`);
    }
    if (codeGraph) {
      const codeImports = resolvePendingImports(codeGraph);
      if (codeImports > 0) process.stderr.write(`[indexer] Resolved ${codeImports} deferred code import edge(s)\n`);
      const codeEdges = resolvePendingEdges(codeGraph);
      if (codeEdges > 0) process.stderr.write(`[indexer] Resolved ${codeEdges} deferred code extends/implements edge(s)\n`);
    }

    const totalErrors = docsQueue.errors + codeQueue.errors + fileQueue.errors;
    if (totalErrors > 0) {
      process.stderr.write(`[indexer] Completed with ${totalErrors} error(s): docs=${docsQueue.errors}, code=${codeQueue.errors}, files=${fileQueue.errors}\n`);
    }
  }

  return { scan, watch, drain };
}
