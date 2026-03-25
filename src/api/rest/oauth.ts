import crypto from 'crypto';
import express from 'express';
import { signOAuthToken, signOAuthRefreshToken, parseTtl, verifyToken, getAccessToken } from '@/lib/jwt';
import { resolveUserFromApiKey } from '@/lib/access';
import type { UserConfig, ServerConfig } from '@/lib/multi-config';

const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface AuthCodeEntry {
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCodeEntry>();

function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const computed = hash.toString('base64url');
  return computed === codeChallenge;
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
 *   GET  /authorize                               — redirect to /api/oauth/authorize (cross-site entry)
 *   GET  /api/oauth/authorize                     — check session cookie, issue code or redirect to /ui
 *   POST /oauth/token                             — client_credentials, authorization_code, refresh_token grants
 */
export function createOAuthRouter(
  users: Record<string, UserConfig>,
  serverConfig?: ServerConfig,
): express.Router {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());
  const hasUsers = Object.keys(users).length > 0;
  const jwtSecret = serverConfig?.jwtSecret;
  const accessTtl = serverConfig?.accessTokenTtl ?? '15m';
  const refreshTtl = serverConfig?.refreshTokenTtl ?? '7d';

  // RFC 8414 — OAuth Authorization Server Metadata
  router.get('/.well-known/oauth-authorization-server', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
    const base = `${proto}://${req.get('host')}`;
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/oauth/token`,
      grant_types_supported: ['client_credentials', 'authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    });
  });

  // Cross-site entry point — redirect to /api/oauth/authorize so sameSite:strict cookie is sent
  router.get('/authorize', (req, res) => {
    const params = new URLSearchParams(req.query as Record<string, string>);
    res.redirect(302, `/api/oauth/authorize?${params.toString()}`);
  });

  // Session-aware authorize — cookie is available here (path: /api, same-site)
  router.get('/api/oauth/authorize', (req, res) => {
    if (!hasUsers || !jwtSecret) {
      res.status(400).json({ error: 'server_error', error_description: 'OAuth not configured' });
      return;
    }

    const { response_type, client_id, redirect_uri, code_challenge, code_challenge_method, state } =
      req.query as Record<string, string | undefined>;

    if (response_type !== 'code' || !client_id || !redirect_uri || !code_challenge || code_challenge_method !== 'S256') {
      res.status(400).json({ error: 'invalid_request', error_description: 'Missing or invalid OAuth parameters' });
      return;
    }

    // Check session cookie
    const accessToken = getAccessToken(req);
    const payload = accessToken ? verifyToken(accessToken, jwtSecret) : null;

    if (!payload || (payload.type !== 'access' && payload.type !== 'oauth_access')) {
      res.redirect(302, '/ui');
      return;
    }

    // Issue authorization code
    const code = crypto.randomBytes(32).toString('base64url');
    authCodes.set(code, {
      userId: payload.userId,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });

    const callbackParams = new URLSearchParams({ code });
    if (state) callbackParams.set('state', state);
    res.redirect(302, `${redirect_uri}?${callbackParams.toString()}`);
  });

  // Token endpoint — client_credentials, authorization_code, refresh_token grants
  router.post('/oauth/token', (req, res) => {
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

      const entry = authCodes.get(code);
      if (!entry) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Unknown or expired authorization code' });
        return;
      }

      // Always delete — single use
      authCodes.delete(code);

      if (entry.expiresAt < Date.now()) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code expired' });
        return;
      }

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
