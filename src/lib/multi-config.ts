import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const HOME = os.homedir();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

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
  embeddingModel:  z.string().optional(),
  docsModel:       z.string().optional(),
  codeModel:       z.string().optional(),
  knowledgeModel:  z.string().optional(),
  taskModel:       z.string().optional(),
  filesModel:      z.string().optional(),
  skillsModel:     z.string().optional(),
  author:          z.string().optional(),
});

const serverSchema = z.object({
  host:            z.string().optional(),
  port:            z.number().int().positive().optional(),
  sessionTimeout:  z.number().int().positive().optional(),
  modelsDir:       z.string().optional(),
  embeddingModel:  z.string().optional(),
  author:          z.string().optional(),
});

const configFileSchema = z.object({
  server:   serverSchema.optional(),
  projects: z.record(z.string(), projectSchema),
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ServerConfig {
  host: string;
  port: number;
  sessionTimeout: number;
  modelsDir: string;
  embeddingModel: string;
  author: string;
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
  embeddingModel: string;
  docsModel?: string;
  codeModel?: string;
  knowledgeModel?: string;
  taskModel?: string;
  filesModel?: string;
  skillsModel?: string;
  author: string;
}

export interface MultiConfig {
  server: ServerConfig;
  projects: Map<string, ProjectConfig>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const SERVER_DEFAULTS: ServerConfig = {
  host:           '127.0.0.1',
  port:           3000,
  sessionTimeout: 1800,
  modelsDir:      path.join(HOME, '.graph-memory/models'),
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  author:         '',
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
  const globalModel = srv.embeddingModel ?? SERVER_DEFAULTS.embeddingModel;

  const globalAuthor = srv.author ?? SERVER_DEFAULTS.author;

  const server: ServerConfig = {
    host:           srv.host           ?? SERVER_DEFAULTS.host,
    port:           srv.port           ?? SERVER_DEFAULTS.port,
    sessionTimeout: srv.sessionTimeout ?? SERVER_DEFAULTS.sessionTimeout,
    modelsDir:      path.resolve(srv.modelsDir ?? SERVER_DEFAULTS.modelsDir),
    embeddingModel: globalModel,
    author:         globalAuthor,
  };

  const projects = new Map<string, ProjectConfig>();

  for (const [id, raw] of Object.entries(validated.projects)) {
    const projectDir = path.resolve(raw.projectDir);
    const graphMemory = raw.graphMemory
      ? path.resolve(projectDir, raw.graphMemory)
      : path.join(projectDir, '.graph-memory');

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
      embeddingModel:  raw.embeddingModel  ?? globalModel,
      docsModel:       raw.docsModel,
      codeModel:       raw.codeModel,
      knowledgeModel:  raw.knowledgeModel,
      taskModel:       raw.taskModel,
      filesModel:      raw.filesModel,
      skillsModel:     raw.skillsModel,
      author:          raw.author          ?? globalAuthor,
    });
  }

  return { server, projects };
}
