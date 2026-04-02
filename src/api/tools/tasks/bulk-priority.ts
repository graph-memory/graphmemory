import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_bulk_priority',
    {
      description:
        'Update priority for multiple tasks in one operation. ' +
        'Returns { updated: number } with the count of successfully updated tasks. ' +
        'Tasks that do not exist are silently skipped.',
      inputSchema: {
        taskIds:  z.array(z.number().int().positive()).min(1).max(100).describe('Array of task IDs to update (1-100)'),
        priority: z.enum(['critical', 'high', 'medium', 'low']).describe('New priority for all tasks'),
      },
    },
    async ({ taskIds, priority }) => {
      const count = mgr.bulkPriorityTasks(taskIds, priority);
      return { content: [{ type: 'text', text: JSON.stringify({ updated: count }, null, 2) }] };
    },
  );
}
