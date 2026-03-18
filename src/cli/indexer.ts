import fs from 'fs';
import path from 'path';
import micromatch from 'micromatch';
import { embed, embedBatch } from '@/lib/embedder';
import { parseFile } from '@/lib/parsers/docs';
import { updateFile, removeFile, getFileMtime, type DocGraph } from '@/graphs/docs';
import { parseCodeFile } from '@/lib/parsers/code';
import { updateCodeFile, removeCodeFile, getCodeFileMtime, type CodeGraph } from '@/graphs/code';
import { startWatcher, type WatcherHandle } from '@/lib/watcher';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import { cleanupProxies as cleanupKnowledgeProxies } from '@/graphs/knowledge';
import type { TaskGraph } from '@/graphs/task-types';
import { cleanupProxies as cleanupTaskProxies } from '@/graphs/task';
import type { SkillGraph } from '@/graphs/skill-types';
import { cleanupProxies as cleanupSkillProxies } from '@/graphs/skill';
import type { FileIndexGraph } from '@/graphs/file-index-types';
import { updateFileEntry, removeFileEntry, getFileEntryMtime, rebuildDirectoryStats } from '@/graphs/file-index';

export interface ProjectIndexerConfig {
  projectDir: string;
  docsPattern?: string;
  codePattern?: string;
  docsExcludePattern?: string;
  codeExcludePattern?: string;
  filesExcludePattern?: string;
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
  let docsQueue: Promise<void> = Promise.resolve();
  let codeQueue: Promise<void> = Promise.resolve();
  let fileQueue: Promise<void> = Promise.resolve();

  // Error tracking
  let docErrors = 0;
  let codeErrors = 0;
  let fileErrors = 0;

  function enqueueDoc(fn: () => Promise<void>): void {
    docsQueue = docsQueue.then(fn).catch((err: unknown) => {
      docErrors++;
      process.stderr.write(`[indexer] Doc error: ${err}\n`);
    });
  }

  function enqueueCode(fn: () => Promise<void>): void {
    codeQueue = codeQueue.then(fn).catch((err: unknown) => {
      codeErrors++;
      process.stderr.write(`[indexer] Code error: ${err}\n`);
    });
  }

  function enqueueFile(fn: () => Promise<void>): void {
    fileQueue = fileQueue.then(fn).catch((err: unknown) => {
      fileErrors++;
      process.stderr.write(`[indexer] File index error: ${err}\n`);
    });
  }

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
        if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'docs', docGraph);
        if (taskGraph) cleanupTaskProxies(taskGraph, 'docs', docGraph);
        if (skillGraph) cleanupSkillProxies(skillGraph, 'docs', docGraph);
      }
      return;
    }
    const mtime = stat.mtimeMs;
    const fileId = path.relative(config.projectDir, absolutePath);
    if (getFileMtime(docGraph, fileId) === mtime) return;
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const chunks = parseFile(content, absolutePath, config.projectDir, config.chunkDepth);
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
        if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'code', codeGraph);
        if (taskGraph) cleanupTaskProxies(taskGraph, 'code', codeGraph);
        if (skillGraph) cleanupSkillProxies(skillGraph, 'code', codeGraph);
      }
      return;
    }
    const mtime = stat.mtimeMs;
    const fileId = path.relative(config.projectDir, absolutePath);
    if (getCodeFileMtime(codeGraph, fileId) === mtime) return;
    const parsed = parseCodeFile(absolutePath, config.projectDir, mtime);
    // Batch-embed all symbols + file-level in one forward pass
    const batchInputs = parsed.nodes.map(({ attrs }) => ({ title: attrs.signature, content: attrs.docComment }));
    batchInputs.push({ title: fileId, content: '' });
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
        if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'files', fileIndexGraph);
        if (taskGraph) cleanupTaskProxies(taskGraph, 'files', fileIndexGraph);
        if (skillGraph) cleanupSkillProxies(skillGraph, 'files', fileIndexGraph);
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

  // Per-graph exclude patterns
  function parseExclude(pat?: string): string[] {
    return pat ? pat.split(',').map(p => p.trim()).filter(Boolean) : [];
  }
  const docsExcludePatterns  = parseExclude(config.docsExcludePattern);
  const codeExcludePatterns  = parseExclude(config.codeExcludePattern);
  const filesExcludePatterns = parseExclude(config.filesExcludePattern);
  // Union of all exclude patterns for directory pruning during scan
  const allExcludePatterns = [...new Set([...docsExcludePatterns, ...codeExcludePatterns, ...filesExcludePatterns])];

  function isDocsExcluded(rel: string): boolean {
    return docsExcludePatterns.length > 0 && micromatch.isMatch(rel, docsExcludePatterns);
  }
  function isCodeExcluded(rel: string): boolean {
    return codeExcludePatterns.length > 0 && micromatch.isMatch(rel, codeExcludePatterns);
  }
  function isFilesExcluded(rel: string): boolean {
    return filesExcludePatterns.length > 0 && micromatch.isMatch(rel, filesExcludePatterns);
  }

  function dispatchAdd(absolutePath: string): void {
    const rel = path.relative(config.projectDir, absolutePath);
    if (config.docsPattern && !isDocsExcluded(rel) && micromatch.isMatch(rel, config.docsPattern)) {
      enqueueDoc(() => indexDocFile(absolutePath));
    }
    if (codeGraph && config.codePattern && !isCodeExcluded(rel) && micromatch.isMatch(rel, config.codePattern)) {
      enqueueCode(() => indexCodeFile(absolutePath));
    }
    if (fileIndexGraph && !isFilesExcluded(rel)) {
      enqueueFile(() => indexFileEntry(absolutePath));
    }
  }

  function dispatchRemove(absolutePath: string): void {
    const rel = path.relative(config.projectDir, absolutePath);
    if (docGraph && config.docsPattern && !isDocsExcluded(rel) && micromatch.isMatch(rel, config.docsPattern)) {
      removeFile(docGraph, rel);
      if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'docs', docGraph);
      if (taskGraph) cleanupTaskProxies(taskGraph, 'docs', docGraph);
      if (skillGraph) cleanupSkillProxies(skillGraph, 'docs', docGraph);
      process.stderr.write(`[indexer] removed doc  ${rel}\n`);
    }
    if (codeGraph && config.codePattern && !isCodeExcluded(rel) && micromatch.isMatch(rel, config.codePattern)) {
      removeCodeFile(codeGraph, rel);
      if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'code', codeGraph);
      if (taskGraph) cleanupTaskProxies(taskGraph, 'code', codeGraph);
      if (skillGraph) cleanupSkillProxies(skillGraph, 'code', codeGraph);
      process.stderr.write(`[indexer] removed code ${rel}\n`);
    }
    if (fileIndexGraph && !isFilesExcluded(rel)) {
      removeFileEntry(fileIndexGraph, rel);
      if (knowledgeGraph) cleanupKnowledgeProxies(knowledgeGraph, 'files', fileIndexGraph);
      if (taskGraph) cleanupTaskProxies(taskGraph, 'files', fileIndexGraph);
      if (skillGraph) cleanupSkillProxies(skillGraph, 'files', fileIndexGraph);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function scan(): void {
    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
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
    await Promise.all([docsQueue, codeQueue, fileQueue]);
    if (fileIndexGraph) rebuildDirectoryStats(fileIndexGraph);
    const totalErrors = docErrors + codeErrors + fileErrors;
    if (totalErrors > 0) {
      process.stderr.write(`[indexer] Completed with ${totalErrors} error(s): docs=${docErrors}, code=${codeErrors}, files=${fileErrors}\n`);
    }
  }

  return { scan, watch, drain };
}
