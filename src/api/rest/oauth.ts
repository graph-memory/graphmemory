import crypto from 'crypto';
import express from 'express';
import { signOAuthToken, signOAuthRefreshToken, parseTtl, verifyToken, getAccessToken } from '@/lib/jwt';
import { resolveUserFromApiKey } from '@/lib/access';
import type { UserConfig, ServerConfig } from '@/lib/multi-config';
import { MemorySessionStore, type SessionStore } from '@/lib/session-store';

function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const computed = hash.toString('base64url');
  const computedBuf = Buffer.from(computed);
  const challengeBuf = Buffer.from(codeChallenge);
  if (computedBuf.length !== challengeBuf.length) return false;
  return crypto.timingSafeEqual(computedBuf, challengeBuf);
}

function issueTokenPair(userId: string, jwtSecret: string, accessTtl: string, refreshTtl: string): object {
  const accessToken = signOAuthToken(userId, jwtSecret, accessTtl);
  const refreshToken = signOAuthRefreshToken(userId, jwtSecret, refreshTtl);
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: parseTtl(accessTtl),
    refresh_token: refreshToken,
    refresh_token_expires_in: parseTtl(refreshTtl),
  };
}

/**
 * Create an Express router with OAuth 2.0 endpoints.
 *
 * Endpoints:
 *   GET  /.well-known/oauth-authorization-server  — RFC 8414 discovery
 *   POST /api/oauth/authorize                     — issue auth code (session cookie required)
 *   POST /api/oauth/token                         — client_credentials, authorization_code, refresh_token grants
 *   GET  /api/oauth/userinfo                      — user info from Bearer token
 *   POST /api/oauth/introspect                    — RFC 7662 token introspection
 *   POST /api/oauth/revoke                        — token revocation (stub)
 *   POST /api/oauth/end-session                   — end session (stub)
 */
export function createOAuthRouter(
  users: Record<string, UserConfig>,
  serverConfig?: ServerConfig,
  sessionStore?: SessionStore,
): express.Router {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());
  const hasUsers = Object.keys(users).length > 0;
  const jwtSecret = serverConfig?.jwtSecret;
  const oauthCfg = serverConfig?.oauth;
  const accessTtl = oauthCfg?.accessTokenTtl ?? '1h';
  const refreshTtl = oauthCfg?.refreshTokenTtl ?? '7d';
  const authCodeTtlS = oauthCfg?.authCodeTtl ? parseTtl(oauthCfg.authCodeTtl) : 600;
  const allowedRedirectUris = oauthCfg?.allowedRedirectUris ?? [];
  const store = sessionStore ?? new MemorySessionStore();

  // RFC 8414 — OAuth Authorization Server Metadata
  router.get('/.well-known/oauth-authorization-server', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
    const base = `${proto}://${req.get('host')}`;
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/ui/auth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      userinfo_endpoint: `${base}/api/oauth/userinfo`,
      introspection_endpoint: `${base}/api/oauth/introspect`,
      revocation_endpoint: `${base}/api/oauth/revoke`,
      end_session_endpoint: `${base}/api/oauth/end-session`,
      grant_types_supported: ['client_credentials', 'authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    });
  });

  // Session-aware authorize — frontend POSTs here after user consents
  router.post('/api/oauth/authorize', async (req, res) => {
    if (!hasUsers || !jwtSecret) {
      res.status(400).json({ error: 'server_error', error_description: 'OAuth not configured' });
      return;
    }

    const { response_type, client_id, redirect_uri, code_challenge, code_challenge_method, state } =
      req.body as Record<string, string | undefined>;

    if (response_type !== 'code' || !client_id || !redirect_uri || !code_challenge || code_challenge_method !== 'S256') {
      res.status(400).json({ error: 'invalid_request', error_description: 'Missing or invalid OAuth parameters' });
      return;
    }

    if (allowedRedirectUris.length > 0 && !allowedRedirectUris.some(u => redirect_uri.startsWith(u))) {
      res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri not allowed' });
      return;
    }

    // Check session cookie
    const accessToken = getAccessToken(req);
    const payload = accessToken ? verifyToken(accessToken, jwtSecret) : null;

    if (!payload || (payload.type !== 'access' && payload.type !== 'oauth_access')) {
      res.status(401).json({ error: 'login_required', error_description: 'User session required' });
      return;
    }

    // Issue authorization code and store in session store
    const code = crypto.randomBytes(32).toString('base64url');
    await store.set(`authcode:${code}`, JSON.stringify({
      userId: payload.userId,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
    }), authCodeTtlS);

    const callbackParams = new URLSearchParams({ code });
    if (state) callbackParams.set('state', state);
    res.json({ redirectUrl: `${redirect_uri}?${callbackParams.toString()}` });
  });

  // Userinfo — returns fixed user data from Bearer token
  router.get('/api/oauth/userinfo', (req, res) => {
    if (!jwtSecret) {
      res.status(500).json({ error: 'server_error' });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token, jwtSecret);
    if (!payload || payload.type !== 'oauth_access') {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    const user = users[payload.userId];
    if (!user) {
      res.status(401).json({ error: 'invalid_token', error_description: 'User not found' });
      return;
    }

    res.json({ sub: payload.userId, name: user.name, email: user.email });
  });

  // RFC 7662 — Token Introspection
  router.post('/api/oauth/introspect', (req, res) => {
    if (!jwtSecret) {
      res.status(500).json({ error: 'server_error' });
      return;
    }

    const { token } = req.body as Record<string, string | undefined>;
    if (!token) {
      res.json({ active: false });
      return;
    }

    const payload = verifyToken(token, jwtSecret);
    if (!payload) {
      res.json({ active: false });
      return;
    }

    // Decode full JWT to get exp/iat
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;

    res.json({
      active: true,
      sub: payload.userId,
      token_type: payload.type,
      exp: decoded?.exp,
      iat: decoded?.iat,
    });
  });

  // Token Revocation — stub for compatibility
  router.post('/api/oauth/revoke', (_req, res) => {
    res.status(200).json({});
  });

  // End Session — stub for compatibility
  router.post('/api/oauth/end-session', (_req, res) => {
    res.status(200).json({});
  });

  // Token endpoint — client_credentials, authorization_code, refresh_token grants
  router.post('/api/oauth/token', async (req, res) => {
    if (!hasUsers || !jwtSecret) {
      res.status(400).json({ error: 'server_error', error_description: 'OAuth not configured: no users or jwtSecret missing' });
      return;
    }

    const { grant_type } = req.body as Record<string, string | undefined>;

    // --- client_credentials ---
    if (grant_type === 'client_credentials') {
      const { client_id, client_secret } = req.body as Record<string, string | undefined>;

      if (!client_id || !client_secret) {
        res.status(400).json({ error: 'invalid_request', error_description: 'client_id and client_secret are required' });
        return;
      }

      const user = users[client_id];
      if (!user) {
        res.status(401).json({ error: 'invalid_client' });
        return;
      }

      const result = resolveUserFromApiKey(client_secret, { [client_id]: user });
      if (!result) {
        res.status(401).json({ error: 'invalid_client' });
        return;
      }

      const token = signOAuthToken(client_id, jwtSecret, accessTtl);
      res.json({ access_token: token, token_type: 'bearer', expires_in: parseTtl(accessTtl) });
      return;
    }

    // --- authorization_code ---
    if (grant_type === 'authorization_code') {
      const { code, client_id, redirect_uri, code_verifier } = req.body as Record<string, string | undefined>;

      if (!code || !client_id || !redirect_uri || !code_verifier) {
        res.status(400).json({ error: 'invalid_request', error_description: 'code, client_id, redirect_uri and code_verifier are required' });
        return;
      }

      // Atomically get and delete from session store (single use)
      const raw = await store.getAndDelete(`authcode:${code}`);
      if (!raw) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Unknown or expired authorization code' });
        return;
      }

      const entry = JSON.parse(raw) as { userId: string; redirectUri: string; codeChallenge: string };

      if (entry.redirectUri !== redirect_uri) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
        return;
      }

      if (!verifyPkce(code_verifier, entry.codeChallenge)) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
        return;
      }

      res.json(issueTokenPair(entry.userId, jwtSecret, accessTtl, refreshTtl));
      return;
    }

    // --- refresh_token ---
    if (grant_type === 'refresh_token') {
      const { refresh_token } = req.body as Record<string, string | undefined>;

      if (!refresh_token) {
        res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token is required' });
        return;
      }

      const payload = verifyToken(refresh_token, jwtSecret);
      if (!payload || payload.type !== 'oauth_refresh') {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired refresh token' });
        return;
      }

      res.json(issueTokenPair(payload.userId, jwtSecret, accessTtl, refreshTtl));
      return;
    }

    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  return router;
}
