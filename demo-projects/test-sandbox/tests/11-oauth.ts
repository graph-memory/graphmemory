/**
 * Phase 11: OAuth 2.0 PKCE Flow
 *
 * Uses auth.yaml config (port 3838, oauth enabled).
 * Tests: discovery, authorize, token exchange, userinfo, introspect, revoke.
 */

import {
  group, test, runPhase,
  assert, assertEqual, assertExists, assertOk, assertStatus,
  printSummary, wait,
  startServer, stopServer, restWith, getCookies, cookieHeader,
} from './utils';
import { createHash, randomBytes } from 'crypto';

const PORT = 3838;
const CONFIG = 'tests/configs/auth.yaml';
let BASE = '';

let adminCookies: Record<string, string> = {};
let authCode = '';
let accessToken = '';
let refreshToken = '';
const codeVerifier = randomBytes(32).toString('base64url');
const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

// ─── Setup ───────────────────────────────────────────────────────

group('Setup');

test('Start server with OAuth config', async () => {
  BASE = await startServer({ config: CONFIG, port: PORT });
  assertExists(BASE, 'base url');
});

test('Login as admin to get session', async () => {
  const res = await restWith(BASE, 'POST', '/api/auth/login', {
    email: 'admin@test.dev',
    password: 'admin-pass',
  });
  assertOk(res);
  adminCookies = getCookies(res);
});

// ─── 11.1 Discovery ─────────────────────────────────────────────

group('11.1 OAuth discovery');

test('GET /.well-known/oauth-authorization-server — returns manifest', async () => {
  const res = await restWith(BASE, 'GET', '/.well-known/oauth-authorization-server');
  assertOk(res);
  assertExists(res.data.issuer, 'issuer');
  assertExists(res.data.token_endpoint, 'token_endpoint');
  assertExists(res.data.authorization_endpoint, 'authorization_endpoint');
});

// ─── 11.2 Authorization ─────────────────────────────────────────

group('11.2 Authorization');

test('POST /api/oauth/authorize — get auth code', async () => {
  const res = await restWith(BASE, 'POST', '/api/oauth/authorize', {
    response_type: 'code',
    client_id: 'test-client',
    redirect_uri: 'http://localhost:9999/callback',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: 'test-state-123',
  }, { cookie: cookieHeader(adminCookies) });
  assertOk(res);
  assertExists(res.data.redirectUrl, 'redirectUrl');

  // Extract code from redirect URL
  const url = new URL(res.data.redirectUrl);
  authCode = url.searchParams.get('code') ?? '';
  assertExists(authCode, 'auth code');
  assertEqual(url.searchParams.get('state'), 'test-state-123', 'state');
});

test('POST /api/oauth/authorize without session → error', async () => {
  const res = await restWith(BASE, 'POST', '/api/oauth/authorize', {
    response_type: 'code',
    client_id: 'test-client',
    redirect_uri: 'http://localhost:9999/callback',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  assert(res.status >= 400, 'should fail without session');
});

// ─── 11.3 Token exchange ────────────────────────────────────────

group('11.3 Token exchange');

test('POST /api/oauth/token — exchange code for tokens', async () => {
  const res = await restWith(BASE, 'POST', '/api/oauth/token', {
    grant_type: 'authorization_code',
    code: authCode,
    client_id: 'test-client',
    redirect_uri: 'http://localhost:9999/callback',
    code_verifier: codeVerifier,
  });
  assertOk(res);
  assertExists(res.data.access_token, 'access_token');
  assertExists(res.data.refresh_token, 'refresh_token');
  assertEqual(res.data.token_type, 'bearer', 'token_type');
  assert(res.data.expires_in > 0, 'expires_in should be positive');
  accessToken = res.data.access_token;
  refreshToken = res.data.refresh_token;
});

test('POST /api/oauth/token — reuse code → error', async () => {
  const res = await restWith(BASE, 'POST', '/api/oauth/token', {
    grant_type: 'authorization_code',
    code: authCode,
    client_id: 'test-client',
    redirect_uri: 'http://localhost:9999/callback',
    code_verifier: codeVerifier,
  });
  assert(res.status >= 400, 'code should be single-use');
});

test('POST /api/oauth/token — wrong verifier → error', async () => {
  // Get a new code first
  const authRes = await restWith(BASE, 'POST', '/api/oauth/authorize', {
    response_type: 'code',
    client_id: 'test-client',
    redirect_uri: 'http://localhost:9999/callback',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }, { cookie: cookieHeader(adminCookies) });
  assertOk(authRes);
  const url = new URL(authRes.data.redirectUrl);
  const newCode = url.searchParams.get('code');

  const res = await restWith(BASE, 'POST', '/api/oauth/token', {
    grant_type: 'authorization_code',
    code: newCode,
    client_id: 'test-client',
    redirect_uri: 'http://localhost:9999/callback',
    code_verifier: 'wrong-verifier-value',
  });
  assert(res.status >= 400, 'wrong verifier should fail');
});

// ─── 11.4 Userinfo ──────────────────────────────────────────────

group('11.4 Userinfo');

test('GET /api/oauth/userinfo with access token', async () => {
  const res = await restWith(BASE, 'GET', '/api/oauth/userinfo',
    undefined, { bearer: accessToken });
  assertOk(res);
  assertEqual(res.data.sub, 'admin', 'sub');
  assertExists(res.data.name, 'name');
  assertExists(res.data.email, 'email');
});

test('GET /api/oauth/userinfo without token → 401', async () => {
  const res = await restWith(BASE, 'GET', '/api/oauth/userinfo');
  assertStatus(res, 401);
});

// ─── 11.5 Token introspection ───────────────────────────────────

group('11.5 Token introspection');

test('POST /api/oauth/introspect — valid token', async () => {
  const res = await restWith(BASE, 'POST', '/api/oauth/introspect',
    { token: accessToken });
  assertOk(res);
  assertEqual(res.data.active, true, 'token active');
  assertEqual(res.data.sub, 'admin', 'sub');
});

test('POST /api/oauth/introspect — invalid token', async () => {
  const res = await restWith(BASE, 'POST', '/api/oauth/introspect',
    { token: 'invalid-token-value' });
  assertOk(res);
  assertEqual(res.data.active, false, 'invalid token inactive');
});

// ─── 11.6 Token refresh ─────────────────────────────────────────

group('11.6 Token refresh');

test('POST /api/oauth/token — refresh grant', async () => {
  const res = await restWith(BASE, 'POST', '/api/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: 'test-client',
  });
  assertOk(res);
  assertExists(res.data.access_token, 'new access_token');
  assertExists(res.data.refresh_token, 'new refresh_token');
});

// ─── 11.7 Revoke & end-session ──────────────────────────────────

group('11.7 Revoke & end-session');

test('POST /api/oauth/revoke — returns 200', async () => {
  const res = await restWith(BASE, 'POST', '/api/oauth/revoke',
    { token: accessToken });
  assertOk(res);
});

test('POST /api/oauth/end-session — returns 200', async () => {
  const res = await restWith(BASE, 'POST', '/api/oauth/end-session');
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
  return runPhase('Phase 11: OAuth 2.0 PKCE Flow');
}

if (process.argv[1]?.includes('11-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
