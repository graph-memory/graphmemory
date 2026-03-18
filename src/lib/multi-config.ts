import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const HOME = os.homedir();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const authorSchema = z.object({
  name:  z.string(),
  email: z.string(),
});

const embeddingConfigSchema = z.object({
  model:           z.string(),
  pooling:         z.enum(['mean', 'cls']).optional(),
  normalize:       z.boolean().optional(),
  dtype:           z.string().optional(),
  queryPrefix:     z.string().optional(),
  documentPrefix:  z.string().optional(),
  batchSize:       z.number().int().positive().optional(),
  remote:          z.string().optional(),    // Remote embedding API URL
  remoteApiKey:    z.string().optional(),    // API key for remote embedding
});

const accessLevelSchema = z.enum(['deny', 'r', 'rw']);
const accessMapSchema = z.record(z.string(), accessLevelSchema).optional();

const userSchema = z.object({
  name:         z.string(),
  email:        z.string(),
  apiKey:       z.string(),
  passwordHash: z.string().optional(),
});

const graphConfigSchema = z.object({
  enabled:        z.boolean().optional(),
  pattern:        z.string().optional(),
  excludePattern: z.string().optional(),
  embedding:      embeddingConfigSchema.optional(),
  access:         accessMapSchema,
  // Legacy: flat partial embedding overrides (e.g. graphs.docs.model)
  model:          z.string().optional(),
  pooling:        z.enum(['mean', 'cls']).optional(),
  normalize:      z.boolean().optional(),
  dtype:          z.string().optional(),
  queryPrefix:    z.string().optional(),
  documentPrefix: z.string().optional(),
  batchSize:      z.number().int().positive().optional(),
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
  docsPattern:     z.string().optional(),     // deprecated → graphs.docs.pattern
  codePattern:     z.string().optional(),     // deprecated → graphs.code.pattern
  excludePattern:  z.string().optional(),
  tsconfig:        z.string().optional(),
  chunkDepth:      z.number().int().positive().optional(),
  maxTokensDefault: z.number().int().positive().optional(),
  embedMaxChars:   z.number().int().positive().optional(),
  embedding:       embeddingConfigSchema.optional(),
  graphs:          graphsConfigSchema.optional(),
  author:          authorSchema.optional(),
  access:          accessMapSchema,
});

const embeddingApiSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey:  z.string().optional(),
});

const serverSchema = z.object({
  host:            z.string().optional(),
  port:            z.number().int().positive().optional(),
  sessionTimeout:  z.number().int().positive().optional(),
  modelsDir:       z.string().optional(),
  corsOrigins:     z.array(z.string()).optional(),
  embedding:       embeddingConfigSchema.optional(),
  embeddingApi:    embeddingApiSchema.optional(),
  defaultAccess:   accessLevelSchema.optional(),
  access:          accessMapSchema,
  jwtSecret:       z.string().optional(),
  accessTokenTtl:  z.string().optional(),
  refreshTokenTtl: z.string().optional(),
});

const wsGraphConfigSchema = z.object({
  enabled:        z.boolean().optional(),
  embedding:      embeddingConfigSchema.optional(),
  // Legacy: flat partial embedding overrides
  model:          z.string().optional(),
  pooling:        z.enum(['mean', 'cls']).optional(),
  normalize:      z.boolean().optional(),
  dtype:          z.string().optional(),
  queryPrefix:    z.string().optional(),
  documentPrefix: z.string().optional(),
  batchSize:      z.number().int().positive().optional(),
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
  embedding:      embeddingConfigSchema.optional(),
  graphs:         wsGraphsConfigSchema.optional(),
  author:         authorSchema.optional(),
  access:         accessMapSchema,
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

export interface EmbeddingConfig {
  model: string;
  pooling: 'mean' | 'cls';
  normalize: boolean;
  dtype?: string;
  queryPrefix: string;
  documentPrefix: string;
  batchSize: number;
  remote?: string;       // Remote embedding API URL (replaces local ONNX)
  remoteApiKey?: string; // API key for remote embedding
}

export interface EmbeddingApiConfig {
  enabled: boolean;
  apiKey?: string;
}

/**
 * Build a stable fingerprint string from embedding config fields that affect stored vectors.
 * Used to detect config changes that require re-indexing.
 *
 * queryPrefix is intentionally excluded: it only affects query-time embeddings,
 * not the stored document vectors — so changing it does not require re-indexing.
 */
export function embeddingFingerprint(config: EmbeddingConfig): string {
  return `${config.model}|${config.pooling}|${config.normalize}|${config.dtype ?? ''}|${config.documentPrefix}`;
}

export interface ServerConfig {
  host: string;
  port: number;
  sessionTimeout: number;
  modelsDir: string;
  corsOrigins?: string[];
  embedding: EmbeddingConfig;
  embeddingApi?: EmbeddingApiConfig;
  defaultAccess: AccessLevel;
  access?: AccessMap;
  jwtSecret?: string;
  accessTokenTtl: string;
  refreshTokenTtl: string;
}

export interface GraphConfig {
  enabled: boolean;
  pattern?: string;
  excludePattern?: string;
  embedding: EmbeddingConfig;
  access?: AccessMap;
}

export interface ProjectConfig {
  projectDir: string;
  graphMemory: string;
  excludePattern: string;
  tsconfig?: string;
  chunkDepth: number;
  maxTokensDefault: number;
  embedMaxChars: number;
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
  embedding: EmbeddingConfig;
  graphConfigs: Record<WsGraphName, GraphConfig>;
  author: AuthorConfig;
  access?: AccessMap;
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

const EMBEDDING_DEFAULTS: EmbeddingConfig = {
  model:          'Xenova/bge-m3',
  pooling:        'cls',
  normalize:      true,
  queryPrefix:    '',
  documentPrefix: '',
  batchSize:      1,
};

const SERVER_DEFAULTS: Omit<ServerConfig, 'embedding'> & { embedding: EmbeddingConfig } = {
  host:            '127.0.0.1',
  port:            3000,
  sessionTimeout:  1800,
  modelsDir:       path.join(HOME, '.graph-memory/models'),
  embedding:       EMBEDDING_DEFAULTS,
  defaultAccess:   'rw',
  accessTokenTtl:  '15m',
  refreshTokenTtl: '7d',
};

const PROJECT_DEFAULTS = {
  docsPattern:     '**/*.md',
  codePattern:     '**/*.{js,ts,jsx,tsx}',
  excludePattern:  'node_modules/**',
  chunkDepth:      4,
  maxTokensDefault: 4000,
  embedMaxChars:   2000,
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Merge embedding configs with inheritance:
 *   override fields → base fields → defaults.
 */
function mergeEmbeddingConfig(
  base: EmbeddingConfig,
  override?: Partial<EmbeddingConfig>,
): EmbeddingConfig {
  if (!override) return base;
  return {
    model:          override.model          ?? base.model,
    pooling:        override.pooling        ?? base.pooling,
    normalize:      override.normalize      ?? base.normalize,
    dtype:          override.dtype          ?? base.dtype,
    queryPrefix:    override.queryPrefix    ?? base.queryPrefix,
    documentPrefix: override.documentPrefix ?? base.documentPrefix,
    batchSize:      override.batchSize      ?? base.batchSize,
  };
}

/**
 * Resolve a full EmbeddingConfig from the Zod-parsed raw embedding object,
 * falling back to defaults for missing fields.
 */
function resolveEmbeddingConfig(
  raw: z.infer<typeof embeddingConfigSchema> | undefined,
  fallback: EmbeddingConfig,
): EmbeddingConfig {
  if (!raw) return fallback;
  return {
    model:          raw.model,
    pooling:        raw.pooling         ?? fallback.pooling,
    normalize:      raw.normalize       ?? fallback.normalize,
    dtype:          raw.dtype           ?? fallback.dtype,
    queryPrefix:    raw.queryPrefix     ?? fallback.queryPrefix,
    documentPrefix: raw.documentPrefix  ?? fallback.documentPrefix,
    batchSize:      raw.batchSize       ?? fallback.batchSize,
    remote:         raw.remote          ?? fallback.remote,
    remoteApiKey:   raw.remoteApiKey    ?? fallback.remoteApiKey,
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

  const globalEmbedding = resolveEmbeddingConfig(srv.embedding, EMBEDDING_DEFAULTS);

  const server: ServerConfig = {
    host:            srv.host            ?? SERVER_DEFAULTS.host,
    port:            srv.port            ?? SERVER_DEFAULTS.port,
    sessionTimeout:  srv.sessionTimeout  ?? SERVER_DEFAULTS.sessionTimeout,
    modelsDir:       path.resolve(srv.modelsDir ?? SERVER_DEFAULTS.modelsDir),
    corsOrigins:     srv.corsOrigins,
    embedding:       globalEmbedding,
    embeddingApi:    srv.embeddingApi ? { enabled: !!srv.embeddingApi.enabled, apiKey: srv.embeddingApi.apiKey } : undefined,
    defaultAccess:   srv.defaultAccess   ?? SERVER_DEFAULTS.defaultAccess,
    access:          srv.access          ?? undefined,
    jwtSecret:       srv.jwtSecret,
    accessTokenTtl:  srv.accessTokenTtl  ?? SERVER_DEFAULTS.accessTokenTtl,
    refreshTokenTtl: srv.refreshTokenTtl ?? SERVER_DEFAULTS.refreshTokenTtl,
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

    // Project-level embedding (inherits from server)
    const projectEmbedding = resolveEmbeddingConfig(raw.embedding, globalEmbedding);

    // Backward compat: migrate old flat fields into graphs config
    const rawGraphs = raw.graphs ?? {};

    // Migrate docsPattern → graphs.docs.pattern
    if (raw.docsPattern !== undefined && !rawGraphs.docs?.pattern) {
      if (!rawGraphs.docs) (rawGraphs as any).docs = {};
      if (raw.docsPattern === '') {
        (rawGraphs as any).docs.enabled = false;
      } else {
        (rawGraphs as any).docs.pattern = raw.docsPattern;
      }
    }
    // Migrate codePattern → graphs.code.pattern
    if (raw.codePattern !== undefined && !rawGraphs.code?.pattern) {
      if (!rawGraphs.code) (rawGraphs as any).code = {};
      if (raw.codePattern === '') {
        (rawGraphs as any).code.enabled = false;
      } else {
        (rawGraphs as any).code.pattern = raw.codePattern;
      }
    }

    // Resolve per-graph configs
    const graphConfigs = {} as Record<GraphName, GraphConfig>;
    for (const gn of GRAPH_NAMES) {
      const gc = rawGraphs[gn as keyof typeof rawGraphs];

      // Resolve embedding: first-defined-wins (graph → project → server), no field merge
      // Check for legacy flat fields (model, pooling, etc.) and wrap into embedding
      let graphEmbedding: EmbeddingConfig | undefined;
      if (gc?.embedding) {
        graphEmbedding = resolveEmbeddingConfig(gc.embedding, EMBEDDING_DEFAULTS);
      } else if (gc?.model) {
        // Legacy: flat partial embedding fields at graph level — merge with project
        graphEmbedding = mergeEmbeddingConfig(projectEmbedding, {
          model: gc.model, pooling: gc.pooling, normalize: gc.normalize,
          dtype: gc.dtype, queryPrefix: gc.queryPrefix,
          documentPrefix: gc.documentPrefix, batchSize: gc.batchSize,
        });
      }

      graphConfigs[gn] = {
        enabled: gc?.enabled ?? true,
        pattern: gc?.pattern ?? (gn === 'docs' ? PROJECT_DEFAULTS.docsPattern : gn === 'code' ? PROJECT_DEFAULTS.codePattern : undefined),
        excludePattern: gc?.excludePattern,
        embedding: graphEmbedding ?? projectEmbedding,
        access: gc?.access ?? undefined,
      };
    }

    projects.set(id, {
      projectDir,
      graphMemory,
      excludePattern:  raw.excludePattern  ?? PROJECT_DEFAULTS.excludePattern,
      tsconfig:        raw.tsconfig,
      chunkDepth:      raw.chunkDepth      ?? PROJECT_DEFAULTS.chunkDepth,
      maxTokensDefault: raw.maxTokensDefault ?? PROJECT_DEFAULTS.maxTokensDefault,
      embedMaxChars:   raw.embedMaxChars   ?? PROJECT_DEFAULTS.embedMaxChars,
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
      // Validate that all referenced projects exist
      for (const projId of raw.projects) {
        if (!projects.has(projId)) {
          throw new Error(
            `Workspace "${wsId}" references unknown project "${projId}"`,
          );
        }
      }

      const firstProject = projects.get(raw.projects[0])!;
      const graphMemory = raw.graphMemory
        ? path.resolve(raw.graphMemory)
        : path.join(firstProject.projectDir, '.graph-memory', 'workspace');
      const mirrorDir = raw.mirrorDir
        ? path.resolve(raw.mirrorDir)
        : graphMemory;

      // Workspace-level embedding (inherits from server)
      const wsEmbedding = resolveEmbeddingConfig(raw.embedding, globalEmbedding);

      // Per-graph configs for workspace's shared graphs (knowledge, tasks, skills)
      const rawGraphs = raw.graphs ?? {};
      const WS_GRAPH_NAMES: WsGraphName[] = ['knowledge', 'tasks', 'skills'];
      const graphConfigs = {} as Record<WsGraphName, GraphConfig>;

      for (const gn of WS_GRAPH_NAMES) {
        const gc = rawGraphs[gn];
        let graphEmbedding: EmbeddingConfig | undefined;
        if (gc?.embedding) {
          graphEmbedding = resolveEmbeddingConfig(gc.embedding, EMBEDDING_DEFAULTS);
        } else if (gc?.model) {
          graphEmbedding = mergeEmbeddingConfig(wsEmbedding, {
            model: gc.model, pooling: gc.pooling, normalize: gc.normalize,
            dtype: gc.dtype, queryPrefix: gc.queryPrefix,
            documentPrefix: gc.documentPrefix, batchSize: gc.batchSize,
          });
        }
        graphConfigs[gn] = {
          enabled: gc?.enabled ?? true,
          embedding: graphEmbedding ?? wsEmbedding,
        };
      }

      workspaces.set(wsId, {
        projects:       raw.projects,
        graphMemory,
        mirrorDir,
        embedding:      wsEmbedding,
        graphConfigs,
        author:         raw.author ?? globalAuthor,
        access:         raw.access ?? undefined,
      });
    }
  }

  return { author: globalAuthor, server, users, projects, workspaces };
}
