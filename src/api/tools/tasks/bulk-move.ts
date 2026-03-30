import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_bulk_move',
    {
      description:
        'Move multiple tasks to a new status in one operation. ' +
        'Returns { moved: string[] } with IDs of successfully moved tasks. ' +
        'Tasks that do not exist are silently skipped.',
      inputSchema: {
        taskIds: z.array(z.string().min(1).max(500)).min(1).max(100).describe('Array of task IDs to move (1–100)'),
        status:  z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).describe('Target status for all tasks'),
      },
    },
    async ({ taskIds, status }) => {
      const moved: string[] = [];
      for (const id of taskIds) {
        if (mgr.moveTask(id, status)) moved.push(id);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ moved }, null, 2) }] };
    },
  );
}
