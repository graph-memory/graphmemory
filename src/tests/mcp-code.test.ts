import {
  unitVec, createFakeEmbed, createTestStoreManager, setupMcpClient,
  json, text,
  type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';
import type { CodeNode } from '@/store/types';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const CODE_MTIME = 1_800_000_000_000;

/**
 * Build an Omit<CodeNode, 'id'> for store.code.updateFile().
 * The store inserts a file-level node automatically, so these are symbol nodes only.
 */
function symbolNode(
  fileId: string, kind: string, name: string,
  startLine: number, endLine: number,
  opts: { signature?: string; docComment?: string; isExported?: boolean; language?: string } = {},
): Omit<CodeNode, 'id'> {
  return {
    kind,
    fileId,
    language: opts.language ?? 'typescript',
    name,
    signature: opts.signature ?? `export ${kind} ${name}`,
    docComment: opts.docComment ?? '',
    body: `// body of ${name}`,
    startLine,
    endLine,
    isExported: opts.isExported ?? true,
    mtime: CODE_MTIME,
  };
}

/** Axes for fake embeddings – each symbol/file gets a unique unit vector direction. */
const AXES = {
  // src/graph.ts symbols
  graphFile: 15,
  DocGraph: 16,
  updateFile: 17,
  removeFile: 18,
  // src/search.ts symbols
  searchFile: 19,
  search: 20,
} as const;

/** Query strings → axis for the fake embed function. */
const QUERY_AXES: Array<[string, number]> = [
  ['update file', AXES.updateFile],
  ['remove file', AXES.removeFile],
  ['docgraph type', AXES.DocGraph],
  ['search function', AXES.search],
  ['graph module', AXES.graphFile],
  ['search module', AXES.searchFile],
];

// ---------------------------------------------------------------------------
// Types for asserting MCP responses
// ---------------------------------------------------------------------------

type FileEntry = { id: number; fileId: string; language: string; symbolCount: number; mtime: number };
type SymEntry  = { id: number; kind: string; name: string; signature: string; startLine: number; endLine: number; isExported: boolean };
type CodeHit   = { id: number; fileId: string; kind: string; name: string; signature: string; docComment: string; startLine: number; endLine: number; score: number };
type SymbolResult = { id: number; kind: string; fileId: string; name: string; signature: string; docComment: string; body: string; startLine: number; endLine: number; isExported: boolean };
type SearchHit = { id: number; score: number };

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MCP code tools', () => {
  let storeCtx: TestStoreContext;
  let ctx: McpTestContext;
  let call: McpTestContext['call'];

  // We need to look up node IDs after insert (they are auto-assigned)
  let graphFileNodeId: number;
  let searchFileNodeId: number;

  beforeAll(async () => {
    const fakeEmbed = createFakeEmbed(QUERY_AXES);
    storeCtx = createTestStoreManager(fakeEmbed);
    const scopedStore = storeCtx.store.project(storeCtx.projectId);

    // ----- src/graph.ts: DocGraph type, updateFile fn, removeFile fn -----
    const graphNodes: Omit<CodeNode, 'id'>[] = [
      symbolNode('src/graph.ts', 'type', 'DocGraph', 10, 12),
      symbolNode('src/graph.ts', 'function', 'updateFile', 20, 45, {
        docComment: 'Replace all chunks for a given file.',
      }),
      symbolNode('src/graph.ts', 'function', 'removeFile', 50, 58),
    ];

    const graphEmbeddings = new Map<string, number[]>();
    graphEmbeddings.set('src/graph.ts', unitVec(AXES.graphFile));   // file-level
    graphEmbeddings.set('DocGraph', unitVec(AXES.DocGraph));
    graphEmbeddings.set('updateFile', unitVec(AXES.updateFile));
    graphEmbeddings.set('removeFile', unitVec(AXES.removeFile));

    scopedStore.code.updateFile('src/graph.ts', graphNodes, [], CODE_MTIME, graphEmbeddings);

    // ----- src/search.ts: search fn -----
    const searchNodes: Omit<CodeNode, 'id'>[] = [
      symbolNode('src/search.ts', 'function', 'search', 10, 55, {
        docComment: 'Semantic search over the doc graph using BFS.',
      }),
    ];

    const searchEmbeddings = new Map<string, number[]>();
    searchEmbeddings.set('src/search.ts', unitVec(AXES.searchFile)); // file-level
    searchEmbeddings.set('search', unitVec(AXES.search));

    scopedStore.code.updateFile('src/search.ts', searchNodes, [], CODE_MTIME, searchEmbeddings);

    // Resolve import: search.ts → graph.ts
    scopedStore.code.resolveImports([{ fromFileId: 'src/search.ts', toFileId: 'src/graph.ts' }]);

    // Look up auto-assigned file node IDs for later use
    const files = scopedStore.code.listFiles();
    graphFileNodeId = files.results.find(f => f.fileId === 'src/graph.ts')!.id;
    searchFileNodeId = files.results.find(f => f.fileId === 'src/search.ts')!.id;

    ctx = await setupMcpClient({ scopedStore, embedFn: fakeEmbed });
    call = ctx.call;
  });

  afterAll(async () => {
    await ctx.close();
    storeCtx.cleanup();
  });

  // =========================================================================
  // code_list_files
  // =========================================================================

  describe('code_list_files', () => {
    it('returns 2 files sorted alphabetically with correct symbolCounts', async () => {
      const { results: files } = json<{ results: FileEntry[]; total: number }>(await call('code_list_files'));
      expect(files.length).toBe(2);
      expect(files[0].fileId).toBe('src/graph.ts');
      expect(files[1].fileId).toBe('src/search.ts');
      // symbolCount excludes file-level node
      expect(files[0].symbolCount).toBe(3);
      expect(files[1].symbolCount).toBe(1);
    });

    it('each entry has numeric id, language, and mtime', async () => {
      const { results: files } = json<{ results: FileEntry[]; total: number }>(await call('code_list_files'));
      for (const f of files) {
        expect(typeof f.id).toBe('number');
        expect(f.language).toBe('typescript');
        expect(f.mtime).toBe(CODE_MTIME);
      }
    });

    it('filter "graph" returns 1 file', async () => {
      const { results: files } = json<{ results: FileEntry[]; total: number }>(
        await call('code_list_files', { filter: 'graph' }),
      );
      expect(files.length).toBe(1);
      expect(files[0].fileId).toBe('src/graph.ts');
    });

    it('filter "src/" returns all 2 files', async () => {
      const { results: files } = json<{ results: FileEntry[]; total: number }>(
        await call('code_list_files', { filter: 'src/' }),
      );
      expect(files.length).toBe(2);
    });

    it('filter "nonexistent" returns empty', async () => {
      const { results: files } = json<{ results: FileEntry[]; total: number }>(
        await call('code_list_files', { filter: 'nonexistent' }),
      );
      expect(files.length).toBe(0);
    });

    it('limit=1 returns first alphabetically', async () => {
      const { results: files } = json<{ results: FileEntry[]; total: number }>(
        await call('code_list_files', { limit: 1 }),
      );
      expect(files.length).toBe(1);
      expect(files[0].fileId).toBe('src/graph.ts');
    });
  });

  // =========================================================================
  // code_get_file_symbols
  // =========================================================================

  describe('code_get_file_symbols', () => {
    describe('src/graph.ts', () => {
      it('returns 3 symbols (excludes file node) sorted by startLine', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms.length).toBe(3);
        expect(syms.every((s, i) => i === 0 || s.startLine >= syms[i - 1].startLine)).toBe(true);
      });

      it('first symbol is DocGraph type', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms[0].kind).toBe('type');
        expect(syms[0].name).toBe('DocGraph');
      });

      it('contains DocGraph type, updateFile and removeFile functions', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms.some(s => s.name === 'DocGraph' && s.kind === 'type')).toBe(true);
        expect(syms.some(s => s.name === 'updateFile' && s.kind === 'function')).toBe(true);
        expect(syms.some(s => s.name === 'removeFile' && s.kind === 'function')).toBe(true);
      });

      it('symbols have numeric id and isExported=true', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        for (const s of syms) {
          expect(typeof s.id).toBe('number');
          expect(s.isExported).toBe(true);
        }
      });

      it('strips body and docComment fields', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms.every(s => !('body' in s))).toBe(true);
        expect(syms.every(s => !('docComment' in s))).toBe(true);
      });
    });

    describe('src/search.ts', () => {
      it('returns 1 symbol: the search function', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/search.ts' }));
        expect(syms.length).toBe(1);
        expect(syms[0].name).toBe('search');
        expect(syms[0].kind).toBe('function');
        expect(typeof syms[0].id).toBe('number');
      });
    });

    describe('errors', () => {
      it('unknown file returns isError', async () => {
        const result = await call('code_get_file_symbols', { fileId: 'src/unknown.ts' });
        expect(result.isError).toBe(true);
        expect(text(result)).toContain('not found');
      });
    });
  });

  // =========================================================================
  // code_search
  // =========================================================================

  describe('code_search', () => {
    describe('basic scoring', () => {
      it('top hit for "update file" is the updateFile function', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', searchMode: 'vector' }));
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].name).toBe('updateFile');
        expect(hits[0].fileId).toBe('src/graph.ts');
        expect(hits[0].score).toBeGreaterThan(0);
      });

      it('result has required fields and no embedding/body/mtime', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', maxResults: 1, searchMode: 'vector' }));
        expect(hits.length).toBeGreaterThan(0);
        const required = ['id', 'fileId', 'kind', 'name', 'signature', 'docComment', 'startLine', 'endLine', 'score'];
        expect(required.every(k => k in hits[0])).toBe(true);
        expect('embedding' in hits[0]).toBe(false);
        expect('body' in hits[0]).toBe(false);
        expect('mtime' in hits[0]).toBe(false);
        expect(typeof hits[0].id).toBe('number');
      });

      it('results sorted by score desc', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', searchMode: 'vector' }));
        expect(hits.every((h, i) => i === 0 || h.score <= hits[i - 1].score)).toBe(true);
      });
    });

    describe('vector search finds correct symbols', () => {
      it('"search function" query finds the search function', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'search function', searchMode: 'vector' }));
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].name).toBe('search');
        expect(hits[0].fileId).toBe('src/search.ts');
      });

      it('"docgraph type" query finds DocGraph', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'docgraph type', searchMode: 'vector' }));
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].name).toBe('DocGraph');
        expect(hits[0].kind).toBe('type');
      });

      it('"remove file" query finds removeFile', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'remove file', searchMode: 'vector' }));
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].name).toBe('removeFile');
      });
    });

    describe('maxResults', () => {
      it('maxResults=1 returns exactly 1 result', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', maxResults: 1, searchMode: 'vector' }));
        expect(hits.length).toBe(1);
      });
    });

    describe('minScore filtering', () => {
      it('minScore=0.99 returns only the exact match', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', minScore: 0.99, searchMode: 'vector' }));
        // Only updateFile should have a perfect score
        expect(hits.length).toBeLessThanOrEqual(1);
        if (hits.length > 0) {
          expect(hits[0].name).toBe('updateFile');
        }
      });

      it('unknown query with keyword mode returns empty results', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'xyzzy unknown', minScore: 0.1, searchMode: 'keyword' }));
        expect(hits.length).toBe(0);
      });
    });
  });

  // =========================================================================
  // code_get_symbol
  // =========================================================================

  describe('code_get_symbol', () => {
    describe('full content', () => {
      it('updateFile has all expected fields', async () => {
        // First find the node id via search
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', maxResults: 1, searchMode: 'vector' }));
        expect(hits.length).toBe(1);
        const nodeId = hits[0].id;

        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId }));
        expect(sym.id).toBe(nodeId);
        expect(sym.kind).toBe('function');
        expect(sym.fileId).toBe('src/graph.ts');
        expect(sym.name).toBe('updateFile');
        expect(typeof sym.signature).toBe('string');
        expect(sym.signature.length).toBeGreaterThan(0);
        expect(sym.docComment).toContain('Replace all chunks');
        expect(typeof sym.body).toBe('string');
        expect(sym.body.length).toBeGreaterThan(0);
        expect(sym.startLine).toBe(20);
        expect(sym.endLine).toBe(45);
        expect(sym.isExported).toBe(true);
      });

      it('strips mtime field', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', maxResults: 1, searchMode: 'vector' }));
        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId: hits[0].id }));
        expect('mtime' in sym).toBe(false);
      });

      it('DocGraph type has correct attributes', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'docgraph type', maxResults: 1, searchMode: 'vector' }));
        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId: hits[0].id }));
        expect(sym.kind).toBe('type');
        expect(sym.name).toBe('DocGraph');
        expect(sym.startLine).toBe(10);
        expect(sym.isExported).toBe(true);
      });
    });

    describe('search function', () => {
      it('docComment mentions BFS', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'search function', maxResults: 1, searchMode: 'vector' }));
        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId: hits[0].id }));
        expect(sym.docComment.toLowerCase()).toContain('bfs');
        expect(sym.startLine).toBe(10);
      });
    });

    describe('file node via numeric ID', () => {
      it('can retrieve file node by its numeric ID', async () => {
        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId: graphFileNodeId }));
        expect(sym.kind).toBe('file');
        expect(sym.fileId).toBe('src/graph.ts');
        expect(sym.isExported).toBe(false);
      });
    });

    describe('errors', () => {
      it('unknown nodeId returns isError', async () => {
        const result = await call('code_get_symbol', { nodeId: 999999 });
        expect(result.isError).toBe(true);
        expect(text(result)).toContain('Symbol not found');
      });
    });
  });

  // =========================================================================
  // code_search_files
  // =========================================================================

  describe('code_search_files', () => {
    it('returns SearchResult[] with numeric id and score', async () => {
      const hits = json<SearchHit[]>(await call('code_search_files', { query: 'graph module', minScore: 0 }));
      expect(hits.length).toBeGreaterThan(0);
      expect(typeof hits[0].id).toBe('number');
      expect(typeof hits[0].score).toBe('number');
      expect(hits[0].score).toBeGreaterThan(0);
    });

    it('"graph module" top hit is the graph.ts file node', async () => {
      const hits = json<SearchHit[]>(await call('code_search_files', { query: 'graph module', minScore: 0 }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe(graphFileNodeId);
    });

    it('"search module" top hit is the search.ts file node', async () => {
      const hits = json<SearchHit[]>(await call('code_search_files', { query: 'search module', minScore: 0 }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe(searchFileNodeId);
    });

    it('results sorted by score desc', async () => {
      const hits = json<SearchHit[]>(await call('code_search_files', { query: 'graph module', minScore: 0 }));
      expect(hits.every((h, i) => i === 0 || h.score <= hits[i - 1].score)).toBe(true);
    });

    it('unknown query returns empty', async () => {
      // RRF score for vector-only results is ~1/(60+rank) ≈ 0.016; minScore=0.02 filters them out
      const hits = json<SearchHit[]>(await call('code_search_files', { query: 'xyzzy unknown', minScore: 0.02 }));
      expect(hits.length).toBe(0);
    });

    it('limit=1 returns at most 1 result', async () => {
      const hits = json<SearchHit[]>(await call('code_search_files', { query: 'graph module', minScore: 0, limit: 1 }));
      expect(hits.length).toBe(1);
    });
  });
});
