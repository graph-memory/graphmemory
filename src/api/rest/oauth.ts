import express from 'express';
import { signOAuthToken } from '@/lib/jwt';
import { resolveUserFromApiKey } from '@/lib/access';
import type { UserConfig, ServerConfig } from '@/lib/multi-config';

const OAUTH_TOKEN_TTL = '1h';
const OAUTH_TOKEN_EXPIRES_IN = 3600;

/**
 * Create an Express router with OAuth 2.0 client_credentials endpoints.
 *
 * Endpoints:
 *   GET  /.well-known/oauth-authorization-server  — RFC 8414 discovery
 *   POST /oauth/token                              — client_credentials grant
 *
 * client_id  = userId (key in users config)
 * client_secret = apiKey for that user
 *
 * On success, /oauth/token returns a short-lived JWT (type: oauth_access).
 * This JWT is accepted as a Bearer token by the MCP HTTP handler.
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

  // RFC 8414 — OAuth Authorization Server Metadata
  router.get('/.well-known/oauth-authorization-server', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
    const base = `${proto}://${req.get('host')}`;
    res.json({
      issuer: base,
      token_endpoint: `${base}/oauth/token`,
      grant_types_supported: ['client_credentials'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    });
  });

  // Token endpoint — client_credentials grant only
  router.post('/oauth/token', (req, res) => {
    if (!hasUsers || !jwtSecret) {
      res.status(400).json({ error: 'server_error', error_description: 'OAuth not configured: no users or jwtSecret missing' });
      return;
    }

    const { grant_type, client_id, client_secret } = req.body as Record<string, string | undefined>;

    if (grant_type !== 'client_credentials') {
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }

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

    const accessToken = signOAuthToken(client_id, jwtSecret, OAUTH_TOKEN_TTL);
    res.json({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: OAUTH_TOKEN_EXPIRES_IN,
    });
  });

  return router;
}
