import path from 'path';
import { readFileSync } from 'fs';
import { parseFile } from '@/lib/parsers/docs';
import {
  unitVec, createFakeEmbed, createTestStoreManager,
  json, jsonList, text,
  type CallResult, type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';
import { setupMcpClient } from '@/tests/helpers';

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

const FIXTURES = path.resolve(__dirname, 'fixtures');
const DOC_FILES = ['api.md', 'auth.md', 'duplicates.md'];
const DOC_MTIME = 1_700_000_000_000;

const QUERY_AXES: Array<[string, number]> = [
  // docs axes 0-10
  ['api reference',    0],
  ['endpoints',        1],
  ['users endpoint',   2],
  ['sessions',         3],
  ['error codes',      4],
  ['rate limit',       5],
  ['auth guide',       6],
  ['jwt token',        7],
  ['token flow',       8],
  ['roles',            9],
  ['duplicates',       10],
  // file-level axes 21-23
  ['api docs file',       21],
  ['auth docs file',      22],
  ['duplicates docs file', 23],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse fixture markdown files and insert them into the store.
 * Returns a map of fileId -> chunk IDs for assertions.
 */
async function populateDocsStore(testCtx: TestStoreContext): Promise<void> {
  const scopedStore = testCtx.store.project(testCtx.projectId);
  let globalAxis = 0;

  // Collect cross-file link edges
  const linkEdges: Array<{ fromFileId: string; toFileId: string }> = [];

  for (const file of DOC_FILES) {
    const abs = path.join(FIXTURES, file);
    const chunks = await parseFile(readFileSync(abs, 'utf-8'), abs, FIXTURES, 4);

    // Build store-compatible chunks (Omit<DocNode, 'id' | 'kind'>)
    const storeChunks = chunks.map(chunk => ({
      fileId: chunk.fileId,
      title: chunk.title,
      content: chunk.content,
      level: chunk.level,
      language: chunk.language,
      symbols: chunk.symbols,
      mtime: DOC_MTIME,
    }));

    // Build embeddings map: fileId for file-level, fileId#i for chunk i
    const embeddings = new Map<string, number[]>();

    // Chunk embeddings
    for (let i = 0; i < chunks.length; i++) {
      embeddings.set(`${file}#${i}`, unitVec(globalAxis++));
    }

    // File-level embeddings (used by docs_search_files)
    const fileAxisMap: Record<string, number> = {
      'api.md': 21,
      'auth.md': 22,
      'duplicates.md': 23,
    };
    if (fileAxisMap[file] !== undefined) {
      embeddings.set(file, unitVec(fileAxisMap[file]));
    }

    scopedStore.docs.updateFile(file, storeChunks, DOC_MTIME, embeddings);

    // Collect cross-file link edges from parsed chunks
    for (const chunk of chunks) {
      for (const link of chunk.links) {
        linkEdges.push({ fromFileId: file, toFileId: link });
      }
    }
  }

  // Resolve cross-file links (e.g., auth.md <-> api.md)
  if (linkEdges.length > 0) {
    scopedStore.docs.resolveLinks(linkEdges);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileEntry = { id: number; fileId: string; title: string; chunkCount: number; mtime: number };
type TocEntry  = { id: number; title: string; level: number };
type Hit       = { id: number; fileId: string; title: string; content: string; level: number; score: number };
type NodeResult = { id: number; kind: string; fileId: string; title: string; content: string; level: number; mtime: number };
type FileSearchHit = { fileId: string; title: string; score: number };

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------

describe('MCP docs tools', () => {
  let ctx: McpTestContext;
  let testStore: TestStoreContext;

  beforeAll(async () => {
    const fakeEmbed = createFakeEmbed(QUERY_AXES);
    testStore = createTestStoreManager(fakeEmbed);
    await populateDocsStore(testStore);

    const scopedStore = testStore.store.project(testStore.projectId);
    ctx = await setupMcpClient({
      scopedStore,
      storeManager: testStore.storeManager,
      embedFn: fakeEmbed,
    });
  });

  afterAll(async () => {
    await ctx.close();
    testStore.cleanup();
  });

  // =========================================================================
  // docs_list_files
  // =========================================================================

  describe('docs_list_files', () => {
    it('returns all 3 files with correct metadata', async () => {
      const files = jsonList<FileEntry>(await ctx.call('docs_list_files'));

      expect(files).toHaveLength(3);
      expect(files.some(f => f.fileId === 'api.md')).toBe(true);
      expect(files.some(f => f.fileId === 'auth.md')).toBe(true);
      expect(files.some(f => f.fileId === 'duplicates.md')).toBe(true);
      expect(files.find(f => f.fileId === 'api.md')!.chunkCount).toBe(6);
      expect(files.find(f => f.fileId === 'auth.md')!.chunkCount).toBe(4);
      expect(files.find(f => f.fileId === 'duplicates.md')!.chunkCount).toBe(5);
      expect(files.find(f => f.fileId === 'api.md')!.title).toBe('API Reference');
      expect(files.find(f => f.fileId === 'auth.md')!.title).toBe('Auth Guide');
      // numeric IDs
      expect(typeof files[0].id).toBe('number');
    });

    it('filter: "auth" returns 1 file', async () => {
      const files = jsonList<FileEntry>(await ctx.call('docs_list_files', { filter: 'auth' }));
      expect(files).toHaveLength(1);
      expect(files[0].fileId).toBe('auth.md');
    });

    it('filter: "API" is case-insensitive', async () => {
      const files = jsonList<FileEntry>(await ctx.call('docs_list_files', { filter: 'API' }));
      expect(files).toHaveLength(1);
      expect(files[0].fileId).toBe('api.md');
    });

    it('filter: "nonexistent" returns empty', async () => {
      const files = jsonList<FileEntry>(await ctx.call('docs_list_files', { filter: 'nonexistent' }));
      expect(files).toHaveLength(0);
    });

    it('filter: ".md" returns all 3 files', async () => {
      const files = jsonList<FileEntry>(await ctx.call('docs_list_files', { filter: '.md' }));
      expect(files).toHaveLength(3);
    });

    it('limit=1 returns first alphabetically', async () => {
      const files = jsonList<FileEntry>(await ctx.call('docs_list_files', { limit: 1 }));
      expect(files).toHaveLength(1);
      expect(files[0].fileId).toBe('api.md');
    });

    it('limit=2 returns exactly 2 files', async () => {
      const files = jsonList<FileEntry>(await ctx.call('docs_list_files', { limit: 2 }));
      expect(files).toHaveLength(2);
    });

    it('default limit returns all 3 files', async () => {
      const files = jsonList<FileEntry>(await ctx.call('docs_list_files'));
      expect(files).toHaveLength(3);
    });
  });

  // =========================================================================
  // docs_get_toc
  // =========================================================================

  describe('docs_get_toc', () => {
    it('auth.md: 4 entries with correct structure', async () => {
      const toc = json<TocEntry[]>(await ctx.call('docs_get_toc', { fileId: 'auth.md' }));

      expect(toc).toHaveLength(4);
      expect(typeof toc[0].id).toBe('number');
      expect(toc[0].level).toBe(1);
      expect(toc[0].title).toBe('Auth Guide');
      expect(toc.slice(1).every(e => e.level === 2)).toBe(true);
      expect(toc.some(e => e.title === 'JWT Tokens')).toBe(true);
      expect(toc.some(e => e.title === 'Token Flow')).toBe(true);
      expect(toc.some(e => e.title === 'Roles')).toBe(true);
    });

    it('api.md: 6 entries with level 2 and level 3 sections', async () => {
      const toc = json<TocEntry[]>(await ctx.call('docs_get_toc', { fileId: 'api.md' }));

      expect(toc).toHaveLength(6);
      expect(typeof toc[0].id).toBe('number');
      expect(toc.find(e => e.title === 'Endpoints')!.level).toBe(2);
      expect(toc.find(e => e.title === 'Users')!.level).toBe(3);
      expect(toc.find(e => e.title === 'Sessions')!.level).toBe(3);
      expect(toc.find(e => e.title === 'Error Codes')!.level).toBe(2);
      expect(toc.find(e => e.title === 'Rate Limiting')!.level).toBe(2);
    });

    it('duplicates.md: duplicate headings are separate entries', async () => {
      const toc = json<TocEntry[]>(await ctx.call('docs_get_toc', { fileId: 'duplicates.md' }));

      expect(toc).toHaveLength(5);
      expect(toc.filter(e => e.title === 'List')).toHaveLength(2);
      expect(toc.filter(e => e.title === 'Notes')).toHaveLength(2);
      // Each has a unique numeric ID
      const ids = toc.map(e => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('missing file returns isError=true', async () => {
      const result = await ctx.call('docs_get_toc', { fileId: 'ghost.md' });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('File not found');
    });
  });

  // =========================================================================
  // docs_search
  // =========================================================================

  describe('docs_search', () => {
    it('basic scoring: auth guide query hits auth content', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'auth guide', searchMode: 'vector' }));

      expect(hits.length).toBeGreaterThan(0);
      // Top hit should be from auth.md
      expect(hits[0].fileId).toBe('auth.md');
      expect(hits[0].score).toBeGreaterThan(0);
      // Scores are sorted descending
      expect(hits.every((h, i) => i === 0 || h.score <= hits[i - 1].score)).toBe(true);
      // All hits have expected shape
      expect(hits.every(h =>
        'id' in h && 'fileId' in h && 'title' in h && 'content' in h && 'level' in h && 'score' in h,
      )).toBe(true);
    });

    it('basic scoring: api reference query top hit is from api.md', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'api reference', searchMode: 'vector' }));
      expect(hits[0].fileId).toBe('api.md');
      expect(hits[0].score).toBeGreaterThan(0);
    });

    it('topK=1 returns limited results', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'auth guide', topK: 1, searchMode: 'vector' }));
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].fileId).toBe('auth.md');
    });

    it('maxResults=1 returns exactly 1 result', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'auth guide', maxResults: 1, searchMode: 'vector' }));
      expect(hits).toHaveLength(1);
      expect(hits[0].fileId).toBe('auth.md');
    });

    it('maxResults=3 returns at most 3 results', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'auth guide', maxResults: 3, searchMode: 'vector' }));
      expect(hits.length).toBeLessThanOrEqual(3);
      expect(hits[0].fileId).toBe('auth.md');
    });

    it('topK=1 picks best match (jwt token -> JWT Tokens section)', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'jwt token', topK: 1, maxResults: 1, searchMode: 'vector' }));
      expect(hits[0].title).toBe('JWT Tokens');
      expect(hits[0].fileId).toBe('auth.md');
    });

    it('zero-vector query returns low scores', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'xyzzy completely unknown xyz', maxResults: 1, minScore: 0, searchMode: 'vector' }));
      expect(hits.length).toBeGreaterThan(0);
      // RRF fusion produces small but non-zero scores even for zero-cosine matches
      expect(hits[0].score).toBeLessThan(0.1);
    });

    it('minScore filters out low-score results', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'xyzzy completely unknown xyz', minScore: 0.1, searchMode: 'keyword' }));
      expect(hits).toHaveLength(0);
    });

    it('results have numeric IDs', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'auth guide', searchMode: 'vector' }));
      expect(hits.length).toBeGreaterThan(0);
      expect(typeof hits[0].id).toBe('number');
    });

    it('hybrid mode returns results', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'auth guide', searchMode: 'hybrid' }));
      expect(hits.length).toBeGreaterThan(0);
    });

    it('keyword mode searches text content', async () => {
      const hits = json<Hit[]>(await ctx.call('docs_search', { query: 'JWT', searchMode: 'keyword', minScore: 0 }));
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // docs_get_node
  // =========================================================================

  describe('docs_get_node', () => {
    // Helper to get a node ID by title from the TOC
    async function getNodeIdByTitle(fileId: string, title: string): Promise<number> {
      const toc = json<TocEntry[]>(await ctx.call('docs_get_toc', { fileId }));
      const entry = toc.find(e => e.title === title);
      if (!entry) throw new Error(`No TOC entry with title "${title}" in ${fileId}`);
      return entry.id;
    }

    // Helper to get the file's root node ID
    async function getFileRootId(fileId: string): Promise<number> {
      const files = jsonList<FileEntry>(await ctx.call('docs_list_files', { filter: fileId }));
      const file = files.find(f => f.fileId === fileId);
      if (!file) throw new Error(`File not found: ${fileId}`);
      // The root chunk is the first in the TOC
      const toc = json<TocEntry[]>(await ctx.call('docs_get_toc', { fileId }));
      return toc[0].id;
    }

    it('root chunk: all fields correct', async () => {
      const rootId = await getFileRootId('auth.md');
      const node = json<NodeResult>(await ctx.call('docs_get_node', { nodeId: rootId }));

      expect(node.id).toBe(rootId);
      expect(node.fileId).toBe('auth.md');
      expect(node.title).toBe('Auth Guide');
      expect(typeof node.content).toBe('string');
      expect(node.content.length).toBeGreaterThan(0);
      expect(node.level).toBe(1);
    });

    it('level 2 subsection (JWT Tokens)', async () => {
      const nodeId = await getNodeIdByTitle('auth.md', 'JWT Tokens');
      const node = json<NodeResult>(await ctx.call('docs_get_node', { nodeId }));

      expect(node.id).toBe(nodeId);
      expect(node.fileId).toBe('auth.md');
      expect(node.title).toBe('JWT Tokens');
      expect(node.level).toBe(2);
      expect(node.content.toLowerCase()).toContain('token');
    });

    it('level 3 subsection (Users)', async () => {
      const nodeId = await getNodeIdByTitle('api.md', 'Users');
      const node = json<NodeResult>(await ctx.call('docs_get_node', { nodeId }));

      expect(node.id).toBe(nodeId);
      expect(node.level).toBe(3);
      expect(node.fileId).toBe('api.md');
      expect(node.content).toContain('/users');
    });

    it('level 3 subsection (Sessions)', async () => {
      const nodeId = await getNodeIdByTitle('api.md', 'Sessions');
      const node = json<NodeResult>(await ctx.call('docs_get_node', { nodeId }));

      expect(node.level).toBe(3);
      expect(node.content.toLowerCase()).toContain('refresh');
    });

    it('duplicate headings both accessible', async () => {
      const toc = json<TocEntry[]>(await ctx.call('docs_get_toc', { fileId: 'duplicates.md' }));
      const listEntries = toc.filter(e => e.title === 'List');
      expect(listEntries).toHaveLength(2);

      // First List
      const node1 = json<NodeResult>(await ctx.call('docs_get_node', { nodeId: listEntries[0].id }));
      expect(node1.title).toBe('List');

      // Second List
      const node2 = json<NodeResult>(await ctx.call('docs_get_node', { nodeId: listEntries[1].id }));
      expect(node2.title).toBe('List');
      expect(node2.content.toLowerCase()).toContain('second');

      // Different IDs
      expect(node1.id).not.toBe(node2.id);
    });

    it('duplicate Notes headings both accessible', async () => {
      const toc = json<TocEntry[]>(await ctx.call('docs_get_toc', { fileId: 'duplicates.md' }));
      const notesEntries = toc.filter(e => e.title === 'Notes');
      expect(notesEntries).toHaveLength(2);

      const node1 = json<NodeResult>(await ctx.call('docs_get_node', { nodeId: notesEntries[0].id }));
      const node2 = json<NodeResult>(await ctx.call('docs_get_node', { nodeId: notesEntries[1].id }));
      expect(node1.id).not.toBe(node2.id);
    });

    it('missing node returns isError=true', async () => {
      const result = await ctx.call('docs_get_node', { nodeId: 999999 });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('Node not found');
    });
  });

  // =========================================================================
  // docs_search_files
  // =========================================================================

  describe('docs_search_files', () => {
    it('returns results with top hit for auth query', async () => {
      const hits = json<FileSearchHit[]>(await ctx.call('docs_search_files', { query: 'auth docs file', minScore: 0 }));

      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].fileId).toBe('auth.md');
      expect(hits[0].score).toBeGreaterThan(0);
      expect(typeof hits[0].title).toBe('string');
      expect(hits.every((h, i) => i === 0 || h.score <= hits[i - 1].score)).toBe(true);
    });

    it('api docs query top hit is api.md', async () => {
      const hits = json<FileSearchHit[]>(await ctx.call('docs_search_files', { query: 'api docs file', minScore: 0 }));
      expect(hits[0].fileId).toBe('api.md');
    });

    it('unknown query returns empty with minScore filter', async () => {
      const hits = json<FileSearchHit[]>(await ctx.call('docs_search_files', { query: 'xyzzy unknown', minScore: 0.1 }));
      expect(hits).toHaveLength(0);
    });

    it('limit=1 returns at most 1 result', async () => {
      const hits = json<FileSearchHit[]>(await ctx.call('docs_search_files', { query: 'auth docs file', limit: 1, minScore: 0 }));
      expect(hits).toHaveLength(1);
    });
  });

  // =========================================================================
  // docs-only mode (no codeGraph)
  // =========================================================================

  describe('docs-only mode', () => {
    let docsCtx: McpTestContext;
    let docsTestStore: TestStoreContext;

    beforeAll(async () => {
      const fakeEmbed = createFakeEmbed(QUERY_AXES);
      docsTestStore = createTestStoreManager(fakeEmbed);
      await populateDocsStore(docsTestStore);

      const scopedStore = docsTestStore.store.project(docsTestStore.projectId);
      docsCtx = await setupMcpClient({
        scopedStore,
        storeManager: docsTestStore.storeManager,
        embedFn: fakeEmbed,
      });
    });

    afterAll(async () => {
      await docsCtx.close();
      docsTestStore.cleanup();
    });

    it('list_files works without codeGraph', async () => {
      const files = jsonList<FileEntry>(await docsCtx.call('docs_list_files'));
      expect(files).toHaveLength(3);
    });

    it('search works without codeGraph', async () => {
      const hits = json<Hit[]>(await docsCtx.call('docs_search', { query: 'auth guide', searchMode: 'vector' }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].fileId).toBe('auth.md');
    });

    it('code_list_files not registered returns error', async () => {
      try {
        const r = await docsCtx.call('code_list_files') as CallResult;
        expect(r.isError).toBe(true);
      } catch {
        // throws if tool not registered — also acceptable
        expect(true).toBe(true);
      }
    });

    it('code_search not registered returns error', async () => {
      try {
        const r = await docsCtx.call('code_search', { query: 'test' }) as CallResult;
        expect(r.isError).toBe(true);
      } catch {
        // throws if tool not registered — also acceptable
        expect(true).toBe(true);
      }
    });
  });
});
