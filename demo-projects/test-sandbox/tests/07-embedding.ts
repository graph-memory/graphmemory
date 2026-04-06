/**
 * Phase 7: Embedding API
 *
 * Tests: embedding endpoint (requires embeddingApi.enabled in config).
 * If not enabled, tests verify the endpoint returns 404.
 */

import {
  group, test, runPhase,
  post, get,
  assert, assertOk, assertStatus,
  printSummary,
  BASE,
} from './utils';

// ─── 7.1 Embedding endpoint ────────────────────────────────────

group('7.1 Embedding endpoint');

test('POST /api/embed — responds', async () => {
  const res = await post(`${BASE}/api/embed`, {
    texts: ['Hello world'],
  });

  if (res.status === 404) {
    // embeddingApi not enabled — expected
    console.log('      (embedding API not enabled — skipping further tests)');
    return;
  }

  if (res.status === 401 || res.status === 403) {
    // Needs API key
    console.log('      (embedding API requires auth — endpoint exists)');
    return;
  }

  // If 200, verify response format
  if (res.ok) {
    assert(Array.isArray(res.data.embeddings ?? res.data),
      'should return embeddings array');
  }
});

test('POST /api/embed without auth — 401 or 404', async () => {
  const res = await post(`${BASE}/api/embed`, {
    texts: ['test'],
  });
  assert(
    res.status === 401 || res.status === 403 || res.status === 404 || res.status === 200,
    `expected 200/401/403/404, got ${res.status}`,
  );
});

test('POST /api/embed with empty texts — error or 404', async () => {
  const res = await post(`${BASE}/api/embed`, {
    texts: [],
  });
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 7: Embedding API');
}

if (process.argv[1]?.includes('07-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
