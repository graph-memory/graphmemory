import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'tasks_bulk_delete',
    {
      description:
        'Delete multiple tasks in one operation. ' +
        'Returns { deleted: string[] } with IDs of successfully deleted tasks. ' +
        'Tasks that do not exist are silently skipped. This action is irreversible.',
      inputSchema: {
        taskIds: z.array(z.string().min(1).max(500)).min(1).max(100).describe('Array of task IDs to delete (1–100)'),
      },
    },
    async ({ taskIds }) => {
      const author = resolveAuthor();
      const deleted: string[] = [];
      for (const id of taskIds) {
        if (mgr.deleteTask(id, author)) deleted.push(id);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ deleted }, null, 2) }] };
    },
  );
}
