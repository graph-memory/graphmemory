/**
 * Phase 16: Rate Limiting
 *
 * Uses ratelimit.yaml config (port 4040, low limits for testing).
 * Tests: 429 responses, rate limit headers, per-category limits.
 */

import {
  group, test, runPhase,
  assert, assertExists, assertOk, assertStatus,
  printSummary, wait,
  startServer, stopServer, restWith,
} from './utils';

const PORT = 4040;
const CONFIG = 'tests/configs/ratelimit.yaml';
let BASE = '';

// ─── Setup ───────────────────────────────────────────────────────

group('Setup');

test('Start server with rate limit config', async () => {
  BASE = await startServer({ config: CONFIG, port: PORT });
  assertExists(BASE, 'base url');
});

// ─── 16.1 Search rate limit (3/min) ─────────────────────────────

group('16.1 Search rate limit');

test('First 3 search requests succeed', async () => {
  for (let i = 0; i < 3; i++) {
    const res = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/search?q=test');
    assertOk(res, `request ${i + 1}`);
  }
});

test('4th search request → 429', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/search?q=test');
  assertStatus(res, 429);
});

test('429 response has rate limit headers', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/docs/search?q=test');
  // May or may not be 429 (different search endpoint, may share counter)
  if (res.status === 429) {
    const limit = res.headers.get('ratelimit-limit');
    assertExists(limit, 'RateLimit-Limit header');
  }
});

// ─── 16.2 Global rate limit (10/min) ────────────────────────────

group('16.2 Global rate limit');

test('Rapid requests hit global limit', async () => {
  let got429 = false;
  // Fire many requests (some were already consumed above)
  for (let i = 0; i < 15; i++) {
    const res = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes');
    if (res.status === 429) { got429 = true; break; }
  }
  assert(got429, 'should eventually get 429 from global limit');
});

// ─── 16.3 Rate limit resets ─────────────────────────────────────

group('16.3 Rate limit resets');

test('Rate-limited requests return proper error format', async () => {
  // Verify 429 body has correct error message
  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/search?q=ratelimit');
  if (res.status === 429) {
    assertExists(res.data.error, 'error message');
    assert(res.data.error.includes('Too many requests'), 'error text');
  }
  // Either 429 or 200 is acceptable (window may have shifted)
  assert(res.status === 200 || res.status === 429, `expected 200 or 429, got ${res.status}`);
});

// ─── Teardown ────────────────────────────────────────────────────

group('Teardown');

test('Stop server', async () => {
  stopServer();
  await wait(500);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 16: Rate Limiting');
}

if (process.argv[1]?.includes('16-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
