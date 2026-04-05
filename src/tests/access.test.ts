import { resolveAccess, resolveUserFromApiKey, canRead, canWrite } from '@/lib/access';
import type { ProjectConfig, ServerConfig, WorkspaceConfig, GraphConfig, ModelConfig, EmbeddingConfig } from '@/lib/multi-config';

const MODEL: ModelConfig = {
  name: 'test', pooling: 'mean', normalize: true,
  queryPrefix: '', documentPrefix: '',
};

const EMBED: EmbeddingConfig = {
  batchSize: 1, maxChars: 2000, cacheSize: 0,
};

function makeGraphConfig(overrides?: Partial<GraphConfig>): GraphConfig {
  return { enabled: true, readonly: false, exclude: [], model: MODEL, embedding: EMBED, ...overrides };
}

function makeProjectConfig(overrides?: Partial<ProjectConfig>): ProjectConfig {
  return {
    projectDir: '/tmp/test',
    graphMemory: '/tmp/test/.graph-memory',
    exclude: [],
    chunkDepth: 4,
    maxFileSize: 1048576,
    model: MODEL,
    embedding: EMBED,
    graphConfigs: {
      docs: makeGraphConfig(), code: makeGraphConfig(), knowledge: makeGraphConfig(),
      tasks: makeGraphConfig(), files: makeGraphConfig(), skills: makeGraphConfig(),
    },
    author: { name: '', email: '' },
    ...overrides,
  };
}

function makeServerConfig(overrides?: Partial<ServerConfig>): ServerConfig {
  return {
    host: '127.0.0.1', port: 3000, sessionTimeout: 1800,
    modelsDir: '/tmp/models', model: MODEL, embedding: EMBED, defaultAccess: 'rw', exclude: [],
    accessTokenTtl: '15m', refreshTokenTtl: '7d',
    rateLimit: { global: 200, search: 60, auth: 10 },
    maxFileSize: 1048576,
    redis: { enabled: false, url: 'redis://localhost:6379', prefix: 'mgm:', embeddingCacheTtl: '30d' },
    oauth: { enabled: true, accessTokenTtl: '1h', refreshTokenTtl: '7d', authCodeTtl: '10m', allowedRedirectUris: [] },
    ...overrides,
  };
}

describe('resolveAccess', () => {
  it('returns defaultAccess for anonymous user', () => {
    const server = makeServerConfig({ defaultAccess: 'deny' });
    const project = makeProjectConfig();
    expect(resolveAccess(undefined, 'knowledge', project, server)).toBe('deny');
  });

  it('returns defaultAccess when user has no explicit access', () => {
    const server = makeServerConfig({ defaultAccess: 'r' });
    const project = makeProjectConfig();
    expect(resolveAccess('alice', 'knowledge', project, server)).toBe('r');
  });

  it('server.access overrides defaultAccess', () => {
    const server = makeServerConfig({ defaultAccess: 'deny', access: { alice: 'rw' } });
    const project = makeProjectConfig();
    expect(resolveAccess('alice', 'knowledge', project, server)).toBe('rw');
    expect(resolveAccess('bob', 'knowledge', project, server)).toBe('deny');
  });

  it('workspace.access overrides server.access', () => {
    const server = makeServerConfig({ defaultAccess: 'deny', access: { alice: 'r' } });
    const project = makeProjectConfig();
    const ws: WorkspaceConfig = {
      projects: [], graphMemory: '', mirrorDir: '', model: MODEL, embedding: EMBED, exclude: [],      graphConfigs: { knowledge: makeGraphConfig(), tasks: makeGraphConfig(), skills: makeGraphConfig() },
      author: { name: '', email: '' },
      access: { alice: 'rw' },
    };
    expect(resolveAccess('alice', 'knowledge', project, server, ws)).toBe('rw');
  });

  it('project.access overrides workspace.access', () => {
    const server = makeServerConfig({ defaultAccess: 'rw' });
    const ws: WorkspaceConfig = {
      projects: [], graphMemory: '', mirrorDir: '', model: MODEL, embedding: EMBED, exclude: [],      graphConfigs: { knowledge: makeGraphConfig(), tasks: makeGraphConfig(), skills: makeGraphConfig() },
      author: { name: '', email: '' },
      access: { alice: 'rw' },
    };
    const project = makeProjectConfig({ access: { alice: 'r' } });
    expect(resolveAccess('alice', 'knowledge', project, server, ws)).toBe('r');
  });

  it('graph.access overrides project.access', () => {
    const server = makeServerConfig({ defaultAccess: 'deny' });
    const project = makeProjectConfig({
      access: { alice: 'r' },
      graphConfigs: {
        docs: makeGraphConfig(), code: makeGraphConfig(),
        knowledge: makeGraphConfig({ access: { alice: 'rw' } }),
        tasks: makeGraphConfig(), files: makeGraphConfig(), skills: makeGraphConfig(),
      },
    });
    // knowledge has graph-level override
    expect(resolveAccess('alice', 'knowledge', project, server)).toBe('rw');
    // docs uses project-level
    expect(resolveAccess('alice', 'docs', project, server)).toBe('r');
  });

  it('full chain: graph > project > workspace > server > default', () => {
    const server = makeServerConfig({ defaultAccess: 'deny', access: { eve: 'r' } });
    const ws: WorkspaceConfig = {
      projects: [], graphMemory: '', mirrorDir: '', model: MODEL, embedding: EMBED, exclude: [],      graphConfigs: { knowledge: makeGraphConfig(), tasks: makeGraphConfig(), skills: makeGraphConfig() },
      author: { name: '', email: '' },
    };
    const project = makeProjectConfig();
    // eve: no graph, no project, no workspace → server.access → r
    expect(resolveAccess('eve', 'docs', project, server, ws)).toBe('r');
    // unknown: no access anywhere → deny
    expect(resolveAccess('unknown', 'docs', project, server, ws)).toBe('deny');
  });
});

describe('resolveUserFromApiKey', () => {
  const users = {
    alice: { name: 'Alice', email: 'a@test.com', apiKey: 'key-a' },
    bob: { name: 'Bob', email: 'b@test.com', apiKey: 'key-b' },
  };

  it('finds user by apiKey', () => {
    const result = resolveUserFromApiKey('key-a', users);
    expect(result).toEqual({ userId: 'alice', user: users.alice });
  });

  it('returns undefined for unknown key', () => {
    expect(resolveUserFromApiKey('key-unknown', users)).toBeUndefined();
  });
});

describe('canRead / canWrite', () => {
  it('deny: no read, no write', () => {
    expect(canRead('deny')).toBe(false);
    expect(canWrite('deny')).toBe(false);
  });
  it('r: read yes, write no', () => {
    expect(canRead('r')).toBe(true);
    expect(canWrite('r')).toBe(false);
  });
  it('rw: read yes, write yes', () => {
    expect(canRead('rw')).toBe(true);
    expect(canWrite('rw')).toBe(true);
  });
});
