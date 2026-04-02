import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_delete',
    {
      description:
        'Delete a task and all its edges (relations, cross-graph links). ' +
        'This action is irreversible.',
      inputSchema: {
        taskId: z.number().int().positive().describe('Task ID to delete'),
      },
    },
    async ({ taskId }) => {
      try {
        mgr.deleteTask(taskId);
        return { content: [{ type: 'text', text: JSON.stringify({ taskId, deleted: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
