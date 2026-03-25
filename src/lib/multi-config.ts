import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { type RedisConfig, REDIS_DEFAULTS } from '@/lib/redis';

const HOME = os.homedir();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const authorSchema = z.object({
  name:  z.string(),
  email: z.string(),
});

// Model config: taken as a whole from the first level that defines it (no field merge)
const modelConfigSchema = z.object({
  name:            z.string(),
  pooling:         z.enum(['mean', 'cls']).optional(),
  normalize:       z.boolean().optional(),
  dtype:           z.string().optional(),
  queryPrefix:     z.string().optional(),
  documentPrefix:  z.string().optional(),
});

// Embedding config: each field individually inherits up the chain
const embeddingConfigSchema = z.object({
  batchSize:       z.number().int().positive().optional(),
  maxChars:        z.number().int().positive().optional(),
  cacheSize:       z.number().int().min(0).optional(),
  remote:          z.string().optional(),    // Remote embedding API URL
  remoteApiKey:    z.string().optional(),    // API key for remote embedding
  remoteModel:     z.enum(['default', 'code']).optional(),  // Which model to request from remote API
});

const accessLevelSchema = z.enum(['deny', 'r', 'rw']);
const accessMapSchema = z.record(z.string(), accessLevelSchema).optional();

// Exclude accepts string ("a,b") or array (["a", "b"]) in YAML
const excludeSchema = z.union([z.string(), z.array(z.string())]).optional();

// Include accepts string ("a/**/*.md") or array (["a/**/*.md", "CLAUDE.md"]) in YAML
const includeSchema = z.union([z.string(), z.array(z.string())]).optional();

const userSchema = z.object({
  name:         z.string(),
  email:        z.string(),
  apiKey:       z.string(),
  passwordHash: z.string().optional(),
});

const graphConfigSchema = z.object({
  enabled:        z.boolean().optional(),
  readonly:       z.boolean().optional(),
  include:        includeSchema,
  exclude:        excludeSchema,
  model:          modelConfigSchema.optional(),
  embedding:      embeddingConfigSchema.optional(),
  access:         accessMapSchema,
});

const graphsConfigSchema = z.object({
  docs:      graphConfigSchema.optional(),
  code:      graphConfigSchema.optional(),
  knowledge: graphConfigSchema.optional(),
  tasks:     graphConfigSchema.optional(),
  files:     graphConfigSchema.optional(),
  skills:    graphConfigSchema.optional(),
});

const projectSchema = z.object({
  projectDir:      z.string(),
  graphMemory:     z.string().optional(),
  exclude:         excludeSchema,
  chunkDepth:      z.number().int().positive().optional(),
  maxFileSize:     z.number().int().positive().optional(),
  model:           modelConfigSchema.optional(),
  codeModel:       modelConfigSchema.optional(),
  embedding:       embeddingConfigSchema.optional(),
  graphs:          graphsConfigSchema.optional(),
  author:          authorSchema.optional(),
  access:          accessMapSchema,
});

const embeddingApiSchema = z.object({
  enabled:      z.boolean().optional(),
  apiKey:       z.string().optional(),
  maxTexts:     z.number().int().positive().optional(),    // max texts per request
  maxTextChars: z.number().int().positive().optional(),    // max chars per text
});

const rateLimitSchema = z.object({
  global: z.number().int().min(0).optional(),   // req/min per IP (0 = disabled)
  search: z.number().int().min(0).optional(),   // req/min per IP for search/embed
  auth:   z.number().int().min(0).optional(),   // req/min per IP for login
});

const oauthSchema = z.object({
  enabled:         z.boolean().optional(),
  accessTokenTtl:  z.string().optional(),
  refreshTokenTtl: z.string().optional(),
  authCodeTtl:     z.string().optional(),
});

const redisSchema = z.object({
  enabled:            z.boolean().optional(),
  url:                z.string().optional(),
  prefix:             z.string().optional(),
  embeddingCacheTtl:  z.string().optional(),
});

const serverSchema = z.object({
  host:            z.string().optional(),
  port:            z.number().int().positive().optional(),
  sessionTimeout:  z.number().int().positive().optional(),
  modelsDir:       z.string().optional(),
  corsOrigins:     z.array(z.string()).optional(),
  model:           modelConfigSchema.optional(),
  codeModel:       modelConfigSchema.optional(),
  embedding:       embeddingConfigSchema.optional(),
  embeddingApi:    embeddingApiSchema.optional(),
  defaultAccess:   accessLevelSchema.optional(),
  access:          accessMapSchema,
  jwtSecret:       z.string().min(32).optional(),
  cookieSecure:    z.boolean().optional(),
  accessTokenTtl:  z.string().optional(),
  refreshTokenTtl: z.string().optional(),
  rateLimit:       rateLimitSchema.optional(),
  maxFileSize:     z.number().int().positive().optional(),
  exclude:         excludeSchema,
  redis:           redisSchema.optional(),
  oauth:           oauthSchema.optional(),
});

const wsGraphConfigSchema = z.object({
  enabled:        z.boolean().optional(),
  readonly:       z.boolean().optional(),
  exclude:        excludeSchema,
  model:          modelConfigSchema.optional(),
  embedding:      embeddingConfigSchema.optional(),
  access:         accessMapSchema,
});

const wsGraphsConfigSchema = z.object({
  knowledge: wsGraphConfigSchema.optional(),
  tasks:     wsGraphConfigSchema.optional(),
  skills:    wsGraphConfigSchema.optional(),
});

const workspaceSchema = z.object({
  projects:       z.array(z.string()),
  graphMemory:    z.string().optional(),
  mirrorDir:      z.string().optional(),
  model:          modelConfigSchema.optional(),
  codeModel:      modelConfigSchema.optional(),
  embedding:      embeddingConfigSchema.optional(),
  graphs:         wsGraphsConfigSchema.optional(),
  author:         authorSchema.optional(),
  access:         accessMapSchema,
  maxFileSize:    z.number().int().positive().optional(),
  exclude:        excludeSchema,
});

const configFileSchema = z.object({
  author:     authorSchema.optional(),
  server:     serverSchema.optional(),
  users:      z.record(z.string(), userSchema).optional(),
  projects:   z.record(z.string(), projectSchema),
  workspaces: z.record(z.string(), workspaceSchema).optional(),
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GraphName = 'docs' | 'code' | 'knowledge' | 'tasks' | 'files' | 'skills';

export const GRAPH_NAMES: GraphName[] = ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'];

export type AccessLevel = 'deny' | 'r' | 'rw';
export type AccessMap = Record<string, AccessLevel>;

export interface UserConfig {
  name: string;
  email: string;
  apiKey: string;
  passwordHash?: string;
}

export interface AuthorConfig {
  name: string;
  email: string;
}

export interface ModelConfig {
  name: string;
  pooling: 'mean' | 'cls';
  normalize: boolean;
  dtype?: string;
  queryPrefix: string;
  documentPrefix: string;
}

export interface EmbeddingConfig {
  batchSize: number;
  maxChars: number;
  cacheSize: number;
  remote?: string;       // Remote embedding API URL (replaces local ONNX)
  remoteApiKey?: string; // API key for remote embedding
  remoteModel?: string;  // Which model to request from remote API ("default" or "code")
}

/** Resolved config combining model + embedding for a specific graph. */
export interface ResolvedEmbedding {
  model: ModelConfig;
  embedding: EmbeddingConfig;
}

export interface EmbeddingApiConfig {
  enabled: boolean;
  apiKey?: string;
  maxTexts: number;
  maxTextChars: number;
}

/**
 * Build a stable fingerprint string from model config fields that affect stored vectors.
 * queryPrefix excluded: only affects query-time, not stored document vectors.
 */
export function embeddingFingerprint(model: ModelConfig): string {
  return `${model.name}|${model.pooling}|${model.normalize}|${model.dtype ?? ''}|${model.documentPrefix}`;
}

export interface OAuthConfig {
  enabled: boolean;
  accessTokenTtl: string;
  refreshTokenTtl: string;
  authCodeTtl: string;
}

export interface RateLimitConfig {
  global: number;   // req/min per IP (0 = disabled)
  search: number;   // req/min per IP for search/embed
  auth: number;     // req/min per IP for login
}

export interface ServerConfig {
  host: string;
  port: number;
  sessionTimeout: number;
  modelsDir: string;
  corsOrigins?: string[];
  model: ModelConfig;
  codeModel?: ModelConfig;
  embedding: EmbeddingConfig;
  embeddingApi?: EmbeddingApiConfig;
  defaultAccess: AccessLevel;
  access?: AccessMap;
  jwtSecret?: string;
  cookieSecure?: boolean;
  accessTokenTtl: string;
  refreshTokenTtl: string;
  rateLimit: RateLimitConfig;
  maxFileSize: number;
  exclude: string[];
  redis: RedisConfig;
  oauth: OAuthConfig;
}

export interface GraphConfig {
  enabled: boolean;
  readonly: boolean;
  include?: string | string[];
  exclude: string[];   // accumulated: server + workspace + project + graph
  model: ModelConfig;
  embedding: EmbeddingConfig;
  access?: AccessMap;
}

export interface ProjectConfig {
  projectDir: string;
  graphMemory: string;
  exclude: string[];   // accumulated: server + workspace + project
  chunkDepth: number;
  maxFileSize: number;
  model: ModelConfig;
  codeModel?: ModelConfig;
  embedding: EmbeddingConfig;
  graphConfigs: Record<GraphName, GraphConfig>;
  author: AuthorConfig;
  access?: AccessMap;
}

export type WsGraphName = 'knowledge' | 'tasks' | 'skills';

export interface WorkspaceConfig {
  projects: string[];
  graphMemory: string;
  mirrorDir: string;
  model: ModelConfig;
  codeModel?: ModelConfig;
  embedding: EmbeddingConfig;
  graphConfigs: Record<WsGraphName, GraphConfig>;
  author: AuthorConfig;
  access?: AccessMap;
  maxFileSize?: number;
  exclude: string[];   // accumulated: server + workspace
}

export interface MultiConfig {
  author: AuthorConfig;
  server: ServerConfig;
  users: Record<string, UserConfig>;
  projects: Map<string, ProjectConfig>;
  workspaces: Map<string, WorkspaceConfig>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTHOR_DEFAULT: AuthorConfig = { name: '', email: '' };

/**
 * Format an author as a git-style string: "Name <email>".
 * Returns empty string if name is not set.
 */
export function formatAuthor(author: AuthorConfig): string {
  if (!author.name) return '';
  return `${author.name} <${author.email}>`;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const MODEL_DEFAULTS: ModelConfig = {
  name:           'Xenova/bge-m3',
  pooling:        'cls',
  normalize:      true,
  dtype:          'q8',
  queryPrefix:    '',
  documentPrefix: '',
};

const CODE_MODEL_DEFAULTS: ModelConfig = {
  name:           'jinaai/jina-embeddings-v2-base-code',
  pooling:        'mean',
  normalize:      true,
  dtype:          'q8',
  queryPrefix:    '',
  documentPrefix: '',
};

const EMBEDDING_DEFAULTS: EmbeddingConfig = {
  batchSize:      1,
  maxChars:       24_000,
  cacheSize:      10_000,
};

const OAUTH_DEFAULTS: OAuthConfig = {
  enabled:         false,
  accessTokenTtl:  '1h',
  refreshTokenTtl: '7d',
  authCodeTtl:     '10m',
};

const RATE_LIMIT_DEFAULTS: RateLimitConfig = {
  global: 600,
  search: 120,
  auth:   10,
};

const SERVER_DEFAULTS: Omit<ServerConfig, 'embedding'> & { embedding: EmbeddingConfig } = {
  host:            '127.0.0.1',
  port:            3000,
  sessionTimeout:  3600,
  modelsDir:       path.join(HOME, '.graph-memory/models'),
  model:           MODEL_DEFAULTS,
  codeModel:       CODE_MODEL_DEFAULTS,
  embedding:       EMBEDDING_DEFAULTS,
  defaultAccess:   'rw',
  accessTokenTtl:  '15m',
  refreshTokenTtl: '7d',
  rateLimit:       RATE_LIMIT_DEFAULTS,
  maxFileSize:     1 * 1024 * 1024,  // 1 MB
  exclude:         ['**/node_modules/**', '**/dist/**'],
  redis:           { ...REDIS_DEFAULTS },
  oauth:           { ...OAUTH_DEFAULTS },
};

const PROJECT_DEFAULTS = {
  docsInclude:     '**/*.md',
  codeInclude:     '**/*.{js,ts,jsx,tsx,mjs,mts,cjs,cts}',
  chunkDepth:      4,
};

/** Parse comma-separated exclude string into array of patterns. */
function parseExclude(raw?: string | string[]): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(p => p.trim()).filter(Boolean);
  return raw.split(',').map(p => p.trim()).filter(Boolean);
}

/** Normalize include: array stays as array, string stays as string, undefined stays undefined. */
function parseInclude(raw?: string | string[]): string | string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.map(p => p.trim()).filter(Boolean);
  return raw;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve ModelConfig: take the whole object from the first level that defines it.
 * If undefined, returns parent (next level up the chain).
 */
function resolveModel(
  raw: z.infer<typeof modelConfigSchema> | undefined,
  parent: ModelConfig,
): ModelConfig {
  if (!raw) return parent;
  return {
    name:           raw.name,
    pooling:        raw.pooling         ?? MODEL_DEFAULTS.pooling,
    normalize:      raw.normalize       ?? MODEL_DEFAULTS.normalize,
    dtype:          raw.dtype,
    queryPrefix:    raw.queryPrefix     ?? MODEL_DEFAULTS.queryPrefix,
    documentPrefix: raw.documentPrefix  ?? MODEL_DEFAULTS.documentPrefix,
  };
}

/**
 * Resolve EmbeddingConfig: each field individually inherits up the chain.
 */
function resolveEmbedding(
  raw: z.infer<typeof embeddingConfigSchema> | undefined,
  parent: EmbeddingConfig,
): EmbeddingConfig {
  if (!raw) return parent;
  return {
    batchSize:      raw.batchSize       ?? parent.batchSize,
    maxChars:       raw.maxChars        ?? parent.maxChars,
    cacheSize:      raw.cacheSize       ?? parent.cacheSize,
    remote:         raw.remote          ?? parent.remote,
    remoteApiKey:   raw.remoteApiKey    ?? parent.remoteApiKey,
    remoteModel:    raw.remoteModel     ?? parent.remoteModel,
  };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Load and validate a `graph-memory.yaml` config file.
 * Resolves all paths to absolute, applies defaults.
 */
export function loadMultiConfig(yamlPath: string): MultiConfig {
  const raw = fs.readFileSync(yamlPath, 'utf-8');
  const parsed = parseYaml(raw);
  const validated = configFileSchema.parse(parsed);

  const srv = validated.server ?? {};
  const globalAuthor: AuthorConfig = validated.author ?? AUTHOR_DEFAULT;

  // Server-level: model + codeModel + embedding
  const serverModel = resolveModel(srv.model, MODEL_DEFAULTS);
  const serverCodeModel = resolveModel(srv.codeModel, CODE_MODEL_DEFAULTS);
  const serverEmbedding = resolveEmbedding(srv.embedding, EMBEDDING_DEFAULTS);

  const server: ServerConfig = {
    host:            srv.host            ?? SERVER_DEFAULTS.host,
    port:            srv.port            ?? SERVER_DEFAULTS.port,
    sessionTimeout:  srv.sessionTimeout  ?? SERVER_DEFAULTS.sessionTimeout,
    modelsDir:       path.resolve(srv.modelsDir ?? SERVER_DEFAULTS.modelsDir),
    corsOrigins:     srv.corsOrigins,
    model:           serverModel,
    codeModel:       serverCodeModel,
    embedding:       serverEmbedding,
    embeddingApi:    srv.embeddingApi ? { enabled: !!srv.embeddingApi.enabled, apiKey: srv.embeddingApi.apiKey, maxTexts: srv.embeddingApi.maxTexts ?? 100, maxTextChars: srv.embeddingApi.maxTextChars ?? 10_000 } : undefined,
    defaultAccess:   srv.defaultAccess   ?? SERVER_DEFAULTS.defaultAccess,
    access:          srv.access          ?? undefined,
    jwtSecret:       srv.jwtSecret,
    cookieSecure:    srv.cookieSecure,
    accessTokenTtl:  srv.accessTokenTtl  ?? SERVER_DEFAULTS.accessTokenTtl,
    refreshTokenTtl: srv.refreshTokenTtl ?? SERVER_DEFAULTS.refreshTokenTtl,
    rateLimit: {
      global: srv.rateLimit?.global ?? RATE_LIMIT_DEFAULTS.global,
      search: srv.rateLimit?.search ?? RATE_LIMIT_DEFAULTS.search,
      auth:   srv.rateLimit?.auth   ?? RATE_LIMIT_DEFAULTS.auth,
    },
    maxFileSize:     srv.maxFileSize     ?? SERVER_DEFAULTS.maxFileSize,
    exclude:         [...SERVER_DEFAULTS.exclude, ...parseExclude(srv.exclude)],
    redis: {
      enabled:           srv.redis?.enabled           ?? REDIS_DEFAULTS.enabled,
      url:               srv.redis?.url               ?? REDIS_DEFAULTS.url,
      prefix:            srv.redis?.prefix            ?? REDIS_DEFAULTS.prefix,
      embeddingCacheTtl: srv.redis?.embeddingCacheTtl ?? REDIS_DEFAULTS.embeddingCacheTtl,
    },
    oauth: {
      enabled:         srv.oauth?.enabled         ?? OAUTH_DEFAULTS.enabled,
      accessTokenTtl:  srv.oauth?.accessTokenTtl  ?? OAUTH_DEFAULTS.accessTokenTtl,
      refreshTokenTtl: srv.oauth?.refreshTokenTtl ?? OAUTH_DEFAULTS.refreshTokenTtl,
      authCodeTtl:     srv.oauth?.authCodeTtl     ?? OAUTH_DEFAULTS.authCodeTtl,
    },
  };

  // Users
  const users: Record<string, UserConfig> = {};
  if (validated.users) {
    for (const [id, raw] of Object.entries(validated.users)) {
      users[id] = { name: raw.name, email: raw.email, apiKey: raw.apiKey, passwordHash: raw.passwordHash };
    }
  }

  const projects = new Map<string, ProjectConfig>();

  for (const [id, raw] of Object.entries(validated.projects)) {
    const projectDir = path.resolve(raw.projectDir);
    const graphMemory = raw.graphMemory
      ? path.resolve(projectDir, raw.graphMemory)
      : path.join(projectDir, '.graph-memory');

    const projectModel = resolveModel(raw.model, serverModel);
    const projectCodeModel = resolveModel(raw.codeModel, serverCodeModel);
    const projectEmbedding = resolveEmbedding(raw.embedding, serverEmbedding);
    // Exclude accumulates: server + project
    const projectExclude = [...server.exclude, ...parseExclude(raw.exclude)];

    const rawGraphs = raw.graphs ?? {};

    const graphConfigs = {} as Record<GraphName, GraphConfig>;
    for (const gn of GRAPH_NAMES) {
      const gc = rawGraphs[gn as keyof typeof rawGraphs];
      // Exclude accumulates: server + project + graph
      const graphExclude = [...projectExclude, ...parseExclude(gc?.exclude)];

      const graphEmbedding = resolveEmbedding(gc?.embedding, projectEmbedding);
      // Auto-set remoteModel for code graph when using remote embedding
      if (gn === 'code' && graphEmbedding.remote && !graphEmbedding.remoteModel) {
        graphEmbedding.remoteModel = 'code';
      }

      graphConfigs[gn] = {
        enabled: gc?.enabled ?? true,
        readonly: gc?.readonly ?? false,
        include: parseInclude(gc?.include) ?? (gn === 'docs' ? PROJECT_DEFAULTS.docsInclude : gn === 'code' ? PROJECT_DEFAULTS.codeInclude : undefined),
        exclude: graphExclude,
        model: resolveModel(gc?.model, gn === 'code' ? projectCodeModel : projectModel),
        embedding: graphEmbedding,
        access: gc?.access ?? undefined,
      };
    }

    projects.set(id, {
      projectDir,
      graphMemory,
      exclude:         projectExclude,
      chunkDepth:      raw.chunkDepth      ?? PROJECT_DEFAULTS.chunkDepth,
      maxFileSize:     raw.maxFileSize     ?? -1,
      model:           projectModel,
      codeModel:       projectCodeModel,
      embedding:       projectEmbedding,
      graphConfigs,
      author:          raw.author          ?? globalAuthor,
      access:          raw.access          ?? undefined,
    });
  }

  // --- Workspaces ---
  const workspaces = new Map<string, WorkspaceConfig>();

  if (validated.workspaces) {
    for (const [wsId, raw] of Object.entries(validated.workspaces)) {
      for (const projId of raw.projects) {
        if (!projects.has(projId)) {
          throw new Error(`Workspace "${wsId}" references unknown project "${projId}"`);
        }
      }

      const firstProject = projects.get(raw.projects[0])!;
      const graphMemory = raw.graphMemory
        ? path.resolve(raw.graphMemory)
        : path.join(firstProject.projectDir, '.graph-memory', 'workspace');
      const mirrorDir = raw.mirrorDir
        ? path.resolve(raw.mirrorDir)
        : graphMemory;

      const wsModel = resolveModel(raw.model, serverModel);
      const wsCodeModel = resolveModel(raw.codeModel, serverCodeModel);
      const wsEmbedding = resolveEmbedding(raw.embedding, serverEmbedding);
      // Exclude accumulates: server + workspace
      const wsExclude = [...server.exclude, ...parseExclude(raw.exclude)];

      const rawGraphs = raw.graphs ?? {};
      const WS_GRAPH_NAMES: WsGraphName[] = ['knowledge', 'tasks', 'skills'];
      const graphConfigs = {} as Record<WsGraphName, GraphConfig>;

      for (const gn of WS_GRAPH_NAMES) {
        const gc = rawGraphs[gn];
        graphConfigs[gn] = {
          enabled: gc?.enabled ?? true,
          readonly: gc?.readonly ?? false,
          exclude: [...wsExclude, ...parseExclude(gc?.exclude)],
          model: resolveModel(gc?.model, wsModel),
          embedding: resolveEmbedding(gc?.embedding, wsEmbedding),
          access: gc?.access ?? undefined,
        };
      }

      workspaces.set(wsId, {
        projects:       raw.projects,
        graphMemory,
        mirrorDir,
        model:          wsModel,
        codeModel:      wsCodeModel,
        embedding:      wsEmbedding,
        graphConfigs,
        author:         raw.author ?? globalAuthor,
        access:         raw.access ?? undefined,
        maxFileSize:    raw.maxFileSize,
        exclude:        wsExclude,
      });
    }
  }

  // --- Post-parse: inject workspace-level settings into member projects ---
  const wsForProject = new Map<string, WorkspaceConfig>();
  for (const ws of workspaces.values()) {
    for (const pid of ws.projects) wsForProject.set(pid, ws);
  }
  for (const [pid, proj] of projects) {
    const ws = wsForProject.get(pid);
    // maxFileSize: project → workspace → server
    if (proj.maxFileSize === -1) {
      proj.maxFileSize = ws?.maxFileSize ?? server.maxFileSize;
    }
    // Inject workspace excludes into project + graph excludes
    if (ws) {
      const wsExtra = ws.exclude.filter(e => !server.exclude.includes(e)); // ws-only patterns
      if (wsExtra.length > 0) {
        proj.exclude = [...proj.exclude, ...wsExtra];
        for (const gn of GRAPH_NAMES) {
          proj.graphConfigs[gn].exclude = [...proj.graphConfigs[gn].exclude, ...wsExtra];
        }
      }
    }
  }

  return { author: globalAuthor, server, users, projects, workspaces };
}

/**
 * Build a default MultiConfig for a single project rooted at `projectDir`.
 * Used when no config file is found — zero-config startup.
 */
export function defaultConfig(projectDir: string): MultiConfig {
  const absDir = path.resolve(projectDir);
  const id = path.basename(absDir);

  const server: ServerConfig = {
    host:            SERVER_DEFAULTS.host,
    port:            SERVER_DEFAULTS.port,
    sessionTimeout:  SERVER_DEFAULTS.sessionTimeout,
    modelsDir:       path.resolve(SERVER_DEFAULTS.modelsDir),
    model:           MODEL_DEFAULTS,
    codeModel:       CODE_MODEL_DEFAULTS,
    embedding:       EMBEDDING_DEFAULTS,
    defaultAccess:   SERVER_DEFAULTS.defaultAccess,
    accessTokenTtl:  SERVER_DEFAULTS.accessTokenTtl,
    refreshTokenTtl: SERVER_DEFAULTS.refreshTokenTtl,
    rateLimit:       RATE_LIMIT_DEFAULTS,
    maxFileSize:     SERVER_DEFAULTS.maxFileSize,
    exclude:         [...SERVER_DEFAULTS.exclude],
    redis:           { ...REDIS_DEFAULTS },
    oauth:           { ...OAUTH_DEFAULTS },
  };

  const graphConfigs = {} as Record<GraphName, GraphConfig>;
  for (const gn of GRAPH_NAMES) {
    graphConfigs[gn] = {
      enabled: true,
      readonly: false,
      include: gn === 'docs' ? PROJECT_DEFAULTS.docsInclude : gn === 'code' ? PROJECT_DEFAULTS.codeInclude : undefined,
      exclude: [...server.exclude],
      model: gn === 'code' ? CODE_MODEL_DEFAULTS : MODEL_DEFAULTS,
      embedding: EMBEDDING_DEFAULTS,
    };
  }

  const project: ProjectConfig = {
    projectDir: absDir,
    graphMemory: path.join(absDir, '.graph-memory'),
    exclude: [...server.exclude],
    chunkDepth: PROJECT_DEFAULTS.chunkDepth,
    maxFileSize: server.maxFileSize,
    model: MODEL_DEFAULTS,
    codeModel: CODE_MODEL_DEFAULTS,
    embedding: EMBEDDING_DEFAULTS,
    graphConfigs,
    author: AUTHOR_DEFAULT,
  };

  const projects = new Map<string, ProjectConfig>();
  projects.set(id, project);

  return {
    author: AUTHOR_DEFAULT,
    server,
    users: {},
    projects,
    workspaces: new Map(),
  };
}
