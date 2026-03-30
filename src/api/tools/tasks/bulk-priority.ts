import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'tasks_bulk_priority',
    {
      description:
        'Update priority for multiple tasks in one operation. ' +
        'Returns { updated: string[] } with IDs of successfully updated tasks. ' +
        'Tasks that do not exist are silently skipped.',
      inputSchema: {
        taskIds:  z.array(z.string().min(1).max(500)).min(1).max(100).describe('Array of task IDs to update (1–100)'),
        priority: z.enum(['critical', 'high', 'medium', 'low']).describe('New priority for all tasks'),
      },
    },
    async ({ taskIds, priority }) => {
      const author = resolveAuthor();
      const updated: string[] = [];
      for (const id of taskIds) {
        if (await mgr.updateTask(id, { priority }, undefined, author)) updated.push(id);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ updated }, null, 2) }] };
    },
  );
}
