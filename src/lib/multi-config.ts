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
});

const graphEmbeddingOverridesSchema = z.object({
  docs:      embeddingConfigSchema.partial().optional(),
  code:      embeddingConfigSchema.partial().optional(),
  knowledge: embeddingConfigSchema.partial().optional(),
  tasks:     embeddingConfigSchema.partial().optional(),
  files:     embeddingConfigSchema.partial().optional(),
  skills:    embeddingConfigSchema.partial().optional(),
});

const projectSchema = z.object({
  projectDir:      z.string(),
  graphMemory:     z.string().optional(),
  docsPattern:     z.string().optional(),
  codePattern:     z.string().optional(),
  excludePattern:  z.string().optional(),
  tsconfig:        z.string().optional(),
  chunkDepth:      z.number().int().positive().optional(),
  maxTokensDefault: z.number().int().positive().optional(),
  embedMaxChars:   z.number().int().positive().optional(),
  embedding:       embeddingConfigSchema.optional(),
  graphs:          graphEmbeddingOverridesSchema.optional(),
  author:          authorSchema.optional(),
});

const serverSchema = z.object({
  host:            z.string().optional(),
  port:            z.number().int().positive().optional(),
  sessionTimeout:  z.number().int().positive().optional(),
  modelsDir:       z.string().optional(),
  embedding:       embeddingConfigSchema.optional(),
});

const wsGraphOverridesSchema = z.object({
  knowledge: embeddingConfigSchema.partial().optional(),
  tasks:     embeddingConfigSchema.partial().optional(),
  skills:    embeddingConfigSchema.partial().optional(),
});

const workspaceSchema = z.object({
  projects:       z.array(z.string()),
  graphMemory:    z.string().optional(),
  mirrorDir:      z.string().optional(),
  embedding:      embeddingConfigSchema.optional(),
  graphs:         wsGraphOverridesSchema.optional(),
  author:         authorSchema.optional(),
});

const configFileSchema = z.object({
  author:     authorSchema.optional(),
  server:     serverSchema.optional(),
  projects:   z.record(z.string(), projectSchema),
  workspaces: z.record(z.string(), workspaceSchema).optional(),
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GraphName = 'docs' | 'code' | 'knowledge' | 'tasks' | 'files' | 'skills';

export const GRAPH_NAMES: GraphName[] = ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'];

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
}

/**
 * Build a stable fingerprint string from embedding config fields that affect embeddings.
 * Used to detect config changes that require re-indexing.
 */
export function embeddingFingerprint(config: EmbeddingConfig): string {
  return `${config.model}|${config.pooling}|${config.normalize}|${config.dtype ?? ''}|${config.documentPrefix}`;
}

export interface ServerConfig {
  host: string;
  port: number;
  sessionTimeout: number;
  modelsDir: string;
  embedding: EmbeddingConfig;
}

export interface ProjectConfig {
  projectDir: string;
  graphMemory: string;
  docsPattern: string;
  codePattern: string;
  excludePattern: string;
  tsconfig?: string;
  chunkDepth: number;
  maxTokensDefault: number;
  embedMaxChars: number;
  embedding: EmbeddingConfig;
  graphEmbeddings: Record<GraphName, EmbeddingConfig>;
  author: AuthorConfig;
}

export interface WorkspaceConfig {
  projects: string[];
  graphMemory: string;
  mirrorDir: string;
  embedding: EmbeddingConfig;
  graphEmbeddings: Record<'knowledge' | 'tasks' | 'skills', EmbeddingConfig>;
  author: AuthorConfig;
}

export interface MultiConfig {
  author: AuthorConfig;
  server: ServerConfig;
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
};

const SERVER_DEFAULTS: Omit<ServerConfig, 'embedding'> & { embedding: EmbeddingConfig } = {
  host:           '127.0.0.1',
  port:           3000,
  sessionTimeout: 1800,
  modelsDir:      path.join(HOME, '.graph-memory/models'),
  embedding:      EMBEDDING_DEFAULTS,
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
    host:           srv.host           ?? SERVER_DEFAULTS.host,
    port:           srv.port           ?? SERVER_DEFAULTS.port,
    sessionTimeout: srv.sessionTimeout ?? SERVER_DEFAULTS.sessionTimeout,
    modelsDir:      path.resolve(srv.modelsDir ?? SERVER_DEFAULTS.modelsDir),
    embedding:      globalEmbedding,
  };

  const projects = new Map<string, ProjectConfig>();

  for (const [id, raw] of Object.entries(validated.projects)) {
    const projectDir = path.resolve(raw.projectDir);
    const graphMemory = raw.graphMemory
      ? path.resolve(projectDir, raw.graphMemory)
      : path.join(projectDir, '.graph-memory');

    // Project-level embedding (inherits from server)
    const projectEmbedding = resolveEmbeddingConfig(raw.embedding, globalEmbedding);

    // Per-graph embeddings (inherit from project)
    const graphOverrides = raw.graphs ?? {};
    const graphEmbeddings = {} as Record<GraphName, EmbeddingConfig>;
    for (const gn of GRAPH_NAMES) {
      graphEmbeddings[gn] = mergeEmbeddingConfig(
        projectEmbedding,
        graphOverrides[gn as keyof typeof graphOverrides] as Partial<EmbeddingConfig> | undefined,
      );
    }

    projects.set(id, {
      projectDir,
      graphMemory,
      docsPattern:     raw.docsPattern     ?? PROJECT_DEFAULTS.docsPattern,
      codePattern:     raw.codePattern     ?? PROJECT_DEFAULTS.codePattern,
      excludePattern:  raw.excludePattern  ?? PROJECT_DEFAULTS.excludePattern,
      tsconfig:        raw.tsconfig,
      chunkDepth:      raw.chunkDepth      ?? PROJECT_DEFAULTS.chunkDepth,
      maxTokensDefault: raw.maxTokensDefault ?? PROJECT_DEFAULTS.maxTokensDefault,
      embedMaxChars:   raw.embedMaxChars   ?? PROJECT_DEFAULTS.embedMaxChars,
      embedding:       projectEmbedding,
      graphEmbeddings,
      author:          raw.author          ?? globalAuthor,
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

      // Per-graph embeddings for workspace's shared graphs (knowledge, tasks, skills)
      const graphOverrides = raw.graphs ?? {};
      const graphEmbeddings = {
        knowledge: mergeEmbeddingConfig(wsEmbedding, graphOverrides.knowledge as Partial<EmbeddingConfig> | undefined),
        tasks:     mergeEmbeddingConfig(wsEmbedding, graphOverrides.tasks     as Partial<EmbeddingConfig> | undefined),
        skills:    mergeEmbeddingConfig(wsEmbedding, graphOverrides.skills    as Partial<EmbeddingConfig> | undefined),
      };

      workspaces.set(wsId, {
        projects:       raw.projects,
        graphMemory,
        mirrorDir,
        embedding:      wsEmbedding,
        graphEmbeddings,
        author:         raw.author ?? globalAuthor,
      });
    }
  }

  return { author: globalAuthor, server, projects, workspaces };
}
