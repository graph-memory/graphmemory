import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_reorder',
    {
      description:
        'Reorder a task within its status column. Optionally move to a different status at the same time. ' +
        'The order field is an integer — lower values appear first. ' +
        'Returns the updated task summary.',
      inputSchema: {
        taskId: z.number().int().positive().describe('Task ID to reorder'),
        order:  z.number().int().describe('New order position (integer, lower = higher in list)'),
        status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('Optionally move to a different status at the same time'),
      },
    },
    async ({ taskId, order, status }) => {
      try {
        const task = mgr.reorderTask(taskId, order, status);
        return { content: [{ type: 'text', text: JSON.stringify({
          taskId: task.id,
          status: task.status,
          order: task.order,
        }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
