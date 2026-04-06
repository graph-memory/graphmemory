/**
 * Phase 12: Embedding API
 *
 * Uses embedding.yaml config (port 3939, embeddingApi enabled).
 * Tests: embed texts, auth, limits, response format.
 */

import {
  group, test, runPhase,
  assert, assertEqual, assertExists, assertOk, assertStatus,
  printSummary, wait,
  startServer, stopServer, restWith,
} from './utils';

const PORT = 3939;
const CONFIG = 'tests/configs/embedding.yaml';
let BASE = '';
const EMB_KEY = 'emb-test-key-789';

// ─── Setup ───────────────────────────────────────────────────────

group('Setup');

test('Start server with embedding config', async () => {
  BASE = await startServer({ config: CONFIG, port: PORT });
  assertExists(BASE, 'base url');
});

// ─── 12.1 Basic embedding ───────────────────────────────────────

group('12.1 Basic embedding');

test('POST /api/embed with valid key + texts → returns embeddings', async () => {
  const res = await restWith(BASE, 'POST', '/api/embed',
    { texts: ['Hello world', 'Test embedding'] },
    { bearer: EMB_KEY },
  );
  assertOk(res);
  const embeddings = res.data.embeddings ?? res.data;
  assert(Array.isArray(embeddings), 'embeddings should be array');
  assertEqual(embeddings.length, 2, 'should return 2 embeddings');
  assert(Array.isArray(embeddings[0]), 'each embedding should be array of numbers');
  assert(embeddings[0].length > 0, 'embedding should have dimensions');
});

test('POST /api/embed — single text', async () => {
  const res = await restWith(BASE, 'POST', '/api/embed',
    { texts: ['single'] },
    { bearer: EMB_KEY },
  );
  assertOk(res);
  const embeddings = res.data.embeddings ?? res.data;
  assertEqual(embeddings.length, 1, 'should return 1 embedding');
});

// ─── 12.2 Auth ──────────────────────────────────────────────────

group('12.2 Auth');

test('POST /api/embed without apiKey → 401', async () => {
  const res = await restWith(BASE, 'POST', '/api/embed',
    { texts: ['test'] },
  );
  assertStatus(res, 401);
});

test('POST /api/embed with wrong apiKey → 401', async () => {
  const res = await restWith(BASE, 'POST', '/api/embed',
    { texts: ['test'] },
    { bearer: 'wrong-key' },
  );
  assertStatus(res, 401);
});

// ─── 12.3 Limits ────────────────────────────────────────────────

group('12.3 Limits');

test('POST /api/embed with too many texts → 400', async () => {
  const texts = Array.from({ length: 20 }, (_, i) => `text ${i}`); // maxTexts is 10
  const res = await restWith(BASE, 'POST', '/api/embed',
    { texts },
    { bearer: EMB_KEY },
  );
  assertStatus(res, 400);
});

test('POST /api/embed with empty texts array → 400', async () => {
  const res = await restWith(BASE, 'POST', '/api/embed',
    { texts: [] },
    { bearer: EMB_KEY },
  );
  assertStatus(res, 400);
});

test('POST /api/embed with text exceeding maxTextChars → 400', async () => {
  const longText = 'a'.repeat(6000); // maxTextChars is 5000
  const res = await restWith(BASE, 'POST', '/api/embed',
    { texts: [longText] },
    { bearer: EMB_KEY },
  );
  assertStatus(res, 400);
});

// ─── 12.4 Response format ───────────────────────────────────────

group('12.4 Response format');

test('Embeddings are normalized float arrays', async () => {
  const res = await restWith(BASE, 'POST', '/api/embed',
    { texts: ['test normalization'] },
    { bearer: EMB_KEY },
  );
  assertOk(res);
  const emb = (res.data.embeddings ?? res.data)[0];
  // Check all values are finite numbers
  for (const v of emb) {
    assert(typeof v === 'number' && isFinite(v), 'values should be finite numbers');
  }
  // Check roughly normalized (L2 norm ≈ 1)
  const norm = Math.sqrt(emb.reduce((s: number, v: number) => s + v * v, 0));
  assert(norm > 0.9 && norm < 1.1, `norm should be ~1, got ${norm.toFixed(3)}`);
});

// ─── Teardown ────────────────────────────────────────────────────

group('Teardown');

test('Stop server', async () => {
  stopServer();
  await wait(500);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 12: Embedding API');
}

if (process.argv[1]?.includes('12-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
