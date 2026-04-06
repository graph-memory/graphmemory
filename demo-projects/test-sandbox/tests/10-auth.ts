/**
 * Phase 10: Authentication & Access Control
 *
 * Uses auth.yaml config (port 3838, defaultAccess: deny, 2 users).
 * Tests: login, JWT cookies, apikey bearer, ACL deny/r/rw, refresh, logout.
 */

import {
  group, test, runPhase,
  assert, assertEqual, assertExists, assertOk, assertStatus,
  printSummary, wait,
  startServer, stopServer, restWith, getCookies, cookieHeader,
} from './utils';

const PORT = 3838;
const CONFIG = 'tests/configs/auth.yaml';
let BASE = '';

const ADMIN_KEY = 'mgm-test-admin-key-123';
const READER_KEY = 'mgm-test-reader-key-456';

let adminCookies: Record<string, string> = {};
let readerCookies: Record<string, string> = {};

// ─── Setup ───────────────────────────────────────────────────────

group('Setup');

test('Start server with auth config', async () => {
  BASE = await startServer({ config: CONFIG, port: PORT });
  assertExists(BASE, 'base url');
});

// ─── 10.1 Auth status ────────────────────────────────────────────

group('10.1 Auth status');

test('GET /api/auth/status — required: true', async () => {
  const res = await restWith(BASE, 'GET', '/api/auth/status');
  assertOk(res);
  assertEqual(res.data.required, true, 'auth required');
  assertEqual(res.data.authenticated, false, 'not authenticated');
});

// ─── 10.2 Unauthenticated access denied ─────────────────────────

group('10.2 Unauthenticated access denied');

test('GET /api/projects without auth → 401', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects');
  assertStatus(res, 401);
});

test('GET /api/projects/sandbox/knowledge/notes without auth → 401', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes');
  assertStatus(res, 401);
});

// ─── 10.3 Bearer API key auth ───────────────────────────────────

group('10.3 Bearer API key auth');

test('GET /api/projects with admin apiKey → 200', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects', undefined, { bearer: ADMIN_KEY });
  assertOk(res);
  const projects = res.data.results ?? res.data;
  assert(Array.isArray(projects), 'projects should be array');
});

test('GET /api/projects with reader apiKey → 200', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects', undefined, { bearer: READER_KEY });
  assertOk(res);
});

test('GET /api/projects with invalid apiKey → 401', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects', undefined, { bearer: 'mgm-invalid-key' });
  assertStatus(res, 401);
});

// ─── 10.4 ACL — admin (rw) vs reader (r) ───────────────────────

group('10.4 ACL — admin rw vs reader r');

test('Admin can create note (rw)', async () => {
  const res = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'Admin Note', content: 'Created by admin.', tags: ['auth-test'] },
    { bearer: ADMIN_KEY },
  );
  assertOk(res);
  assertExists(res.data.id, 'noteId');
  // Cleanup
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${res.data.id}`,
    undefined, { bearer: ADMIN_KEY });
});

test('Reader cannot create note (r only) → 403', async () => {
  const res = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'Reader Note', content: 'Should fail.' },
    { bearer: READER_KEY },
  );
  assertStatus(res, 403);
});

test('Reader can list notes (r)', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes',
    undefined, { bearer: READER_KEY });
  assertOk(res);
});

test('Reader can search notes (r)', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/search?q=test',
    undefined, { bearer: READER_KEY });
  assertOk(res);
});

// ─── 10.5 JWT cookie login ──────────────────────────────────────

group('10.5 JWT cookie login');

test('POST /api/auth/login with valid admin credentials', async () => {
  const res = await restWith(BASE, 'POST', '/api/auth/login', {
    email: 'admin@test.dev',
    password: 'admin-pass',
  });
  assertOk(res);
  assertExists(res.data.userId, 'userId');
  adminCookies = getCookies(res);
  assertExists(adminCookies['mgm_access'], 'access cookie');
  assertExists(adminCookies['mgm_refresh'], 'refresh cookie');
});

test('POST /api/auth/login with wrong password → 401', async () => {
  const res = await restWith(BASE, 'POST', '/api/auth/login', {
    email: 'admin@test.dev',
    password: 'wrong-password',
  });
  assertStatus(res, 401);
});

test('POST /api/auth/login with non-existent email → 401', async () => {
  const res = await restWith(BASE, 'POST', '/api/auth/login', {
    email: 'nobody@test.dev',
    password: 'whatever',
  });
  assertStatus(res, 401);
});

test('Request with JWT cookie succeeds', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects',
    undefined, { cookie: cookieHeader(adminCookies) });
  assertOk(res);
});

test('GET /api/auth/status with cookie — authenticated: true', async () => {
  const res = await restWith(BASE, 'GET', '/api/auth/status',
    undefined, { cookie: cookieHeader(adminCookies) });
  assertOk(res);
  assertEqual(res.data.authenticated, true, 'authenticated');
  assertEqual(res.data.userId, 'admin', 'userId');
});

test('GET /api/auth/apikey with cookie — returns apiKey', async () => {
  const res = await restWith(BASE, 'GET', '/api/auth/apikey',
    undefined, { cookie: cookieHeader(adminCookies) });
  assertOk(res);
  assertEqual(res.data.apiKey, ADMIN_KEY, 'apiKey');
});

// ─── 10.6 Reader login + ACL via cookie ─────────────────────────

group('10.6 Reader login + ACL via cookie');

test('Login as reader', async () => {
  const res = await restWith(BASE, 'POST', '/api/auth/login', {
    email: 'reader@test.dev',
    password: 'reader-pass',
  });
  assertOk(res);
  readerCookies = getCookies(res);
  assertExists(readerCookies['mgm_access'], 'access cookie');
});

test('Reader cookie — can list but not create', async () => {
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes',
    undefined, { cookie: cookieHeader(readerCookies) });
  assertOk(listRes);

  const createRes = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'Fail', content: 'x' },
    { cookie: cookieHeader(readerCookies) });
  assertStatus(createRes, 403);
});

// ─── 10.7 Refresh token ─────────────────────────────────────────

group('10.7 Refresh token');

test('POST /api/auth/refresh — new access token', async () => {
  const res = await restWith(BASE, 'POST', '/api/auth/refresh',
    undefined, { cookie: cookieHeader(adminCookies) });
  assertOk(res);
  const newCookies = getCookies(res);
  // Should get new access token
  if (newCookies['mgm_access']) {
    adminCookies['mgm_access'] = newCookies['mgm_access'];
  }
});

test('POST /api/auth/refresh without cookie → error', async () => {
  const res = await restWith(BASE, 'POST', '/api/auth/refresh');
  assert(res.status >= 400, 'should fail without cookie');
});

// ─── 10.8 Logout ─────────────────────────────────────────────────

group('10.8 Logout');

test('POST /api/auth/logout — clears cookies', async () => {
  const res = await restWith(BASE, 'POST', '/api/auth/logout',
    undefined, { cookie: cookieHeader(adminCookies) });
  assertOk(res);
});

// ─── Teardown ────────────────────────────────────────────────────

group('Teardown');

test('Stop server', async () => {
  stopServer();
  await wait(500);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 10: Authentication & Access Control');
}

if (process.argv[1]?.includes('10-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
