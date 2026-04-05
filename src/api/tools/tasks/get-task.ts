import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_get',
    {
      description:
        'Get full details of a task by ID, including edges and cross-graph links. ' +
        'Returns: id, title, description, status, priority, tags, dueDate, estimate, ' +
        'completedAt, createdAt, updatedAt, edges.',
      inputSchema: {
        taskId: z.number().int().positive().describe('Task ID (numeric)'),
      },
    },
    async ({ taskId }) => {
      const task = mgr.getTask(taskId);
      if (!task) {
        return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
      }
      const clean = (_k: string, v: unknown) => (v === null || (Array.isArray(v) && v.length === 0) ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(task, clean, 2) }] };
    },
  );
}
