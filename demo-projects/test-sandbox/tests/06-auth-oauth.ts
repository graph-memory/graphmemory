/**
 * Phase 6: Auth & OAuth
 *
 * Tests: auth status, login/logout/refresh, API key auth, OAuth flow.
 *
 * NOTE: This phase tests auth in the CURRENT server config (defaultAccess: rw, no users).
 * For full auth testing, a separate server config with users/jwtSecret is needed.
 * The tests below verify the endpoints respond correctly in both modes.
 */

import {
  group, test, runPhase,
  get, post,
  assert, assertEqual, assertExists, assertOk, assertStatus,
  printSummary, runStandalone,
  BASE,
} from './utils';

// ─── 6.1 Auth status (no auth configured) ──────────────────────

group('6.1 Auth status (no auth)');

test('GET /api/auth/status — required: false', async () => {
  const res = await get('/api/auth/status');
  assertOk(res);
  assertEqual(res.data.required, false, 'auth not required');
});

test('GET /api/auth/apikey — works or returns appropriate error', async () => {
  const res = await get('/api/auth/apikey');
  // Without auth, may return 401 or empty — just verify no crash
  assert(res.status === 200 || res.status === 400 || res.status === 401 || res.status === 403,
    `expected 200/400/401/403, got ${res.status}`);
});

// ─── 6.2 Auth endpoints exist ───────────────────────────────────

group('6.2 Auth endpoints respond');

test('POST /api/auth/login — responds (no users configured)', async () => {
  const res = await post('/api/auth/login', {
    email: 'test@test.com',
    password: 'wrong',
  });
  // Should return 400/401/404 — just not 500
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('POST /api/auth/refresh — responds', async () => {
  const res = await post('/api/auth/refresh');
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('POST /api/auth/logout — responds', async () => {
  const res = await post('/api/auth/logout');
  // Logout should work even without session
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

// ─── 6.3 OAuth endpoints respond ────────────────────────────────

group('6.3 OAuth endpoints respond');

test('GET /.well-known/oauth-authorization-server', async () => {
  const res = await get(`${BASE}/.well-known/oauth-authorization-server`);
  // May return 200 with manifest or 404 if OAuth disabled
  assert(res.status === 200 || res.status === 404,
    `expected 200/404, got ${res.status}`);
});

test('POST /api/oauth/authorize — responds', async () => {
  const res = await post('/api/oauth/authorize', {
    response_type: 'code',
    client_id: 'test-client',
    redirect_uri: 'http://localhost:3000/callback',
    code_challenge: 'test',
    code_challenge_method: 'S256',
    state: 'test-state',
  });
  // May fail if OAuth not enabled, but should not 500
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('POST /api/oauth/token — responds', async () => {
  const res = await post('/api/oauth/token', {
    grant_type: 'authorization_code',
    code: 'invalid-code',
    client_id: 'test-client',
    redirect_uri: 'http://localhost:3000/callback',
    code_verifier: 'test',
  });
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('GET /api/oauth/userinfo — responds', async () => {
  const res = await get('/api/oauth/userinfo');
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('POST /api/oauth/introspect — responds', async () => {
  const res = await post('/api/oauth/introspect', { token: 'invalid-token' });
  assert(res.status < 500, `should not 500, got ${res.status}`);
  // Invalid token should return active: false
  if (res.status === 200) {
    assertEqual(res.data.active, false, 'invalid token should be inactive');
  }
});

test('POST /api/oauth/revoke — responds', async () => {
  const res = await post('/api/oauth/revoke', { token: 'invalid-token' });
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('POST /api/oauth/end-session — responds', async () => {
  const res = await post('/api/oauth/end-session');
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

// ─── 6.4 Bearer auth (no auth configured = open access) ────────

group('6.4 Bearer auth');

test('Request without auth succeeds (defaultAccess: rw)', async () => {
  const res = await get('/api/projects');
  assertOk(res);
});

test('Request with fake Bearer token still works (no auth required)', async () => {
  const url = `${BASE}/api/projects`;
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer fake-key' },
  });
  // Should be 200 when no auth configured, or 401 with auth
  assert(res.status === 200 || res.status === 401,
    `expected 200/401, got ${res.status}`);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 6: Auth & OAuth');
}

if (process.argv[1]?.includes('06-')) {
  runStandalone(run);
}
