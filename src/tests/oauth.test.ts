import crypto from 'crypto';
import http from 'http';
import request from 'supertest';
import express from 'express';
import { EventEmitter } from 'events';
import cookieParser from 'cookie-parser';
import { createOAuthRouter } from '@/api/rest/oauth';
import { startMultiProjectHttpServer } from '@/api/index';
import { resolveUserFromBearer } from '@/lib/access';
import { signOAuthToken, signAccessToken, signRefreshToken, signOAuthRefreshToken, verifyToken } from '@/lib/jwt';
import type { UserConfig } from '@/lib/multi-config';
import type { ProjectManager } from '@/lib/project-manager';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SECRET = 'test-jwt-secret-for-oauth';

const USERS: Record<string, UserConfig> = {
  alice: { name: 'Alice', email: 'alice@example.com', apiKey: 'mgm-key-alice' },
  bob:   { name: 'Bob',   email: 'bob@example.com',   apiKey: 'mgm-key-bob'   },
};

const SERVER_CONFIG = { jwtSecret: SECRET, accessTokenTtl: '1h', refreshTokenTtl: '7d' } as any;

function buildApp(users: Record<string, UserConfig>, serverConfig?: any): express.Express {
  const app = express();
  app.use(cookieParser());
  app.use('/', createOAuthRouter(users, serverConfig));
  return app;
}

// PKCE helpers
function makePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest().toString('base64url');
  return { codeVerifier, codeChallenge };
}

// Perform full authorization_code flow: authorize → extract code → exchange for token
async function doAuthCodeFlow(app: express.Express, userId: string): Promise<{ body: any; codeVerifier: string }> {
  const { codeVerifier, codeChallenge } = makePkce();
  const accessCookie = signAccessToken(userId, SECRET, '1h');

  const authorizeRes = await request(app)
    .post('/api/oauth/authorize')
    .set('Cookie', `mgm_access=${accessCookie}`)
    .send({
      response_type: 'code',
      client_id: userId,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'test-state',
    });

  const redirectUrl = authorizeRes.body.redirectUrl as string;
  const code = new URL(redirectUrl).searchParams.get('code')!;

  const tokenRes = await request(app)
    .post('/oauth/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code,
      client_id: userId,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_verifier: codeVerifier,
    });

  return { body: tokenRes.body, codeVerifier };
}

// ---------------------------------------------------------------------------
// resolveUserFromBearer — unit tests
// ---------------------------------------------------------------------------

describe('resolveUserFromBearer', () => {
  it('resolves valid OAuth JWT to the correct user', () => {
    const token = signOAuthToken('alice', SECRET, '1h');
    const result = resolveUserFromBearer(token, USERS, SECRET);
    expect(result).toBeDefined();
    expect(result!.userId).toBe('alice');
    expect(result!.user).toBe(USERS.alice);
  });

  it('returns undefined for expired OAuth JWT', () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: 'alice', type: 'oauth_access', exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
    );
    expect(resolveUserFromBearer(token, USERS, SECRET)).toBeUndefined();
  });

  it('returns undefined for JWT with wrong type (access, not oauth_access)', () => {
    const token = signAccessToken('alice', SECRET, '1h');
    expect(resolveUserFromBearer(token, USERS, SECRET)).toBeUndefined();
  });

  it('returns undefined when OAuth JWT userId is not in users map', () => {
    const token = signOAuthToken('unknown', SECRET, '1h');
    expect(resolveUserFromBearer(token, USERS, SECRET)).toBeUndefined();
  });

  it('falls back to apiKey when token is not a JWT', () => {
    const result = resolveUserFromBearer('mgm-key-alice', USERS, SECRET);
    expect(result).toBeDefined();
    expect(result!.userId).toBe('alice');
  });

  it('resolves apiKey without jwtSecret (no OAuth configured)', () => {
    const result = resolveUserFromBearer('mgm-key-bob', USERS, undefined);
    expect(result).toBeDefined();
    expect(result!.userId).toBe('bob');
  });

  it('returns undefined for garbage token with no jwtSecret', () => {
    expect(resolveUserFromBearer('not-a-valid-key', USERS, undefined)).toBeUndefined();
  });

  it('returns undefined for garbage token even with jwtSecret', () => {
    expect(resolveUserFromBearer('garbage.token.here', USERS, SECRET)).toBeUndefined();
  });

  it('returns undefined for JWT signed with wrong secret', () => {
    const token = signOAuthToken('alice', 'wrong-secret', '1h');
    expect(resolveUserFromBearer(token, USERS, SECRET)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// signOAuthToken — unit tests
// ---------------------------------------------------------------------------

describe('signOAuthToken', () => {
  it('produces a JWT with type oauth_access', () => {
    const token = signOAuthToken('alice', SECRET, '1h');
    const payload = verifyToken(token, SECRET);
    expect(payload).toEqual({ userId: 'alice', type: 'oauth_access' });
  });

  it('produces a different token from signAccessToken', () => {
    const oauthToken = signOAuthToken('alice', SECRET, '1h');
    const accessToken = signAccessToken('alice', SECRET, '1h');
    expect(oauthToken).not.toBe(accessToken);
    expect(verifyToken(oauthToken, SECRET)!.type).toBe('oauth_access');
    expect(verifyToken(accessToken, SECRET)!.type).toBe('access');
  });
});

// ---------------------------------------------------------------------------
// signOAuthRefreshToken — unit tests
// ---------------------------------------------------------------------------

describe('signOAuthRefreshToken', () => {
  it('produces a JWT with type oauth_refresh', () => {
    const token = signOAuthRefreshToken('alice', SECRET, '7d');
    const payload = verifyToken(token, SECRET);
    expect(payload).toEqual({ userId: 'alice', type: 'oauth_refresh' });
  });

  it('produces a different type than signRefreshToken', () => {
    const oauthRefresh = signOAuthRefreshToken('alice', SECRET, '7d');
    const uiRefresh = signRefreshToken('alice', SECRET, '7d');
    expect(verifyToken(oauthRefresh, SECRET)!.type).toBe('oauth_refresh');
    expect(verifyToken(uiRefresh, SECRET)!.type).toBe('refresh');
  });
});

// ---------------------------------------------------------------------------
// GET /.well-known/oauth-authorization-server
// ---------------------------------------------------------------------------

describe('GET /.well-known/oauth-authorization-server', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns 200 with correct metadata shape', async () => {
    const res = await request(app)
      .get('/.well-known/oauth-authorization-server')
      .expect(200);

    expect(res.body).toMatchObject({
      issuer: expect.any(String),
      token_endpoint: expect.stringContaining('/oauth/token'),
      grant_types_supported: expect.arrayContaining(['client_credentials', 'authorization_code']),
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    });
  });

  it('token_endpoint URL is absolute and ends with /oauth/token', async () => {
    const res = await request(app)
      .get('/.well-known/oauth-authorization-server')
      .expect(200);

    expect(res.body.token_endpoint).toMatch(/^https?:\/\/.+\/oauth\/token$/);
  });

  it('issuer matches the request host', async () => {
    const res = await request(app)
      .get('/.well-known/oauth-authorization-server')
      .set('Host', 'mymcp.example.com')
      .expect(200);

    expect(res.body.issuer).toContain('mymcp.example.com');
    expect(res.body.token_endpoint).toContain('mymcp.example.com');
  });

  it('returns 200 even when no users configured (discovery is always available)', async () => {
    const emptyApp = buildApp({}, SERVER_CONFIG);
    await request(emptyApp)
      .get('/.well-known/oauth-authorization-server')
      .expect(200);
  });

  it('authorization_endpoint points to /ui/auth/authorize', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server').expect(200);
    expect(res.body.authorization_endpoint).toMatch(/\/ui\/auth\/authorize$/);
  });

  it('includes refresh_token in grant_types_supported', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server').expect(200);
    expect(res.body.grant_types_supported).toContain('refresh_token');
  });

  it('includes response_types_supported and code_challenge_methods_supported', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server').expect(200);
    expect(res.body.response_types_supported).toContain('code');
    expect(res.body.code_challenge_methods_supported).toContain('S256');
  });

  it('includes userinfo_endpoint', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server').expect(200);
    expect(res.body.userinfo_endpoint).toMatch(/\/api\/oauth\/userinfo$/);
  });

  it('includes introspection_endpoint', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server').expect(200);
    expect(res.body.introspection_endpoint).toMatch(/\/api\/oauth\/introspect$/);
  });

  it('includes revocation_endpoint', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server').expect(200);
    expect(res.body.revocation_endpoint).toMatch(/\/api\/oauth\/revoke$/);
  });

  it('includes end_session_endpoint', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server').expect(200);
    expect(res.body.end_session_endpoint).toMatch(/\/api\/oauth\/end-session$/);
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/token — client_credentials
// ---------------------------------------------------------------------------

describe('POST /oauth/token — happy path', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns 200 with access_token, token_type, expires_in', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'alice', client_secret: 'mgm-key-alice' })
      .expect(200);

    expect(res.body).toMatchObject({
      access_token: expect.any(String),
      token_type: 'bearer',
      expires_in: 3600,
    });
  });

  it('access_token is a valid JWT with type oauth_access', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'alice', client_secret: 'mgm-key-alice' })
      .expect(200);

    const payload = verifyToken(res.body.access_token, SECRET);
    expect(payload).toEqual({ userId: 'alice', type: 'oauth_access' });
  });

  it('token is accepted by resolveUserFromBearer', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'bob', client_secret: 'mgm-key-bob' })
      .expect(200);

    const result = resolveUserFromBearer(res.body.access_token, USERS, SECRET);
    expect(result).toBeDefined();
    expect(result!.userId).toBe('bob');
  });

  it('works for all configured users', async () => {
    for (const [id, user] of Object.entries(USERS)) {
      const res = await request(app)
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'client_credentials', client_id: id, client_secret: user.apiKey })
        .expect(200);

      const payload = verifyToken(res.body.access_token, SECRET);
      expect(payload!.userId).toBe(id);
    }
  });
});

describe('POST /oauth/token — error cases', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns 400 for unsupported grant_type', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'implicit', client_id: 'alice', client_secret: 'mgm-key-alice' })
      .expect(400);

    expect(res.body.error).toBe('unsupported_grant_type');
  });

  it('returns 400 when grant_type is missing', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ client_id: 'alice', client_secret: 'mgm-key-alice' })
      .expect(400);

    expect(res.body.error).toBe('unsupported_grant_type');
  });

  it('returns 400 when client_id is missing', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_secret: 'mgm-key-alice' })
      .expect(400);

    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 400 when client_secret is missing', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'alice' })
      .expect(400);

    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 401 for unknown client_id', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'nobody', client_secret: 'any-secret' })
      .expect(401);

    expect(res.body.error).toBe('invalid_client');
  });

  it('returns 401 for wrong client_secret', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'alice', client_secret: 'wrong-secret' })
      .expect(401);

    expect(res.body.error).toBe('invalid_client');
  });

  it('returns 400 server_error when no users configured', async () => {
    const emptyApp = buildApp({}, SERVER_CONFIG);
    const res = await request(emptyApp)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'alice', client_secret: 'mgm-key-alice' })
      .expect(400);

    expect(res.body.error).toBe('server_error');
  });

  it('returns 400 server_error when jwtSecret is not configured', async () => {
    const noSecretApp = buildApp(USERS, {} as any);
    const res = await request(noSecretApp)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'alice', client_secret: 'mgm-key-alice' })
      .expect(400);

    expect(res.body.error).toBe('server_error');
  });

  it('returns 400 server_error when serverConfig is undefined', async () => {
    const noConfigApp = buildApp(USERS, undefined);
    const res = await request(noConfigApp)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'alice', client_secret: 'mgm-key-alice' })
      .expect(400);

    expect(res.body.error).toBe('server_error');
  });
});

// ---------------------------------------------------------------------------
// POST /api/oauth/authorize
// ---------------------------------------------------------------------------

describe('POST /api/oauth/authorize — not logged in', () => {
  const app = buildApp(USERS, SERVER_CONFIG);
  const { codeChallenge } = makePkce();
  const params = {
    response_type: 'code',
    client_id: 'alice',
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  };

  it('returns 401 login_required when no cookie present', async () => {
    const res = await request(app)
      .post('/api/oauth/authorize')
      .send(params)
      .expect(401);

    expect(res.body.error).toBe('login_required');
  });

  it('returns 401 login_required when cookie is invalid JWT', async () => {
    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', 'mgm_access=not-a-valid-token')
      .send(params)
      .expect(401);

    expect(res.body.error).toBe('login_required');
  });

  it('returns 401 login_required when cookie is a refresh token (wrong type)', async () => {
    const refreshToken = signRefreshToken('alice', SECRET, '7d');
    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${refreshToken}`)
      .send(params)
      .expect(401);

    expect(res.body.error).toBe('login_required');
  });
});

describe('POST /api/oauth/authorize — logged in', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns JSON with redirectUrl containing code and state', async () => {
    const { codeChallenge } = makePkce();
    const accessCookie = signAccessToken('alice', SECRET, '1h');

    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send({
        response_type: 'code',
        client_id: 'alice',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'my-state',
      })
      .expect(200);

    expect(res.body.redirectUrl).toContain('https://claude.ai/api/mcp/auth_callback');
    const params = new URL(res.body.redirectUrl).searchParams;
    expect(params.get('code')).toBeTruthy();
    expect(params.get('state')).toBe('my-state');
  });

  it('returns redirectUrl without state when state not provided', async () => {
    const { codeChallenge } = makePkce();
    const accessCookie = signAccessToken('alice', SECRET, '1h');

    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send({
        response_type: 'code',
        client_id: 'alice',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })
      .expect(200);

    const params = new URL(res.body.redirectUrl).searchParams;
    expect(params.get('code')).toBeTruthy();
    expect(params.has('state')).toBe(false);
  });

  it('accepts oauth_access token type (already OAuth-authenticated)', async () => {
    const { codeChallenge } = makePkce();
    const oauthToken = signOAuthToken('alice', SECRET, '1h');

    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${oauthToken}`)
      .send({
        response_type: 'code',
        client_id: 'alice',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })
      .expect(200);

    expect(res.body.redirectUrl).toContain('https://claude.ai');
  });
});

describe('POST /api/oauth/authorize — invalid params', () => {
  const app = buildApp(USERS, SERVER_CONFIG);
  const accessCookie = signAccessToken('alice', SECRET, '1h');
  const { codeChallenge } = makePkce();
  const base = {
    response_type: 'code',
    client_id: 'alice',
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  };

  it('returns 400 when response_type is not code', async () => {
    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send({ ...base, response_type: 'token' })
      .expect(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 400 when code_challenge_method is not S256', async () => {
    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send({ ...base, code_challenge_method: 'plain' })
      .expect(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 400 when code_challenge is missing', async () => {
    const { code_challenge: _, ...withoutChallenge } = base;
    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send(withoutChallenge)
      .expect(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 400 when redirect_uri is missing', async () => {
    const { redirect_uri: _, ...withoutUri } = base;
    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send(withoutUri)
      .expect(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns 400 when OAuth not configured', async () => {
    const noConfigApp = buildApp({}, SERVER_CONFIG);
    const res = await request(noConfigApp)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send(base)
      .expect(400);
    expect(res.body.error).toBe('server_error');
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/token — authorization_code grant
// ---------------------------------------------------------------------------

describe('POST /oauth/token — authorization_code happy path', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns access_token, refresh_token, expires_in, refresh_token_expires_in', async () => {
    const { body } = await doAuthCodeFlow(app, 'alice');
    expect(body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: 'bearer',
      expires_in: expect.any(Number),
      refresh_token_expires_in: expect.any(Number),
    });
  });

  it('access_token is valid JWT with type oauth_access and correct userId', async () => {
    const { body } = await doAuthCodeFlow(app, 'alice');
    const payload = verifyToken(body.access_token, SECRET);
    expect(payload).toMatchObject({ userId: 'alice', type: 'oauth_access' });
  });

  it('refresh_token is valid JWT with type oauth_refresh', async () => {
    const { body } = await doAuthCodeFlow(app, 'alice');
    const payload = verifyToken(body.refresh_token, SECRET);
    expect(payload).toMatchObject({ userId: 'alice', type: 'oauth_refresh' });
  });

  it('code is single-use — second exchange fails', async () => {
    const { codeVerifier, codeChallenge } = makePkce();
    const accessCookie = signAccessToken('alice', SECRET, '1h');

    const authorizeRes = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send({
        response_type: 'code',
        client_id: 'alice',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

    const code = new URL(authorizeRes.body.redirectUrl).searchParams.get('code')!;
    const tokenPayload = {
      grant_type: 'authorization_code',
      code,
      client_id: 'alice',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_verifier: codeVerifier,
    };

    await request(app).post('/oauth/token').type('form').send(tokenPayload).expect(200);
    const second = await request(app).post('/oauth/token').type('form').send(tokenPayload).expect(400);
    expect(second.body.error).toBe('invalid_grant');
  });
});

describe('POST /oauth/token — authorization_code error cases', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns invalid_request when code is missing', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', client_id: 'alice', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_verifier: 'x' })
      .expect(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns invalid_grant for unknown code', async () => {
    const { codeVerifier } = makePkce();
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: 'bogus-code', client_id: 'alice', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_verifier: codeVerifier })
      .expect(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('returns invalid_grant when redirect_uri does not match', async () => {
    const { codeVerifier, codeChallenge } = makePkce();
    const accessCookie = signAccessToken('alice', SECRET, '1h');

    const authorizeRes = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send({
        response_type: 'code',
        client_id: 'alice',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

    const code = new URL(authorizeRes.body.redirectUrl).searchParams.get('code')!;
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code, client_id: 'alice', redirect_uri: 'https://evil.com/callback', code_verifier: codeVerifier })
      .expect(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('returns invalid_grant when PKCE code_verifier is wrong', async () => {
    const { codeChallenge } = makePkce();
    const accessCookie = signAccessToken('alice', SECRET, '1h');

    const authorizeRes = await request(app)
      .post('/api/oauth/authorize')
      .set('Cookie', `mgm_access=${accessCookie}`)
      .send({
        response_type: 'code',
        client_id: 'alice',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

    const code = new URL(authorizeRes.body.redirectUrl).searchParams.get('code')!;
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code, client_id: 'alice', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_verifier: 'wrong-verifier' })
      .expect(400);
    expect(res.body.error).toBe('invalid_grant');
  });
});

// ---------------------------------------------------------------------------
// POST /oauth/token — refresh_token grant
// ---------------------------------------------------------------------------

describe('POST /oauth/token — refresh_token happy path', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns new access_token and refresh_token', async () => {
    const { body: first } = await doAuthCodeFlow(app, 'alice');

    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: first.refresh_token })
      .expect(200);

    expect(res.body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: 'bearer',
      expires_in: expect.any(Number),
    });
  });

  it('new access_token is a valid JWT with type oauth_access', async () => {
    const { body: first } = await doAuthCodeFlow(app, 'alice');

    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: first.refresh_token })
      .expect(200);

    const payload = verifyToken(res.body.access_token, SECRET);
    expect(payload).toMatchObject({ userId: 'alice', type: 'oauth_access' });
  });
});

describe('POST /oauth/token — refresh_token error cases', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns invalid_request when refresh_token is missing', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token' })
      .expect(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('returns invalid_grant for garbage refresh_token', async () => {
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'not-a-jwt' })
      .expect(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('returns invalid_grant when token type is access (not oauth_refresh)', async () => {
    const wrongTypeToken = signAccessToken('alice', SECRET, '7d');
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: wrongTypeToken })
      .expect(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('returns invalid_grant when token type is ui refresh (not oauth_refresh)', async () => {
    const uiRefresh = signRefreshToken('alice', SECRET, '7d');
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: uiRefresh })
      .expect(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('returns invalid_grant for expired refresh_token', async () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { userId: 'alice', type: 'oauth_refresh', exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
    );
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: expired })
      .expect(400);
    expect(res.body.error).toBe('invalid_grant');
  });
});

// ---------------------------------------------------------------------------
// GET /api/oauth/userinfo
// ---------------------------------------------------------------------------

describe('GET /api/oauth/userinfo', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns sub, name, email for valid Bearer token', async () => {
    const token = signOAuthToken('alice', SECRET, '1h');
    const res = await request(app)
      .get('/api/oauth/userinfo')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({ sub: 'alice', name: 'Alice', email: 'alice@example.com' });
  });

  it('returns 401 without Bearer token', async () => {
    await request(app)
      .get('/api/oauth/userinfo')
      .expect(401);
  });

  it('returns 401 for expired token', async () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { userId: 'alice', type: 'oauth_access', exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
    );
    await request(app)
      .get('/api/oauth/userinfo')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });

  it('returns 401 for non-oauth_access token type', async () => {
    const accessToken = signAccessToken('alice', SECRET, '1h');
    await request(app)
      .get('/api/oauth/userinfo')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('returns 401 for unknown user', async () => {
    const token = signOAuthToken('unknown', SECRET, '1h');
    await request(app)
      .get('/api/oauth/userinfo')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/oauth/introspect
// ---------------------------------------------------------------------------

describe('POST /api/oauth/introspect', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns active:true with claims for valid token', async () => {
    const token = signOAuthToken('alice', SECRET, '1h');
    const res = await request(app)
      .post('/api/oauth/introspect')
      .send({ token })
      .expect(200);

    expect(res.body.active).toBe(true);
    expect(res.body.sub).toBe('alice');
    expect(res.body.token_type).toBe('oauth_access');
    expect(res.body.exp).toEqual(expect.any(Number));
    expect(res.body.iat).toEqual(expect.any(Number));
  });

  it('returns active:false for expired token', async () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { userId: 'alice', type: 'oauth_access', exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
    );
    const res = await request(app)
      .post('/api/oauth/introspect')
      .send({ token: expired })
      .expect(200);

    expect(res.body).toEqual({ active: false });
  });

  it('returns active:false for garbage token', async () => {
    const res = await request(app)
      .post('/api/oauth/introspect')
      .send({ token: 'not-a-jwt' })
      .expect(200);

    expect(res.body).toEqual({ active: false });
  });

  it('returns active:false when token is missing', async () => {
    const res = await request(app)
      .post('/api/oauth/introspect')
      .send({})
      .expect(200);

    expect(res.body).toEqual({ active: false });
  });
});

// ---------------------------------------------------------------------------
// POST /api/oauth/revoke
// ---------------------------------------------------------------------------

describe('POST /api/oauth/revoke', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns 200 OK', async () => {
    await request(app)
      .post('/api/oauth/revoke')
      .send({ token: 'any-token' })
      .expect(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/oauth/end-session
// ---------------------------------------------------------------------------

describe('POST /api/oauth/end-session', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns 200 OK', async () => {
    await request(app)
      .post('/api/oauth/end-session')
      .send({})
      .expect(200);
  });
});

// ---------------------------------------------------------------------------
// GET /authorize — removed (should 404)
// ---------------------------------------------------------------------------

describe('GET /authorize — removed', () => {
  const app = buildApp(USERS, SERVER_CONFIG);

  it('returns 404 (endpoint removed)', async () => {
    await request(app)
      .get('/authorize')
      .query({ response_type: 'code', client_id: 'alice' })
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// MCP handler — 401 with WWW-Authenticate on expired/invalid OAuth token
// ---------------------------------------------------------------------------

function createFakeProjectManager(): ProjectManager {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    getProject: (_id: string) => undefined,
    getWorkspace: (_id: string) => undefined,
    getProjectWorkspace: (_id: string) => undefined,
    listProjects: () => [] as string[],
    listWorkspaces: () => [] as string[],
  }) as unknown as ProjectManager;
}

describe('MCP handler — auth 401 responses', () => {
  let server: http.Server;
  const restOptions = {
    users: USERS,
    serverConfig: SERVER_CONFIG,
  };

  beforeAll(async () => {
    const pm = createFakeProjectManager();
    server = await startMultiProjectHttpServer('127.0.0.1', 0, 60_000, pm, restOptions);
  });

  afterAll(() => {
    server.close();
  });

  function port(): number {
    return (server.address() as { port: number }).port;
  }

  it('returns 401 with WWW-Authenticate header when no Authorization header', async () => {
    const res = await request(`http://127.0.0.1:${port()}`)
      .post('/mcp/any-project')
      .send({});

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 with WWW-Authenticate header for expired OAuth token', async () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { userId: 'alice', type: 'oauth_access', exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
    );

    const res = await request(`http://127.0.0.1:${port()}`)
      .post('/mcp/any-project')
      .set('Authorization', `Bearer ${expired}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 with WWW-Authenticate header for wrong API key', async () => {
    const res = await request(`http://127.0.0.1:${port()}`)
      .post('/mcp/any-project')
      .set('Authorization', 'Bearer wrong-key')
      .send({});

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('valid OAuth token passes auth (proceeds to project lookup, gets 404)', async () => {
    const token = signOAuthToken('alice', SECRET, '1h');

    const res = await request(`http://127.0.0.1:${port()}`)
      .post('/mcp/any-project')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} });

    expect(res.status).toBe(404);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('valid API key passes auth (proceeds to project lookup, gets 404)', async () => {
    const res = await request(`http://127.0.0.1:${port()}`)
      .post('/mcp/any-project')
      .set('Authorization', 'Bearer mgm-key-alice')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} });

    expect(res.status).toBe(404);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });
});
