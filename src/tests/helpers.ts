import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '@/api/index';
import type { DocGraph } from '@/graphs/docs';
import type { CodeGraph } from '@/graphs/code-types';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import type { FileIndexGraph } from '@/graphs/file-index-types';
import type { TaskGraph } from '@/graphs/task-types';
import type { SkillGraph } from '@/graphs/skill-types';

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
    undefined,
    opts.skillGraph,
  );
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  const call = (name: string, args: Record<string, unknown> = {}): Promise<CallResult> =>
    client.callTool({ name, arguments: args }) as Promise<CallResult>;

  const close = () => client.close();

  return { client, call, close };
}
