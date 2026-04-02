import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, type McpSessionContext } from '@/api/index';
import { SqliteStore } from '@/store';
import { StoreManager } from '@/lib/store-manager';
import type { DocGraph } from '@/graphs/docs';
import type { CodeGraph } from '@/graphs/code-types';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import type { FileIndexGraph } from '@/graphs/file-index-types';
import type { TaskGraph } from '@/graphs/task-types';
import type { SkillGraph } from '@/graphs/skill-types';
import type { EmbedFn, EmbedFns } from '@/graphs/manager-types';

// ---------------------------------------------------------------------------
// Fake embeddings
// ---------------------------------------------------------------------------

export const DIM = 32;

export function unitVec(axis: number, dim: number = DIM): number[] {
  const v = new Array<number>(dim).fill(0);
  v[axis % dim] = 1;
  return v;
}

export function createFakeEmbed(
  queryAxes: Array<[string, number]>,
  dim: number = DIM,
): (query: string) => Promise<number[]> {
  return (query: string) => {
    const lq = query.toLowerCase();
    for (const [kw, axis] of queryAxes) {
      if (lq.includes(kw)) return Promise.resolve(unitVec(axis, dim));
    }
    return Promise.resolve(new Array<number>(dim).fill(0));
  };
}

/** Wrap a single EmbedFn into an EmbedFns pair (same fn for document and query). */
export function embedFnPair(fn: EmbedFn): EmbedFns {
  return { document: fn, query: fn };
}

// ---------------------------------------------------------------------------
// SQLite Store + StoreManager helpers for tests
// ---------------------------------------------------------------------------

export interface TestStoreContext {
  store: SqliteStore;
  storeManager: StoreManager;
  projectId: number;
  projectDir: string;
  emitter: EventEmitter;
  cleanup: () => void;
}

/**
 * Create a temporary SQLite store + StoreManager for integration tests.
 * Call `cleanup()` in afterAll/afterEach to close DB and remove temp dirs.
 */
export function createTestStoreManager(
  embedFn: (text: string) => Promise<number[]>,
  opts?: { projectDir?: string; dim?: number },
): TestStoreContext {
  const dbDir = mkdtempSync(join(tmpdir(), 'mcp-test-db-'));
  const projectDir = opts?.projectDir ?? mkdtempSync(join(tmpdir(), 'mcp-test-proj-'));
  const dbPath = join(dbDir, 'test.db');

  const store = new SqliteStore();
  store.open({ dbPath, embeddingDims: { knowledge: opts?.dim ?? DIM, tasks: opts?.dim ?? DIM, skills: opts?.dim ?? DIM, epics: opts?.dim ?? DIM } });

  const project = store.projects.create({ slug: 'test', name: 'Test', directory: projectDir });
  const emitter = new EventEmitter();

  const storeManager = new StoreManager({
    store,
    projectId: project.id,
    projectDir,
    embedFn,
    emitter,
  });

  const cleanup = () => {
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
    if (!opts?.projectDir) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  };

  return { store, storeManager, projectId: project.id, projectDir, emitter, cleanup };
}

// ---------------------------------------------------------------------------
// MCP client setup
// ---------------------------------------------------------------------------

export type CallResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

export function text(result: CallResult): string {
  return result.content.find(c => c.type === 'text')?.text ?? '';
}

export function json<T>(result: CallResult): T {
  return JSON.parse(text(result)) as T;
}

/** Parse a paginated list response (`{ results, total }`) and return just the results array. */
export function jsonList<T>(result: CallResult): T[] {
  const parsed = JSON.parse(text(result)) as { results: T[]; total: number };
  return parsed.results;
}

export interface McpTestContext {
  client: Client;
  call: (name: string, args?: Record<string, unknown>) => Promise<CallResult>;
  close: () => Promise<void>;
}

export async function setupMcpClient(opts: {
  docGraph?: DocGraph;
  codeGraph?: CodeGraph;
  knowledgeGraph?: KnowledgeGraph;
  fileIndexGraph?: FileIndexGraph;
  taskGraph?: TaskGraph;
  skillGraph?: SkillGraph;
  embedFn?: (query: string) => Promise<number[]>;
  sessionContext?: McpSessionContext;
  projectDir?: string;
  storeManager?: StoreManager;
  readonlyGraphs?: Set<string>;
  userAccess?: Map<string, string>;
}): Promise<McpTestContext> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(
    opts.docGraph,
    opts.codeGraph,
    opts.knowledgeGraph,
    opts.fileIndexGraph,
    opts.taskGraph,
    opts.embedFn,
    undefined,
    opts.projectDir,
    opts.skillGraph,
    opts.sessionContext,
    opts.readonlyGraphs,
    opts.userAccess as any,
    undefined,
    undefined,
    opts.storeManager,
  );
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  const call = (name: string, args: Record<string, unknown> = {}): Promise<CallResult> =>
    client.callTool({ name, arguments: args }) as Promise<CallResult>;

  const close = () => client.close();

  return { client, call, close };
}
