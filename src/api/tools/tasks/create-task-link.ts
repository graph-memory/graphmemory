import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import type { GraphName } from '@/store/types';
import { MAX_LINK_KIND_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_create_link',
    {
      description:
        'Link a task to another task (same-graph) or to a node in the docs, code, files, knowledge, or skills graph (cross-graph). ' +
        'Omit targetGraph or set it to "tasks" for same-graph task-to-task links; set it for cross-graph links. ' +
        'The kind is a free-form string, e.g. "references", "fixes", "implements", "documents".',
      inputSchema: {
        taskId:      z.number().int().positive().describe('Source task ID'),
        targetId:    z.number().int().positive().describe('Target node ID'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills', 'tasks']).optional()
          .describe('Target graph: "docs", "code", "files", "knowledge", "skills", or "tasks". Defaults to "tasks" for task-to-task links.'),
        kind:        z.string().min(1).max(MAX_LINK_KIND_LEN).describe('Relation type, e.g. "references", "fixes", "implements", "documents"'),
      },
    },
    async ({ taskId, targetId, targetGraph, kind }) => {
      const toGraph = (targetGraph ?? 'tasks') as GraphName;
      try {
        mgr.createEdge({ fromGraph: 'tasks', fromId: taskId, toGraph, toId: targetId, kind });
        return { content: [{ type: 'text', text: JSON.stringify({ taskId, targetId, targetGraph: toGraph, kind, created: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && (err.message.includes('not found') || err.message.includes('already exists'))) {
          return { content: [{ type: 'text', text: 'Could not create link — source or target not found, or link already exists.' }], isError: true };
        }
        throw err;
      }
    },
  );
}
