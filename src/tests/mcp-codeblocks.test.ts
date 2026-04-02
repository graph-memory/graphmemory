// Jest integration test for MCP code-block tools.
// Exercises docs_find_examples, docs_search_snippets,
// docs_list_snippets, docs_explain_symbol, docs_cross_references.
// Uses SQLite Store (no Graphology graphs).

import {
  unitVec, createFakeEmbed, createTestStoreManager, setupMcpClient, json, text,
  type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';
import type { DocNode, CodeNode } from '@/store/types';

// ---------------------------------------------------------------------------
// Types (tool output shapes)
// ---------------------------------------------------------------------------

type ExampleResult = {
  id: number; fileId: string; language: string | undefined;
  symbols: string[]; content: string;
  parentId: number | undefined; parentTitle: string | undefined;
};

type SnippetEntry = { id: number; fileId: string; language: string | undefined; symbols: string[]; preview: string };

type SnippetHit = { id: number; fileId: string; language: string | undefined; symbols: string[]; content: string; score: number };

type ExplainResult = {
  codeBlock: { id: number; language: string | undefined; symbols: string[]; content: string };
  explanation: { id: number; title: string; content: string } | null;
  fileId: string;
};

type CrossRefResult = {
  definitions: Array<{ id: number; fileId: string; kind: string; name: string; signature: string }>;
  documentation: Array<{ id: number; title: string; content: string }>;
  examples: Array<{ id: number; language: string | undefined; symbols: string[] }>;
};

// ---------------------------------------------------------------------------
// Fixtures — doc chunks matching codeblocks.md structure
// ---------------------------------------------------------------------------

const DOC_MTIME = 1_700_000_000_000;
const CODE_MTIME = 1_800_000_000_000;
const FILE_ID = 'codeblocks.md';

// Chunks that mirror what parseFile would produce from codeblocks.md:
// Root heading (level 1), then sections with code blocks as children.
// Code blocks have a language and symbols extracted from AST.
const docChunks: Omit<DocNode, 'id' | 'kind'>[] = [
  // 0: root heading — "Code Examples"
  {
    fileId: FILE_ID, title: 'Code Examples',
    content: 'Overview of code patterns used in the project.',
    level: 1, symbols: [], mtime: DOC_MTIME,
  },
  // 1: section heading — "Authentication"
  {
    fileId: FILE_ID, title: 'Authentication',
    content: 'Here is how to create a JWT token:\n\nAnd here is the middleware:',
    level: 2, symbols: [], mtime: DOC_MTIME,
  },
  // 2: TS code block — createToken + verifyToken
  {
    fileId: FILE_ID, title: 'Authentication',
    content: `import jwt from 'jsonwebtoken';\n\ninterface TokenPayload {\n  userId: string;\n  role: string;\n}\n\nfunction createToken(payload: TokenPayload): string {\n  return jwt.sign(payload, process.env.SECRET!, { expiresIn: '15m' });\n}\n\nfunction verifyToken(token: string): TokenPayload {\n  return jwt.verify(token, process.env.SECRET!) as TokenPayload;\n}`,
    level: 3, language: 'typescript',
    symbols: ['TokenPayload', 'createToken', 'verifyToken'],
    mtime: DOC_MTIME,
  },
  // 3: TS code block — authMiddleware
  {
    fileId: FILE_ID, title: 'Authentication',
    content: `function authMiddleware(req: Request, res: Response, next: NextFunction): void {\n  const token = req.headers.authorization?.replace('Bearer ', '');\n  if (!token) { res.status(401).json({ error: 'No token' }); return; }\n  req.user = verifyToken(token);\n  next();\n}`,
    level: 3, language: 'typescript',
    symbols: ['authMiddleware', 'verifyToken'],
    mtime: DOC_MTIME,
  },
  // 4: section heading — "Database"
  {
    fileId: FILE_ID, title: 'Database',
    content: 'Setting up the database connection:',
    level: 2, symbols: [], mtime: DOC_MTIME,
  },
  // 5: JS code block — pool + query
  {
    fileId: FILE_ID, title: 'Database',
    content: `const { Pool } = require('pg');\n\nconst pool = new Pool({\n  connectionString: process.env.DATABASE_URL,\n});\n\nasync function query(text, params) {\n  const result = await pool.query(text, params);\n  return result.rows;\n}`,
    level: 3, language: 'javascript',
    symbols: ['pool', 'query'],
    mtime: DOC_MTIME,
  },
  // 6: section heading — "Configuration"
  {
    fileId: FILE_ID, title: 'Configuration',
    content: 'Example YAML config (not parsed by AST):\n\nAn untagged code block:',
    level: 2, symbols: [], mtime: DOC_MTIME,
  },
  // 7: YAML code block
  {
    fileId: FILE_ID, title: 'Configuration',
    content: 'server:\n  port: 3000\n  host: localhost\ndatabase:\n  url: postgres://localhost/mydb',
    level: 3, language: 'yaml',
    symbols: [],
    mtime: DOC_MTIME,
  },
  // 8: section heading — "API Client"
  {
    fileId: FILE_ID, title: 'API Client',
    content: '',
    level: 2, symbols: [], mtime: DOC_MTIME,
  },
  // 9: TS code block — ApiClient
  {
    fileId: FILE_ID, title: 'API Client',
    content: `class ApiClient {\n  private baseUrl: string;\n\n  constructor(baseUrl: string) {\n    this.baseUrl = baseUrl;\n  }\n\n  async get<T>(path: string): Promise<T> {\n    const res = await fetch(\`\${this.baseUrl}\${path}\`);\n    return res.json() as Promise<T>;\n  }\n}\n\nconst defaultClient = new ApiClient('https://api.example.com');`,
    level: 3, language: 'typescript',
    symbols: ['ApiClient', 'defaultClient'],
    mtime: DOC_MTIME,
  },
];

// Note: chunk indices 2,3,5,7,9 have languages — that's 5 code blocks.
// Of those, 3 are typescript (indices 2,3,9), 1 javascript (5), 1 yaml (7).
// The untagged code block from the fixture is intentionally omitted
// (no language = no snippet in the store's listSnippets).

// Code store nodes for cross-reference tests
const codeNodes: Omit<CodeNode, 'id'>[] = [
  {
    kind: 'function', fileId: 'src/auth.ts', language: 'typescript',
    name: 'verifyToken', signature: 'export function verifyToken',
    docComment: 'Verify a JWT and return the payload.',
    body: '// body of verifyToken',
    startLine: 10, endLine: 25, isExported: true, mtime: CODE_MTIME,
  },
  {
    kind: 'function', fileId: 'src/auth.ts', language: 'typescript',
    name: 'createToken', signature: 'export function createToken',
    docComment: 'Create a new JWT token.',
    body: '// body of createToken',
    startLine: 30, endLine: 45, isExported: true, mtime: CODE_MTIME,
  },
];

const codeEdges = [
  { fromName: 'auth.ts', toName: 'verifyToken', kind: 'contains' },
  { fromName: 'auth.ts', toName: 'createToken', kind: 'contains' },
];

// ---------------------------------------------------------------------------
// Embedding axes
// ---------------------------------------------------------------------------

const cbQueryAxes: Array<[string, number]> = [
  ['authentication code', 0],  // root chunk axis
  ['jwt example snippet', 2],  // first TS code block
];

const cbFakeEmbed = createFakeEmbed(cbQueryAxes);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let storeCtx: TestStoreContext;
let ctx: McpTestContext;
let call: McpTestContext['call'];

beforeAll(async () => {
  storeCtx = createTestStoreManager(cbFakeEmbed);
  const scopedStore = storeCtx.store.project(storeCtx.projectId);

  // Build embeddings map for doc chunks: fileId for file node, fileId#index for chunks
  const docEmbeddings = new Map<string, number[]>();
  docEmbeddings.set(FILE_ID, unitVec(10)); // file node embedding
  for (let i = 0; i < docChunks.length; i++) {
    docEmbeddings.set(`${FILE_ID}#${i}`, unitVec(i));
  }

  // Populate docs store
  scopedStore.docs.updateFile(FILE_ID, docChunks, DOC_MTIME, docEmbeddings);

  // Build embeddings map for code nodes
  const codeEmbeddings = new Map<string, number[]>();
  codeEmbeddings.set('src/auth.ts', unitVec(29)); // file node embedding
  codeEmbeddings.set('verifyToken', unitVec(30));
  codeEmbeddings.set('createToken', unitVec(31));

  // Populate code store
  scopedStore.code.updateFile('src/auth.ts', codeNodes, codeEdges, CODE_MTIME, codeEmbeddings);

  ctx = await setupMcpClient({ scopedStore, embedFn: cbFakeEmbed });
  call = ctx.call;
});

afterAll(async () => {
  await ctx.close();
  storeCtx.cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('code-block tools', () => {

  // -- docs_find_examples --

  describe('docs_find_examples', () => {
    it('createToken: has results, is typescript, symbols include it, parentTitle = Authentication', async () => {
      const exCreateToken = json<ExampleResult[]>(await call('docs_find_examples', { symbol: 'createToken' }));
      expect(exCreateToken.length).toBeGreaterThanOrEqual(1);
      expect(exCreateToken[0].language).toBe('typescript');
      expect(exCreateToken[0].symbols).toContain('createToken');
      expect(exCreateToken[0].parentTitle).toBe('Authentication');
    });

    it('ApiClient: has results, parent is API Client', async () => {
      const exApiClient = json<ExampleResult[]>(await call('docs_find_examples', { symbol: 'ApiClient' }));
      expect(exApiClient.length).toBeGreaterThanOrEqual(1);
      expect(exApiClient[0].parentTitle).toBe('API Client');
    });

    it('nonExistentSymbol999: returns "No code examples" message', async () => {
      const exNoneRaw = await call('docs_find_examples', { symbol: 'nonExistentSymbol999' });
      expect(text(exNoneRaw)).toContain('No code examples');
    });
  });

  // -- docs_list_snippets --

  describe('docs_list_snippets', () => {
    it('returns all 5 snippets with language', async () => {
      const res = json<{ results: SnippetEntry[]; total: number }>(await call('docs_list_snippets', { limit: 100 }));
      expect(res.results).toHaveLength(5);
      expect(res.results.some(s => s.language === 'typescript')).toBe(true);
      expect(res.results.some(s => s.symbols && s.symbols.length > 0)).toBe(true);
    });

    it('language=typescript: 3 results', async () => {
      const res = json<{ results: SnippetEntry[]; total: number }>(await call('docs_list_snippets', { language: 'typescript', limit: 100 }));
      expect(res.results).toHaveLength(3);
    });

    it('language=javascript: 1 result', async () => {
      const res = json<{ results: SnippetEntry[]; total: number }>(await call('docs_list_snippets', { language: 'javascript', limit: 100 }));
      expect(res.results).toHaveLength(1);
    });

    it('limit=2', async () => {
      const res = json<{ results: SnippetEntry[]; total: number }>(await call('docs_list_snippets', { limit: 2 }));
      expect(res.results).toHaveLength(2);
    });
  });

  // -- docs_search_snippets --

  describe('docs_search_snippets', () => {
    it('returns results with score, language, sorted by score', async () => {
      const snippetHits = json<SnippetHit[]>(await call('docs_search_snippets', { query: 'jwt example snippet', minScore: 0 }));
      expect(snippetHits.length).toBeGreaterThanOrEqual(1);
      expect(typeof snippetHits[0].score).toBe('number');
      expect(snippetHits[0].language).toBeDefined();
      expect(snippetHits.every((h, i) => i === 0 || h.score <= snippetHits[i - 1].score)).toBe(true);
    });

    it('language filter to javascript', async () => {
      const snippetHitsLang = json<SnippetHit[]>(await call('docs_search_snippets', { query: 'jwt example snippet', language: 'javascript', minScore: 0.0 }));
      // The query embedding points to a TS code block axis, but we filter to JS — so the exact match is excluded
      expect(snippetHitsLang.every(h => h.language === 'javascript')).toBe(true);
    });
  });

  // -- docs_explain_symbol --

  describe('docs_explain_symbol', () => {
    it('verifyToken: codeBlock has symbol, is typescript, explanation has title Authentication', async () => {
      const explainVT = json<ExplainResult[]>(await call('docs_explain_symbol', { symbol: 'verifyToken' }));
      expect(explainVT.length).toBeGreaterThanOrEqual(1);
      expect(explainVT[0].codeBlock.symbols).toContain('verifyToken');
      expect(explainVT[0].codeBlock.language).toBe('typescript');
      expect(explainVT[0].explanation).not.toBeNull();
      expect(explainVT[0].explanation!.title).toBe('Authentication');
    });

    it('noSuchSymbol: returns "No documentation" message', async () => {
      const explainNoneRaw = await call('docs_explain_symbol', { symbol: 'noSuchSymbol' });
      expect(text(explainNoneRaw)).toContain('No documentation');
    });
  });

  // -- docs_cross_references --

  describe('docs_cross_references', () => {
    it('verifyToken: definitions from code graph, examples from docs, documentation sections', async () => {
      const xrefVT = json<CrossRefResult>(await call('docs_cross_references', { symbol: 'verifyToken' }));
      expect(xrefVT.definitions.length).toBeGreaterThanOrEqual(1);
      expect(xrefVT.definitions[0].fileId).toBe('src/auth.ts');
      expect(xrefVT.definitions[0].kind).toBe('function');
      expect(xrefVT.examples.length).toBeGreaterThanOrEqual(1);
      expect(xrefVT.documentation.length).toBeGreaterThanOrEqual(1);
      expect(xrefVT.documentation[0].title).toBe('Authentication');
    });

    it('createToken: defs from code, examples in docs', async () => {
      const xrefCT = json<CrossRefResult>(await call('docs_cross_references', { symbol: 'createToken' }));
      expect(xrefCT.definitions.length).toBeGreaterThanOrEqual(1);
      expect(xrefCT.examples.length).toBeGreaterThanOrEqual(1);
    });

    it('completelyUnknownXyz: returns "No references" message', async () => {
      const xrefNoneRaw = await call('docs_cross_references', { symbol: 'completelyUnknownXyz' });
      expect(text(xrefNoneRaw)).toContain('No references');
    });

    it('auth.ts (file name): findByName excludes file nodes, returns "No references"', async () => {
      // CodeStore.findByName excludes kind='file', so a file name lookup returns no definitions
      const xrefNoneRaw = await call('docs_cross_references', { symbol: 'auth.ts' });
      expect(text(xrefNoneRaw)).toContain('No references');
    });
  });
});
