import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_link',
    {
      description:
        'Create a directed relation between two tasks. ' +
        '"subtask_of": fromId is a subtask of toId. ' +
        '"blocks": fromId blocks toId. ' +
        '"related_to": free association between tasks.',
      inputSchema: {
        fromId: z.number().int().positive().describe('Source task ID'),
        toId:   z.number().int().positive().describe('Target task ID'),
        kind:   z.enum(['subtask_of', 'blocks', 'related_to']).describe('Relation type: "subtask_of", "blocks", or "related_to"'),
      },
    },
    async ({ fromId, toId, kind }) => {
      try {
        mgr.createEdge({ fromGraph: 'tasks', fromId, toGraph: 'tasks', toId, kind });
        return { content: [{ type: 'text', text: JSON.stringify({ fromId, toId, kind, created: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && (err.message.includes('not found') || err.message.includes('already exists'))) {
          return { content: [{ type: 'text', text: 'Could not create relation — one or both tasks not found, or relation already exists.' }], isError: true };
        }
        throw err;
      }
    },
  );
}
