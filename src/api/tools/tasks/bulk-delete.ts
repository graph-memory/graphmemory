import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_bulk_delete',
    {
      description:
        'Delete multiple tasks in one operation. ' +
        'Returns { deleted: number } with the count of successfully deleted tasks. ' +
        'Tasks that do not exist are silently skipped. This action is irreversible.',
      inputSchema: {
        taskIds: z.array(z.number().int().positive()).min(1).max(100).describe('Array of task IDs to delete (1-100)'),
      },
    },
    async ({ taskIds }) => {
      const count = mgr.bulkDeleteTasks(taskIds);
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: count }, null, 2) }] };
    },
  );
}
