/**
 * E2e search quality tests — uses real embedding model.
 * Excluded from Jest (slow). Run with: npx tsx src/tests/search-quality.test.ts
 *
 * Tests that search_code and search (docs) return relevant results
 * with real embeddings, not fake [0,0,...] vectors.
 */
import { loadModel, embed, embedBatch, embedQuery, cosineSimilarity } from '@/lib/embedder';
import { createCodeGraph } from '@/graphs/code-types';
import type { CodeNodeAttributes } from '@/graphs/code-types';
import { updateCodeFile } from '@/graphs/code';
import { searchCode } from '@/lib/search/code';
import { BM25Index } from '@/lib/search/bm25';
import type { ModelConfig, EmbeddingConfig } from '@/lib/multi-config';

const MODEL: ModelConfig = {
  name: 'Xenova/bge-m3',
  pooling: 'cls',
  normalize: true,
  queryPrefix: '',
  documentPrefix: '',
};

const EMBEDDING: EmbeddingConfig = {
  batchSize: 32,
  maxChars: 4000,
  cacheSize: 10_000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(fileId: string, name: string, kind: string, signature: string, docComment: string, body: string, embedding: number[]) {
  return {
    id: `${fileId}::${name}`,
    attrs: {
      kind, fileId, name, signature, docComment, body,
      startLine: 1, endLine: 10, isExported: true,
      embedding, fileEmbedding: [], mtime: 1000,
    } as CodeNodeAttributes,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run() {
  console.log('Loading model...');
  await loadModel(MODEL, EMBEDDING, './models');
  console.log('Model loaded.\n');

  const graph = createCodeGraph();
  const bm25 = new BM25Index<CodeNodeAttributes>((a) => `${a.name} ${a.signature} ${a.docComment} ${a.body}`);

  // Build test symbols with real embeddings
  const symbols = [
    { file: 'auth.ts', name: 'hashPassword', sig: 'async function hashPassword(password: string): Promise<string>', doc: '/** Hash a password using scrypt. */', body: 'return scrypt(password, salt, 64)' },
    { file: 'auth.ts', name: 'verifyToken', sig: 'function verifyToken(token: string): Claims', doc: '/** Verify a JWT token and return claims. */', body: 'return jwt.verify(token, secret)' },
    { file: 'db.ts', name: 'connect', sig: 'async function connect(url: string): Promise<Connection>', doc: '/** Connect to PostgreSQL database. */', body: 'return new Pool({ connectionString: url })' },
    { file: 'db.ts', name: 'migrate', sig: 'async function migrate(dir: string): Promise<void>', doc: '/** Run database migration scripts from directory. */', body: 'for (const file of files) await exec(file)' },
    { file: 'search.ts', name: 'searchUsers', sig: 'function searchUsers(query: string): User[]', doc: '/** Search users by name or email. */', body: 'return users.filter(u => u.name.includes(query))' },
    { file: 'config.ts', name: 'loadConfig', sig: 'function loadConfig(path: string): Config', doc: '/** Load YAML configuration file. */', body: 'return yaml.parse(fs.readFileSync(path))' },
  ];

  console.log('Embedding symbols...');
  const inputs = symbols.map(s => ({ title: s.sig, content: s.doc }));
  const embeddings = await embedBatch(inputs);

  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i];
    const node = makeNode(s.file, s.name, 'function', s.sig, s.doc, s.body, embeddings[i]);
    graph.addNode(node.id, node.attrs);
    graph.addNode(s.file, { kind: 'file', fileId: s.file, name: s.file, signature: s.file, docComment: '', body: '', startLine: 1, endLine: 1, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000 } as CodeNodeAttributes);
    if (!graph.hasEdge(s.file, node.id)) {
      graph.addEdgeWithKey(`${s.file}→${node.id}`, s.file, node.id, { kind: 'contains' });
    }
    bm25.addDocument(node.id, node.attrs);
  }

  // Test cases: query → expected top result name
  const tests = [
    { query: 'password hashing', expected: 'hashPassword' },
    { query: 'JWT token verification', expected: 'verifyToken' },
    { query: 'database connection', expected: 'connect' },
    { query: 'run migrations', expected: 'migrate' },
    { query: 'find users', expected: 'searchUsers' },
    { query: 'load yaml config', expected: 'loadConfig' },
  ];

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const queryEmb = await embedQuery(t.query);
    const results = searchCode(graph, queryEmb, {
      topK: 3,
      bfsDepth: 0,
      minScore: 0.1,
      queryText: t.query,
      bm25Index: bm25,
    });

    const topName = results[0]?.name ?? '(none)';
    const ok = topName === t.expected;
    const icon = ok ? '✓' : '✗';
    console.log(`  ${icon} "${t.query}" → ${topName} (expected ${t.expected}, score=${results[0]?.score.toFixed(3) ?? 'n/a'})`);

    if (ok) passed++;
    else failed++;
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${tests.length}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
