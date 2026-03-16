import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'move_task',
    {
      description:
        'Change a task status. Automatically manages completedAt: ' +
        'sets it when moving to "done" or "cancelled", clears it when reopening. ' +
        'Returns the updated task summary.',
      inputSchema: {
        taskId: z.string().describe('Task ID to move'),
        status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'])
          .describe('New status'),
      },
    },
    async ({ taskId, status }) => {
      const moved = mgr.moveTask(taskId, status);
      if (!moved) {
        return { content: [{ type: 'text', text: `Task "${taskId}" not found.` }], isError: true };
      }
      const task = mgr.getTask(taskId)!;
      return { content: [{ type: 'text', text: JSON.stringify({
        taskId: task.id,
        status: task.status,
        completedAt: task.completedAt,
      }, null, 2) }] };
    },
  );
}
