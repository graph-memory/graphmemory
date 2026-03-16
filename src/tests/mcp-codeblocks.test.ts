// Jest integration test for MCP code-block tools.
// Split from mcp.test.ts — exercises find_examples, search_snippets,
// list_snippets, explain_symbol, cross_references.

import path from 'path';
import { readFileSync } from 'fs';
import { createGraph, updateFile } from '@/graphs/docs';
import { parseFile } from '@/lib/parsers/docs';
import { createCodeGraph, updateCodeFile } from '@/graphs/code';
import type { CodeNodeKind, CodeNodeAttributes } from '@/graphs/code-types';
import { unitVec, createFakeEmbed, setupMcpClient, json, text, type McpTestContext } from '@/tests/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExampleResult = {
  id: string; fileId: string; language: string | undefined;
  symbols: string[]; content: string;
  parentId: string | undefined; parentTitle: string | undefined;
};

type SnippetEntry = { id: string; fileId: string; language: string | undefined; symbols: string[]; preview: string };

type SnippetHit = { id: string; fileId: string; language: string | undefined; symbols: string[]; content: string; score: number };

type ExplainResult = {
  codeBlock: { id: string; language: string | undefined; symbols: string[]; content: string };
  explanation: { id: string; title: string; content: string } | null;
  fileId: string;
};

type CrossRefResult = {
  definitions: Array<{ id: string; fileId: string; kind: string; name: string; signature: string }>;
  documentation: Array<{ id: string; title: string; content: string }>;
  examples: Array<{ id: string; language: string | undefined; symbols: string[] }>;
};

// ---------------------------------------------------------------------------
// Fixtures and graph setup
// ---------------------------------------------------------------------------

const FIXTURES = path.resolve(__dirname, 'fixtures');
const DOC_MTIME = 1_700_000_000_000;
const CODE_MTIME = 1_800_000_000_000;

// Index codeblocks.md into docGraph
const cbDocGraph = createGraph();
let cbAxis = 0;
const cbFile = path.join(FIXTURES, 'codeblocks.md');
const cbChunks = parseFile(readFileSync(cbFile, 'utf-8'), cbFile, FIXTURES, 4);
for (const chunk of cbChunks) chunk.embedding = unitVec(cbAxis++);
updateFile(cbDocGraph, cbChunks, DOC_MTIME);

// Build minimal code graph with verifyToken and createToken
function codeNode(
  fileId: string,
  id: string,
  kind: CodeNodeKind,
  name: string,
  axis: number,
  startLine: number,
  endLine: number,
  opts: { signature?: string; docComment?: string; isExported?: boolean } = {},
): { id: string; attrs: CodeNodeAttributes } {
  return {
    id,
    attrs: {
      kind,
      fileId,
      name,
      signature:  opts.signature  ?? (kind === 'file' ? `// ${name}` : `export ${kind} ${name}`),
      docComment: opts.docComment ?? '',
      body:       `// body of ${name}`,
      startLine,
      endLine,
      isExported: opts.isExported ?? (kind !== 'file'),
      embedding:  unitVec(axis),
      fileEmbedding: [],
      mtime:      CODE_MTIME,
    },
  };
}

const cbCodeGraph = createCodeGraph();
updateCodeFile(cbCodeGraph, {
  fileId: 'src/auth.ts',
  mtime: CODE_MTIME,
  nodes: [
    codeNode('src/auth.ts', 'src/auth.ts',              'file',     'auth.ts',     29,  1, 50),
    codeNode('src/auth.ts', 'src/auth.ts::verifyToken',  'function', 'verifyToken', 30, 10, 25,
      { docComment: 'Verify a JWT and return the payload.', isExported: true }),
    codeNode('src/auth.ts', 'src/auth.ts::createToken',  'function', 'createToken', 31, 30, 45,
      { docComment: 'Create a new JWT token.', isExported: true }),
  ],
  edges: [
    { from: 'src/auth.ts', to: 'src/auth.ts::verifyToken', attrs: { kind: 'contains' } },
    { from: 'src/auth.ts', to: 'src/auth.ts::createToken', attrs: { kind: 'contains' } },
  ],
});

const cbQueryAxes: Array<[string, number]> = [
  ['authentication code',  0],  // codeblocks.md root chunk
  ['jwt example snippet',  2],  // first TS code block in Authentication
];

const cbFakeEmbed = createFakeEmbed(cbQueryAxes);

// ---------------------------------------------------------------------------
// MCP client
// ---------------------------------------------------------------------------

let ctx: McpTestContext;
let call: McpTestContext['call'];

beforeAll(async () => {
  ctx = await setupMcpClient({ docGraph: cbDocGraph, codeGraph: cbCodeGraph, embedFn: cbFakeEmbed });
  call = ctx.call;
});

afterAll(async () => {
  await ctx.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('code-block tools', () => {

  // ── Sanity checks ──

  describe('sanity checks', () => {
    it('codeblocks.md has 6 code block child chunks', () => {
      const cbChildChunks = cbChunks.filter(c => c.id.includes('::code-'));
      expect(cbChildChunks).toHaveLength(6);
    });

    it('5 have language tags (untagged = undefined)', () => {
      const cbCodeChunks = cbChunks.filter(c => c.language !== undefined);
      expect(cbCodeChunks).toHaveLength(5);
    });
  });

  // ── find_examples ──

  describe('find_examples', () => {
    it('createToken: has results, is typescript, symbols include it, parentTitle = Authentication', async () => {
      const exCreateToken = json<ExampleResult[]>(await call('find_examples', { symbol: 'createToken' }));
      expect(exCreateToken.length).toBeGreaterThanOrEqual(1);
      expect(exCreateToken[0].language).toBe('typescript');
      expect(exCreateToken[0].symbols).toContain('createToken');
      expect(exCreateToken[0].parentTitle).toBe('Authentication');
    });

    it('ApiClient: has results, parent is API Client', async () => {
      const exApiClient = json<ExampleResult[]>(await call('find_examples', { symbol: 'ApiClient' }));
      expect(exApiClient.length).toBeGreaterThanOrEqual(1);
      expect(exApiClient[0].parentTitle).toBe('API Client');
    });

    it('nonExistentSymbol999: returns "No code examples" message', async () => {
      const exNoneRaw = await call('find_examples', { symbol: 'nonExistentSymbol999' });
      expect(text(exNoneRaw)).toContain('No code examples');
    });
  });

  // ── list_snippets ──

  describe('list_snippets', () => {
    it('returns all 5 snippets with language', async () => {
      const allSnippets = json<SnippetEntry[]>(await call('list_snippets'));
      expect(allSnippets).toHaveLength(5);
      expect(allSnippets.some(s => s.language === 'typescript')).toBe(true);
      expect(allSnippets.some(s => s.symbols.length > 0)).toBe(true);
    });

    it('language=typescript: 3 results', async () => {
      const tsSnippets = json<SnippetEntry[]>(await call('list_snippets', { language: 'typescript' }));
      expect(tsSnippets).toHaveLength(3);
    });

    it('language=javascript: 1 result', async () => {
      const jsSnippets = json<SnippetEntry[]>(await call('list_snippets', { language: 'javascript' }));
      expect(jsSnippets).toHaveLength(1);
    });

    it('filter "pool" matches JS block', async () => {
      const filteredSnippets = json<SnippetEntry[]>(await call('list_snippets', { filter: 'pool' }));
      expect(filteredSnippets.length).toBeGreaterThanOrEqual(1);
      expect(filteredSnippets[0].language).toBe('javascript');
    });

    it('limit=2', async () => {
      const limitedSnippets = json<SnippetEntry[]>(await call('list_snippets', { limit: 2 }));
      expect(limitedSnippets).toHaveLength(2);
    });

    it('fileId filter', async () => {
      const fileSnippets = json<SnippetEntry[]>(await call('list_snippets', { fileId: 'codeblocks.md' }));
      expect(fileSnippets).toHaveLength(5);
    });
  });

  // ── search_snippets ──

  describe('search_snippets', () => {
    it('returns results with score, language, sorted by score', async () => {
      const snippetHits = json<SnippetHit[]>(await call('search_snippets', { query: 'jwt example snippet', minScore: 0 }));
      expect(snippetHits.length).toBeGreaterThanOrEqual(1);
      expect(typeof snippetHits[0].score).toBe('number');
      expect(snippetHits[0].language).toBeDefined();
      expect(snippetHits.every((h, i) => i === 0 || h.score <= snippetHits[i - 1].score)).toBe(true);
    });

    it('language filter to javascript', async () => {
      const snippetHitsLang = json<SnippetHit[]>(await call('search_snippets', { query: 'jwt example snippet', language: 'javascript', minScore: 0.0 }));
      // The query embedding points to a TS code block axis, but we filter to JS — so the exact match is excluded
      expect(snippetHitsLang.every(h => h.language === 'javascript')).toBe(true);
    });
  });

  // ── explain_symbol ──

  describe('explain_symbol', () => {
    it('verifyToken: codeBlock has symbol, is typescript, explanation has title Authentication', async () => {
      const explainVT = json<ExplainResult[]>(await call('explain_symbol', { symbol: 'verifyToken' }));
      expect(explainVT.length).toBeGreaterThanOrEqual(1);
      expect(explainVT[0].codeBlock.symbols).toContain('verifyToken');
      expect(explainVT[0].codeBlock.language).toBe('typescript');
      expect(explainVT[0].explanation).not.toBeNull();
      expect(explainVT[0].explanation!.title).toBe('Authentication');
    });

    it('noSuchSymbol: returns "No documentation" message', async () => {
      const explainNoneRaw = await call('explain_symbol', { symbol: 'noSuchSymbol' });
      expect(text(explainNoneRaw)).toContain('No documentation');
    });
  });

  // ── cross_references ──

  describe('cross_references', () => {
    it('verifyToken: definitions from code graph, examples from docs, documentation sections', async () => {
      const xrefVT = json<CrossRefResult>(await call('cross_references', { symbol: 'verifyToken' }));
      expect(xrefVT.definitions.length).toBeGreaterThanOrEqual(1);
      expect(xrefVT.definitions[0].fileId).toBe('src/auth.ts');
      expect(xrefVT.definitions[0].kind).toBe('function');
      expect(xrefVT.examples.length).toBeGreaterThanOrEqual(1);
      expect(xrefVT.examples[0].language).toBe('typescript');
      expect(xrefVT.documentation.length).toBeGreaterThanOrEqual(1);
      expect(xrefVT.documentation[0].title).toBe('Authentication');
    });

    it('createToken: defs from code, examples in docs', async () => {
      const xrefCT = json<CrossRefResult>(await call('cross_references', { symbol: 'createToken' }));
      expect(xrefCT.definitions.length).toBeGreaterThanOrEqual(1);
      expect(xrefCT.examples.length).toBeGreaterThanOrEqual(1);
    });

    it('completelyUnknownXyz: returns "No references" message', async () => {
      const xrefNoneRaw = await call('cross_references', { symbol: 'completelyUnknownXyz' });
      expect(text(xrefNoneRaw)).toContain('No references');
    });

    it('auth.ts (file name): definition exists, no doc examples', async () => {
      const xrefCodeOnly = json<CrossRefResult>(await call('cross_references', { symbol: 'auth.ts' }));
      expect(xrefCodeOnly.definitions.length).toBeGreaterThanOrEqual(1);
      expect(xrefCodeOnly.examples).toHaveLength(0);
    });
  });
});
