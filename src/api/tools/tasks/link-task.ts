import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_link',
    {
      description:
        'Create a directed relation between two tasks. ' +
        '"subtask_of": fromId is a subtask of toId. ' +
        '"blocks": fromId blocks toId. ' +
        '"related_to": free association between tasks.',
      inputSchema: {
        fromId: z.string().min(1).max(500).describe('Source task ID (slug)'),
        toId:   z.string().min(1).max(500).describe('Target task ID (slug)'),
        kind:   z.enum(['subtask_of', 'blocks', 'related_to']).describe('Relation type: "subtask_of", "blocks", or "related_to"'),
      },
    },
    async ({ fromId, toId, kind }) => {
      const created = mgr.linkTasks(fromId, toId, kind);
      if (!created) {
        return { content: [{ type: 'text', text: 'Could not create relation — one or both tasks not found, or relation already exists.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ fromId, toId, kind, created: true }, null, 2) }] };
    },
  );
}
