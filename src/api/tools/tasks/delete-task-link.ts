import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import type { GraphName } from '@/store/types';
import { MAX_LINK_KIND_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_delete_link',
    {
      description:
        'Remove a link from a task to another task (same-graph) or to a node in the docs, code, files, knowledge, or skills graph (cross-graph). ' +
        'Omit targetGraph or set it to "tasks" for same-graph task-to-task links; set it for cross-graph links.',
      inputSchema: {
        taskId:      z.number().int().positive().describe('Source task ID'),
        targetId:    z.number().int().positive().describe('Target node ID'),
        kind:        z.string().min(1).max(MAX_LINK_KIND_LEN).describe('Relation type to delete'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills', 'tasks']).optional()
          .describe('Target graph. Defaults to "tasks".'),
      },
    },
    async ({ taskId, targetId, kind, targetGraph }) => {
      const toGraph = (targetGraph ?? 'tasks') as GraphName;
      try {
        mgr.deleteEdge({ fromGraph: 'tasks', fromId: taskId, toGraph, toId: targetId, kind });
        return { content: [{ type: 'text', text: JSON.stringify({ taskId, targetId, targetGraph: toGraph, deleted: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Link not found.' }], isError: true };
        }
        throw err;
      }
    },
  );
}
