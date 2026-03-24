import http from 'http';
import request from 'supertest';
import express from 'express';
import { EventEmitter } from 'events';
import { createOAuthRouter } from '@/api/rest/oauth';
import { startMultiProjectHttpServer } from '@/api/index';
import { resolveUserFromBearer } from '@/lib/access';
import { signOAuthToken, signAccessToken, verifyToken } from '@/lib/jwt';
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

const SERVER_CONFIG = { jwtSecret: SECRET } as any;

function buildApp(users: Record<string, UserConfig>, serverConfig?: any): express.Express {
  const app = express();
  app.use('/', createOAuthRouter(users, serverConfig));
  return app;
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
    // Should NOT match oauth_access check; falls through to apiKey check which also fails
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
      grant_types_supported: ['client_credentials'],
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
});

// ---------------------------------------------------------------------------
// POST /oauth/token
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
      .send({ grant_type: 'authorization_code', client_id: 'alice', client_secret: 'mgm-key-alice' })
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

    // Auth passed — fails at project lookup (no projects configured in fake manager)
    expect(res.status).toBe(404);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('valid API key passes auth (proceeds to project lookup, gets 404)', async () => {
    const res = await request(`http://127.0.0.1:${port()}`)
      .post('/mcp/any-project')
      .set('Authorization', 'Bearer mgm-key-alice')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} });

    // Auth passed — fails at project lookup
    expect(res.status).toBe(404);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });
});
