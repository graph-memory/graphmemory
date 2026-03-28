import { unitVec, createFakeEmbed, setupMcpClient, json, jsonList, text, type McpTestContext } from '@/tests/helpers';
import { createCodeGraph, updateCodeFile } from '@/graphs/code';
import type { CodeNodeKind, CodeNodeAttributes } from '@/graphs/code-types';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const CODE_MTIME = 1_800_000_000_000;

function codeNode(
  fileId: string, id: string, kind: CodeNodeKind, name: string,
  axis: number, startLine: number, endLine: number,
  opts: { signature?: string; docComment?: string; isExported?: boolean } = {},
): { id: string; attrs: CodeNodeAttributes } {
  return {
    id,
    attrs: {
      kind, fileId, name,
      signature: opts.signature ?? (kind === 'file' ? `// ${name}` : `export ${kind} ${name}`),
      docComment: opts.docComment ?? '',
      body: `// body of ${name}`,
      startLine, endLine,
      isExported: opts.isExported ?? (kind !== 'file'),
      embedding: unitVec(axis),
      fileEmbedding: [],
      mtime: CODE_MTIME,
    },
  };
}

const QUERY_AXES: Array<[string, number]> = [
  ['graph module', 15], ['docgraph type', 16], ['update file', 17],
  ['remove file', 18], ['search module', 19], ['search function', 20],
  ['graph code file', 24], ['search code file', 25],
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileEntry = { fileId: string; symbolCount: number };
type SymEntry = { id: string; kind: string; name: string; signature: string; startLine: number; endLine: number; isExported: boolean };
type CodeHit = { id: string; fileId: string; kind: string; name: string; signature: string; docComment: string; startLine: number; endLine: number; score: number };
type SymbolResult = { id: string; kind: string; fileId: string; name: string; signature: string; docComment: string; body: string; startLine: number; endLine: number; isExported: boolean };
type CodeFileHit = { fileId: string; symbolCount: number; score: number };

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MCP code tools', () => {
  let ctx: McpTestContext;
  let call: McpTestContext['call'];

  beforeAll(async () => {
    const fakeEmbed = createFakeEmbed(QUERY_AXES);
    const codeGraph = createCodeGraph();

    // graph.ts: file (axis 15), DocGraph type (16), updateFile fn (17), removeFile fn (18)
    updateCodeFile(codeGraph, {
      fileId: 'src/graph.ts', mtime: CODE_MTIME,
      nodes: [
        codeNode('src/graph.ts', 'src/graph.ts', 'file', 'graph.ts', 15, 1, 90),
        codeNode('src/graph.ts', 'src/graph.ts::DocGraph', 'type', 'DocGraph', 16, 10, 12),
        codeNode('src/graph.ts', 'src/graph.ts::updateFile', 'function', 'updateFile', 17, 20, 45,
          { docComment: 'Replace all chunks for a given file.' }),
        codeNode('src/graph.ts', 'src/graph.ts::removeFile', 'function', 'removeFile', 18, 50, 58),
      ],
      edges: [
        { from: 'src/graph.ts', to: 'src/graph.ts::DocGraph', attrs: { kind: 'contains' } },
        { from: 'src/graph.ts', to: 'src/graph.ts::updateFile', attrs: { kind: 'contains' } },
        { from: 'src/graph.ts', to: 'src/graph.ts::removeFile', attrs: { kind: 'contains' } },
      ],
    });

    // search.ts: file (axis 19), search fn (20), imports graph.ts
    updateCodeFile(codeGraph, {
      fileId: 'src/search.ts', mtime: CODE_MTIME,
      nodes: [
        codeNode('src/search.ts', 'src/search.ts', 'file', 'search.ts', 19, 1, 60),
        codeNode('src/search.ts', 'src/search.ts::search', 'function', 'search', 20, 10, 55,
          { docComment: 'Semantic search over the doc graph using BFS.' }),
      ],
      edges: [
        { from: 'src/search.ts', to: 'src/search.ts::search', attrs: { kind: 'contains' } },
        { from: 'src/search.ts', to: 'src/graph.ts', attrs: { kind: 'imports' } },
      ],
    });

    // File-level embeddings
    codeGraph.setNodeAttribute('src/graph.ts', 'fileEmbedding', unitVec(24));
    codeGraph.setNodeAttribute('src/search.ts', 'fileEmbedding', unitVec(25));

    ctx = await setupMcpClient({ codeGraph, embedFn: fakeEmbed });
    call = ctx.call;
  });

  afterAll(async () => {
    await ctx.close();
  });

  // =========================================================================
  // code_list_files
  // =========================================================================

  describe('code_list_files', () => {
    it('returns 2 files sorted with correct symbolCounts', async () => {
      const files = jsonList<FileEntry>(await call('code_list_files'));
      expect(files.length).toBe(2);
      expect(files.some(f => f.fileId === 'src/graph.ts')).toBe(true);
      expect(files.some(f => f.fileId === 'src/search.ts')).toBe(true);
      expect(files[0].fileId).toBe('src/graph.ts');
      expect(files.find(f => f.fileId === 'src/graph.ts')!.symbolCount).toBe(4);
      expect(files.find(f => f.fileId === 'src/search.ts')!.symbolCount).toBe(2);
    });

    it('filter "graph" returns 1 file', async () => {
      const files = jsonList<FileEntry>(await call('code_list_files', { filter: 'graph' }));
      expect(files.length).toBe(1);
      expect(files[0].fileId).toBe('src/graph.ts');
    });

    it('filter "src/" returns all 2 files', async () => {
      const files = jsonList<FileEntry>(await call('code_list_files', { filter: 'src/' }));
      expect(files.length).toBe(2);
    });

    it('filter "nonexistent" returns empty', async () => {
      const files = jsonList<FileEntry>(await call('code_list_files', { filter: 'nonexistent' }));
      expect(files.length).toBe(0);
    });

    it('limit=1 returns first alphabetically', async () => {
      const files = jsonList<FileEntry>(await call('code_list_files', { limit: 1 }));
      expect(files.length).toBe(1);
      expect(files[0].fileId).toBe('src/graph.ts');
    });

    it('default limit returns all files', async () => {
      const files = jsonList<FileEntry>(await call('code_list_files'));
      expect(files.length).toBe(2);
    });
  });

  // =========================================================================
  // code_get_file_symbols
  // =========================================================================

  describe('code_get_file_symbols', () => {
    describe('src/graph.ts', () => {
      it('returns 4 symbols sorted by startLine', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms.length).toBe(4);
        expect(syms.every((s, i) => i === 0 || s.startLine >= syms[i - 1].startLine)).toBe(true);
      });

      it('file node is first with correct kind and name', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms[0].kind).toBe('file');
        expect(syms[0].name).toBe('graph.ts');
      });

      it('contains DocGraph type, updateFile and removeFile functions', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms.some(s => s.name === 'DocGraph' && s.kind === 'type')).toBe(true);
        expect(syms.some(s => s.name === 'updateFile' && s.kind === 'function')).toBe(true);
        expect(syms.some(s => s.name === 'removeFile' && s.kind === 'function')).toBe(true);
      });

      it('updateFile has correct id and isExported=true', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms.some(s => s.id === 'src/graph.ts::updateFile')).toBe(true);
        expect(syms.find(s => s.name === 'updateFile')!.isExported).toBe(true);
      });

      it('file node isExported=false', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms.find(s => s.kind === 'file')!.isExported).toBe(false);
      });

      it('strips embedding, body, and docComment fields', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/graph.ts' }));
        expect(syms.every(s => !('embedding' in s))).toBe(true);
        expect(syms.every(s => !('body' in s))).toBe(true);
        expect(syms.every(s => !('docComment' in s))).toBe(true);
      });
    });

    describe('src/search.ts', () => {
      it('returns 2 symbols with search function', async () => {
        const syms = json<SymEntry[]>(await call('code_get_file_symbols', { fileId: 'src/search.ts' }));
        expect(syms.length).toBe(2);
        expect(syms.some(s => s.name === 'search' && s.kind === 'function')).toBe(true);
        expect(syms.some(s => s.id === 'src/search.ts::search')).toBe(true);
      });
    });

    describe('errors', () => {
      it('unknown file returns isError', async () => {
        const result = await call('code_get_file_symbols', { fileId: 'src/unknown.ts' });
        expect(result.isError).toBe(true);
        expect(text(result)).toContain('File not found');
      });
    });
  });

  // =========================================================================
  // code_search
  // =========================================================================

  describe('code_search', () => {
    describe('basic scoring', () => {
      it('top hit is updateFile with score 1.0', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 1, bfsDepth: 0, searchMode: 'vector' }));
        expect(hits[0]?.id).toBe('src/graph.ts::updateFile');
        expect(hits[0]?.score).toBe(1.0);
      });

      it('result has required fields and no embedding/body', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 1, bfsDepth: 0, searchMode: 'vector' }));
        const required = ['id', 'fileId', 'kind', 'name', 'signature', 'docComment', 'startLine', 'endLine', 'score'];
        expect(required.every(k => k in hits[0])).toBe(true);
        expect('embedding' in hits[0]).toBe(false);
        expect('body' in hits[0]).toBe(false);
      });

      it('results sorted by score desc', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 1, bfsDepth: 0 }));
        expect(hits.every((h, i) => i === 0 || h.score <= hits[i - 1].score)).toBe(true);
      });
    });

    describe('BFS via contains edge', () => {
      it('depth=1 includes parent file but not search.ts', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 1, bfsDepth: 1, searchMode: 'vector' }));
        const ids = hits.map(h => h.id);
        expect(ids).toContain('src/graph.ts::updateFile');
        expect(ids).toContain('src/graph.ts');
        expect(ids).not.toContain('src/search.ts');
      });
    });

    describe('BFS via imports edge', () => {
      it('search function is top hit at depth=1', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'search function', topK: 1, bfsDepth: 1, searchMode: 'vector' }));
        const ids = hits.map(h => h.id);
        expect(hits[0]?.id).toBe('src/search.ts::search');
        expect(ids).toContain('src/search.ts');
      });

      it('depth=2 reaches src/graph.ts via imports', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'search function', topK: 1, bfsDepth: 2, minScore: 0 }));
        const ids = hits.map(h => h.id);
        expect(ids).toContain('src/graph.ts');
      });
    });

    describe('minScore + bfsDepth=0', () => {
      it('bfsDepth=0 returns only seed', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 1, bfsDepth: 0, searchMode: 'vector' }));
        expect(hits.length).toBe(1);
        expect(hits[0].id).toBe('src/graph.ts::updateFile');
      });

      it('minScore=0.96 returns only exact match (edge decay 0.95 filters BFS nodes)', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 1, bfsDepth: 1, minScore: 0.96, searchMode: 'vector' }));
        expect(hits.length).toBe(1);
        expect(hits[0].id).toBe('src/graph.ts::updateFile');
      });

      it('unknown query returns empty results', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'xyzzy unknown', topK: 5, minScore: 0.1, searchMode: 'keyword' }));
        expect(hits.length).toBe(0);
      });
    });

    describe('maxResults', () => {
      it('maxResults=1 returns exactly 1 result', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 5, bfsDepth: 2, maxResults: 1, searchMode: 'vector' }));
        expect(hits.length).toBe(1);
        expect(hits[0].id).toBe('src/graph.ts::updateFile');
      });
    });

    describe('bfsDecay', () => {
      it('bfsDecay=1.0 keeps seed score for BFS nodes', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 1, bfsDepth: 1, bfsDecay: 1.0, minScore: 0.99, searchMode: 'vector' }));
        expect(hits.some(h => h.id === 'src/graph.ts')).toBe(true);
      });

      it('bfsDecay=0.0 filters BFS nodes to score 0', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 1, bfsDepth: 1, bfsDecay: 0.0, minScore: 0.01, searchMode: 'vector' }));
        expect(hits.length).toBe(1);
        expect(hits[0].id).toBe('src/graph.ts::updateFile');
      });

      it('default decay: BFS score uses edge-specific decay (contains=0.95)', async () => {
        const hits = json<CodeHit[]>(await call('code_search', { query: 'update file', topK: 1, bfsDepth: 1, searchMode: 'vector' }));
        const seedScore = hits.find(h => h.id === 'src/graph.ts::updateFile')!.score;
        const bfsScore = hits.find(h => h.id === 'src/graph.ts')?.score ?? 0;
        expect(bfsScore).toBeLessThan(seedScore);
        // File node connected via 'contains' edge (decay=0.95)
        expect(Math.abs(bfsScore - seedScore * 0.95)).toBeLessThan(0.001);
      });
    });
  });

  // =========================================================================
  // code_get_symbol
  // =========================================================================

  describe('code_get_symbol', () => {
    describe('full content', () => {
      it('updateFile has all expected fields', async () => {
        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId: 'src/graph.ts::updateFile' }));
        expect(sym.id).toBe('src/graph.ts::updateFile');
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

      it('strips embedding and mtime fields', async () => {
        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId: 'src/graph.ts::updateFile' }));
        expect('embedding' in sym).toBe(false);
        expect('mtime' in sym).toBe(false);
      });

      it('file node has kind=file and isExported=false', async () => {
        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId: 'src/graph.ts' }));
        expect(sym.kind).toBe('file');
        expect(sym.isExported).toBe(false);
      });

      it('DocGraph type has correct attributes', async () => {
        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId: 'src/graph.ts::DocGraph' }));
        expect(sym.kind).toBe('type');
        expect(sym.name).toBe('DocGraph');
        expect(sym.startLine).toBe(10);
        expect(sym.isExported).toBe(true);
        expect('embedding' in sym).toBe(false);
      });
    });

    describe('search function', () => {
      it('docComment mentions BFS', async () => {
        const sym = json<SymbolResult>(await call('code_get_symbol', { nodeId: 'src/search.ts::search' }));
        expect(sym.docComment.toLowerCase()).toContain('bfs');
        expect(sym.startLine).toBe(10);
      });
    });

    describe('errors', () => {
      it('unknown nodeId returns isError', async () => {
        const result = await call('code_get_symbol', { nodeId: 'src/unknown.ts::foo' });
        expect(result.isError).toBe(true);
        expect(text(result)).toContain('Symbol not found');
      });
    });
  });

  // =========================================================================
  // code_search_files
  // =========================================================================

  describe('code_search_files', () => {
    it('top hit is src/graph.ts with score 1.0 and correct symbolCount', async () => {
      const hits = json<CodeFileHit[]>(await call('code_search_files', { query: 'graph code file' }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].fileId).toBe('src/graph.ts');
      expect(hits[0].score).toBe(1.0);
      expect(typeof hits[0].symbolCount).toBe('number');
      expect(hits[0].symbolCount).toBe(4);
      expect(hits.every((h, i) => i === 0 || h.score <= hits[i - 1].score)).toBe(true);
    });

    it('search code file query hits src/search.ts', async () => {
      const hits = json<CodeFileHit[]>(await call('code_search_files', { query: 'search code file' }));
      expect(hits[0].fileId).toBe('src/search.ts');
      expect(hits[0].symbolCount).toBe(2);
    });

    it('unknown query returns empty', async () => {
      const hits = json<CodeFileHit[]>(await call('code_search_files', { query: 'xyzzy unknown', minScore: 0.1 }));
      expect(hits.length).toBe(0);
    });

    it('limit=1 returns at most 1 result', async () => {
      const hits = json<CodeFileHit[]>(await call('code_search_files', { query: 'graph code file', limit: 1 }));
      expect(hits.length).toBe(1);
    });

    it('minScore=0.9 returns only exact match', async () => {
      const hits = json<CodeFileHit[]>(await call('code_search_files', { query: 'graph code file', minScore: 0.9 }));
      expect(hits.length).toBe(1);
      expect(hits[0].fileId).toBe('src/graph.ts');
    });
  });
});
