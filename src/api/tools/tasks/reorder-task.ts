import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'tasks_reorder',
    {
      description:
        'Reorder a task within its status column. Optionally move to a different status at the same time. ' +
        'The order field is an integer — lower values appear first. ' +
        'Returns the updated task summary.',
      inputSchema: {
        taskId: z.string().min(1).max(500).describe('Task ID to reorder'),
        order:  z.number().int().describe('New order position (integer, lower = higher in list)'),
        status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('Optionally move to a different status at the same time'),
      },
    },
    async ({ taskId, order, status }) => {
      const author = resolveAuthor();
      const ok = mgr.reorderTask(taskId, order, status, author);
      if (!ok) {
        return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
      }
      const task = mgr.getTask(taskId)!;
      return { content: [{ type: 'text', text: JSON.stringify({
        taskId: task.id,
        status: task.status,
        order: task.order,
      }, null, 2) }] };
    },
  );
}
