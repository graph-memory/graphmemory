import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_bulk_move',
    {
      description:
        'Move multiple tasks to a new status in one operation. ' +
        'Returns { moved: number } with the count of successfully moved tasks. ' +
        'Tasks that do not exist are silently skipped.',
      inputSchema: {
        taskIds: z.array(z.number().int().positive()).min(1).max(100).describe('Array of task IDs to move (1-100)'),
        status:  z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).describe('Target status for all tasks'),
      },
    },
    async ({ taskIds, status }) => {
      const count = mgr.bulkMoveTasks(taskIds, status);
      return { content: [{ type: 'text', text: JSON.stringify({ moved: count }, null, 2) }] };
    },
  );
}
