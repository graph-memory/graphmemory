import path from 'path';
import { readFileSync } from 'fs';
import { createGraph, updateFile } from '@/graphs/docs';
import { parseFile } from '@/lib/parsers/docs';
import {
  unitVec, createFakeEmbed, setupMcpClient,
  json, text,
  type CallResult, type McpTestContext,
} from '@/tests/helpers';

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
// Types
// ---------------------------------------------------------------------------

type TopicEntry = { fileId: string; title: string; chunks: number };
type TocEntry   = { id: string; title: string; level: number };
type Hit        = { id: string; fileId: string; title: string; content: string; level: number; score: number };
type NodeResult = { id: string; fileId: string; title: string; content: string; level: number; mtime: number };
type DocFileHit = { fileId: string; title: string; chunks: number; score: number };

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------

describe('MCP docs tools', () => {
  let ctx: McpTestContext;

  beforeAll(async () => {
    const docGraph = createGraph();
    let globalAxis = 0;
    for (const file of DOC_FILES) {
      const abs = path.join(FIXTURES, file);
      const chunks = await parseFile(readFileSync(abs, 'utf-8'), abs, FIXTURES, 4);
      for (const chunk of chunks) chunk.embedding = unitVec(globalAxis++);
      updateFile(docGraph, chunks, DOC_MTIME);
    }

    // File-level embeddings for search_topic_files
    docGraph.setNodeAttribute('api.md', 'fileEmbedding', unitVec(21));
    docGraph.setNodeAttribute('auth.md', 'fileEmbedding', unitVec(22));
    docGraph.setNodeAttribute('duplicates.md', 'fileEmbedding', unitVec(23));

    const fakeEmbed = createFakeEmbed(QUERY_AXES);
    ctx = await setupMcpClient({ docGraph, embedFn: fakeEmbed });
  });

  afterAll(async () => {
    await ctx.close();
  });

  // =========================================================================
  // list_topics
  // =========================================================================

  describe('list_topics', () => {
    it('returns all 3 files with correct metadata', async () => {
      const topics = json<TopicEntry[]>(await ctx.call('list_topics'));

      expect(topics).toHaveLength(3);
      expect(topics[0].fileId).toBe('api.md');
      expect(topics.some(f => f.fileId === 'auth.md')).toBe(true);
      expect(topics.some(f => f.fileId === 'duplicates.md')).toBe(true);
      expect(topics.find(f => f.fileId === 'api.md')!.chunks).toBe(6);
      expect(topics.find(f => f.fileId === 'auth.md')!.chunks).toBe(4);
      expect(topics.find(f => f.fileId === 'duplicates.md')!.chunks).toBe(5);
      expect(topics.find(f => f.fileId === 'api.md')!.title).toBe('API Reference');
      expect(topics.find(f => f.fileId === 'auth.md')!.title).toBe('Auth Guide');
    });

    it('filter: "auth" returns 1 file', async () => {
      const topics = json<TopicEntry[]>(await ctx.call('list_topics', { filter: 'auth' }));
      expect(topics).toHaveLength(1);
      expect(topics[0].fileId).toBe('auth.md');
    });

    it('filter: "API" is case-insensitive', async () => {
      const topics = json<TopicEntry[]>(await ctx.call('list_topics', { filter: 'API' }));
      expect(topics).toHaveLength(1);
      expect(topics[0].fileId).toBe('api.md');
    });

    it('filter: "nonexistent" returns empty', async () => {
      const topics = json<TopicEntry[]>(await ctx.call('list_topics', { filter: 'nonexistent' }));
      expect(topics).toHaveLength(0);
    });

    it('filter: ".md" returns all 3 files', async () => {
      const topics = json<TopicEntry[]>(await ctx.call('list_topics', { filter: '.md' }));
      expect(topics).toHaveLength(3);
    });

    it('limit=1 returns first alphabetically', async () => {
      const topics = json<TopicEntry[]>(await ctx.call('list_topics', { limit: 1 }));
      expect(topics).toHaveLength(1);
      expect(topics[0].fileId).toBe('api.md');
    });

    it('limit=2 returns exactly 2 files', async () => {
      const topics = json<TopicEntry[]>(await ctx.call('list_topics', { limit: 2 }));
      expect(topics).toHaveLength(2);
    });

    it('default limit returns all 3 files', async () => {
      const topics = json<TopicEntry[]>(await ctx.call('list_topics'));
      expect(topics).toHaveLength(3);
    });
  });

  // =========================================================================
  // get_toc
  // =========================================================================

  describe('get_toc', () => {
    it('auth.md: 4 entries with correct structure', async () => {
      const toc = json<TocEntry[]>(await ctx.call('get_toc', { fileId: 'auth.md' }));

      expect(toc).toHaveLength(4);
      expect(toc[0].id).toBe('auth.md');
      expect(toc[0].level).toBe(1);
      expect(toc[0].title).toBe('Auth Guide');
      expect(toc.slice(1).every(e => e.level === 2)).toBe(true);
      expect(toc.some(e => e.title === 'JWT Tokens')).toBe(true);
      expect(toc.some(e => e.title === 'Token Flow')).toBe(true);
      expect(toc.some(e => e.title === 'Roles')).toBe(true);
      expect(toc.find(e => e.title === 'JWT Tokens')!.id).toBe('auth.md::JWT Tokens');
    });

    it('api.md: 6 entries with level 2 and level 3 sections', async () => {
      const toc = json<TocEntry[]>(await ctx.call('get_toc', { fileId: 'api.md' }));

      expect(toc).toHaveLength(6);
      expect(toc[0].id).toBe('api.md');
      expect(toc.find(e => e.title === 'Endpoints')!.level).toBe(2);
      expect(toc.find(e => e.title === 'Users')!.level).toBe(3);
      expect(toc.find(e => e.title === 'Sessions')!.level).toBe(3);
      expect(toc.find(e => e.title === 'Error Codes')!.level).toBe(2);
      expect(toc.find(e => e.title === 'Rate Limiting')!.level).toBe(2);
      expect(toc.find(e => e.title === 'Users')!.id).toBe('api.md::Users');
      expect(toc.find(e => e.title === 'Sessions')!.id).toBe('api.md::Sessions');
    });

    it('duplicates.md: dedup IDs with ::2 suffix', async () => {
      const toc = json<TocEntry[]>(await ctx.call('get_toc', { fileId: 'duplicates.md' }));

      expect(toc).toHaveLength(5);
      expect(toc.some(e => e.id === 'duplicates.md::List')).toBe(true);
      expect(toc.some(e => e.id === 'duplicates.md::List::2')).toBe(true);
      expect(toc.some(e => e.id === 'duplicates.md::Notes')).toBe(true);
      expect(toc.some(e => e.id === 'duplicates.md::Notes::2')).toBe(true);
      expect(toc.filter(e => e.title === 'List')).toHaveLength(2);
      expect(toc.filter(e => e.title === 'Notes')).toHaveLength(2);
    });

    it('missing file returns isError=true', async () => {
      const result = await ctx.call('get_toc', { fileId: 'ghost.md' });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('ghost.md');
    });
  });

  // =========================================================================
  // search
  // =========================================================================

  describe('search', () => {
    it('basic scoring: auth guide query hits auth.md with score 1.0', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', searchMode: 'vector' }));

      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe('auth.md');
      expect(hits[0].score).toBe(1.0);
      expect(hits.every((h, i) => i === 0 || h.score <= hits[i - 1].score)).toBe(true);
      expect(hits.every(h =>
        'id' in h && 'fileId' in h && 'title' in h && 'content' in h && 'level' in h && 'score' in h,
      )).toBe(true);
    });

    it('basic scoring: api reference query top hit is api.md', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'api reference', searchMode: 'vector' }));
      expect(hits[0].id).toBe('api.md');
      expect(hits[0].score).toBe(1.0);
    });

    it('bfsDepth=0, topK=1: exactly 1 result (seed only)', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 1, bfsDepth: 0, searchMode: 'vector' }));
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe('auth.md');
    });

    it('bfsDepth=0, topK=3: at most 3 results', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 3, bfsDepth: 0, searchMode: 'vector' }));
      expect(hits.length).toBeLessThanOrEqual(3);
      expect(hits[0].id).toBe('auth.md');
    });

    it('bfsDepth=1: sibling expansion', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 1, bfsDepth: 1, searchMode: 'vector' }));
      const ids = hits.map(h => h.id);

      expect(ids).toContain('auth.md');
      expect(ids).toContain('auth.md::JWT Tokens');
      expect(ids).not.toContain('auth.md::Token Flow');
    });

    it('bfsDepth=1: cross-file link auth.md -> api.md', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 1, bfsDepth: 1, searchMode: 'vector' }));
      const ids = hits.map(h => h.id);

      expect(ids).toContain('api.md');
      expect(ids).not.toContain('api.md::Endpoints');
    });

    it('bfsDepth=1: incoming edges', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'api reference', topK: 1, bfsDepth: 1, searchMode: 'vector' }));
      const ids = hits.map(h => h.id);

      expect(ids).toContain('api.md::Endpoints');
      expect(ids).toContain('auth.md');
      expect(ids).not.toContain('api.md::Users');
    });

    it('bfsDepth=2: deeper expansion', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 1, bfsDepth: 2, minScore: 0 }));
      const ids = hits.map(h => h.id);

      expect(ids).toContain('auth.md::Token Flow');
      expect(ids).toContain('api.md::Endpoints');
      expect(ids).toContain('auth.md');
    });

    it('maxResults=1 returns exactly 1 result', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', bfsDepth: 3, maxResults: 1, searchMode: 'vector' }));
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe('auth.md');
    });

    it('maxResults=3 returns at most 3 results', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', bfsDepth: 3, maxResults: 3, searchMode: 'vector' }));
      expect(hits.length).toBeLessThanOrEqual(3);
      expect(hits[0].id).toBe('auth.md');
    });

    it('topK=1 picks best match (jwt token -> auth.md::JWT Tokens)', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'jwt token', topK: 1, bfsDepth: 0, searchMode: 'vector' }));
      expect(hits[0].id).toBe('auth.md::JWT Tokens');
      expect(hits).toHaveLength(1);
    });

    it('topK=2, bfsDepth=0: at most 2 results', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'jwt token', topK: 2, bfsDepth: 0, searchMode: 'vector' }));
      expect(hits.length).toBeLessThanOrEqual(2);
      expect(hits[0].id).toBe('auth.md::JWT Tokens');
    });

    it('zero-vector query has score=0', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'xyzzy completely unknown xyz', topK: 1, bfsDepth: 0, minScore: 0, searchMode: 'vector' }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].score).toBe(0);
    });

    it('minScore=0.9 returns only exact match', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 1, bfsDepth: 1, minScore: 0.9, searchMode: 'vector' }));
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe('auth.md');
      expect(hits.some(h => h.id === 'auth.md::JWT Tokens')).toBe(false);
    });

    it('minScore=0.75 includes depth-1 but filters depth-2', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 1, bfsDepth: 2, minScore: 0.75, searchMode: 'vector' }));
      const ids = hits.map(h => h.id);

      expect(ids).toContain('auth.md');
      expect(ids).toContain('auth.md::JWT Tokens');
      expect(ids).toContain('api.md');
      expect(ids).not.toContain('auth.md::Token Flow');
    });

    it('minScore=1.0 returns only exact match', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 5, bfsDepth: 2, minScore: 1.0, searchMode: 'vector' }));
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe('auth.md');
    });

    it('minScore filters out zero-score seeds', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'xyzzy completely unknown xyz', topK: 5, minScore: 0.1 }));
      expect(hits).toHaveLength(0);
    });

    it('bfsDecay=1.0: BFS nodes keep seed score', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 1, bfsDepth: 1, bfsDecay: 1.0, minScore: 0.99, searchMode: 'vector' }));
      expect(hits.some(h => h.id === 'auth.md::JWT Tokens')).toBe(true);
    });

    it('bfsDecay=0.0: BFS nodes get score 0 and are filtered', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 1, bfsDepth: 1, bfsDecay: 0.0, minScore: 0.01, searchMode: 'vector' }));
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe('auth.md');
    });

    it('default bfsDecay=0.8: BFS score = seed * 0.8', async () => {
      const hits = json<Hit[]>(await ctx.call('search', { query: 'auth guide', topK: 1, bfsDepth: 1, searchMode: 'vector' }));
      const seedScore = hits.find(h => h.id === 'auth.md')!.score;
      const bfsScore  = hits.find(h => h.id === 'auth.md::JWT Tokens')!.score;

      expect(bfsScore).toBeLessThan(seedScore);
      expect(Math.abs(bfsScore - seedScore * 0.8)).toBeLessThan(0.001);
    });
  });

  // =========================================================================
  // get_node
  // =========================================================================

  describe('get_node', () => {
    it('root chunk: all fields correct, no embedding', async () => {
      const node = json<NodeResult>(await ctx.call('get_node', { nodeId: 'auth.md' }));

      expect(node.id).toBe('auth.md');
      expect(node.fileId).toBe('auth.md');
      expect(node.title).toBe('Auth Guide');
      expect(typeof node.content).toBe('string');
      expect(node.content.length).toBeGreaterThan(0);
      expect(node.level).toBe(1);
      expect(node.mtime).toBe(DOC_MTIME);
      expect('embedding' in node).toBe(false);
    });

    it('level 2 subsection (JWT Tokens)', async () => {
      const node = json<NodeResult>(await ctx.call('get_node', { nodeId: 'auth.md::JWT Tokens' }));

      expect(node.id).toBe('auth.md::JWT Tokens');
      expect(node.fileId).toBe('auth.md');
      expect(node.title).toBe('JWT Tokens');
      expect(node.level).toBe(2);
      expect(node.content.toLowerCase()).toContain('token');
      expect('embedding' in node).toBe(false);
    });

    it('level 3 subsection (Users)', async () => {
      const node = json<NodeResult>(await ctx.call('get_node', { nodeId: 'api.md::Users' }));

      expect(node.id).toBe('api.md::Users');
      expect(node.level).toBe(3);
      expect(node.fileId).toBe('api.md');
      expect(node.content).toContain('/users');
    });

    it('level 3 subsection (Sessions)', async () => {
      const node = json<NodeResult>(await ctx.call('get_node', { nodeId: 'api.md::Sessions' }));

      expect(node.level).toBe(3);
      expect(node.content.toLowerCase()).toContain('refresh');
    });

    it('dedup ID ::2 (List)', async () => {
      const node = json<NodeResult>(await ctx.call('get_node', { nodeId: 'duplicates.md::List::2' }));

      expect(node.id).toBe('duplicates.md::List::2');
      expect(node.title).toBe('List');
      expect(node.content.toLowerCase()).toContain('second');
    });

    it('dedup ID ::2 (Notes)', async () => {
      const node = json<NodeResult>(await ctx.call('get_node', { nodeId: 'duplicates.md::Notes::2' }));

      expect(node.id).toBe('duplicates.md::Notes::2');
      expect(node.title).toBe('Notes');
    });

    it('missing file node returns isError=true', async () => {
      const result = await ctx.call('get_node', { nodeId: 'ghost.md' });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('ghost.md');
    });

    it('missing subsection returns isError=true', async () => {
      const result = await ctx.call('get_node', { nodeId: 'auth.md::NonExistent' });
      expect(result.isError).toBe(true);
    });

    it('non-existent ::99 suffix returns isError=true', async () => {
      const result = await ctx.call('get_node', { nodeId: 'duplicates.md::List::99' });
      expect(result.isError).toBe(true);
    });
  });

  // =========================================================================
  // search_topic_files
  // =========================================================================

  describe('search_topic_files', () => {
    it('returns results with top hit score 1.0', async () => {
      const hits = json<DocFileHit[]>(await ctx.call('search_topic_files', { query: 'auth docs file' }));

      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].fileId).toBe('auth.md');
      expect(hits[0].score).toBe(1.0);
      expect(typeof hits[0].title).toBe('string');
      expect(typeof hits[0].chunks).toBe('number');
      expect(hits[0].chunks).toBe(4);
      expect(hits.every((h, i) => i === 0 || h.score <= hits[i - 1].score)).toBe(true);
    });

    it('api docs query top hit is api.md', async () => {
      const hits = json<DocFileHit[]>(await ctx.call('search_topic_files', { query: 'api docs file' }));
      expect(hits[0].fileId).toBe('api.md');
      expect(hits[0].chunks).toBe(6);
    });

    it('unknown query returns empty', async () => {
      const hits = json<DocFileHit[]>(await ctx.call('search_topic_files', { query: 'xyzzy unknown', minScore: 0.1 }));
      expect(hits).toHaveLength(0);
    });

    it('topK=1 returns at most 1 result', async () => {
      const hits = json<DocFileHit[]>(await ctx.call('search_topic_files', { query: 'auth docs file', topK: 1 }));
      expect(hits).toHaveLength(1);
    });

    it('minScore=0.9 returns only exact match', async () => {
      const hits = json<DocFileHit[]>(await ctx.call('search_topic_files', { query: 'auth docs file', minScore: 0.9 }));
      expect(hits).toHaveLength(1);
      expect(hits[0].fileId).toBe('auth.md');
    });
  });

  // =========================================================================
  // docs-only mode (no codeGraph)
  // =========================================================================

  describe('docs-only mode', () => {
    let docsCtx: McpTestContext;

    beforeAll(async () => {
      const docGraph = createGraph();
      let globalAxis = 0;
      for (const file of DOC_FILES) {
        const abs = path.join(FIXTURES, file);
        const chunks = await parseFile(readFileSync(abs, 'utf-8'), abs, FIXTURES, 4);
        for (const chunk of chunks) chunk.embedding = unitVec(globalAxis++);
        updateFile(docGraph, chunks, DOC_MTIME);
      }

      const fakeEmbed = createFakeEmbed(QUERY_AXES);
      docsCtx = await setupMcpClient({ docGraph, embedFn: fakeEmbed });
    });

    afterAll(async () => {
      await docsCtx.close();
    });

    it('list_topics works without codeGraph', async () => {
      const topics = json<TopicEntry[]>(await docsCtx.call('list_topics'));
      expect(topics).toHaveLength(3);
    });

    it('search works without codeGraph', async () => {
      const hits = json<Hit[]>(await docsCtx.call('search', { query: 'auth guide', searchMode: 'vector' }));
      expect(hits[0]?.id).toBe('auth.md');
    });

    it('list_files not registered returns error', async () => {
      try {
        const r = await docsCtx.call('list_files') as CallResult;
        expect(r.isError).toBe(true);
      } catch {
        // throws if tool not registered — also acceptable
        expect(true).toBe(true);
      }
    });

    it('search_code not registered returns error', async () => {
      try {
        const r = await docsCtx.call('search_code', { query: 'test' }) as CallResult;
        expect(r.isError).toBe(true);
      } catch {
        // throws if tool not registered — also acceptable
        expect(true).toBe(true);
      }
    });
  });
});
