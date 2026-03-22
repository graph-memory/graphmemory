import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'delete_task',
    {
      description:
        'Delete a task and all its edges (relations, cross-graph links). ' +
        'Orphaned proxy nodes are cleaned up automatically. ' +
        'This action is irreversible.',
      inputSchema: {
        taskId: z.string().max(500).describe('Task ID to delete'),
      },
    },
    async ({ taskId }) => {
      const deleted = mgr.deleteTask(taskId);
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, deleted: true }, null, 2) }] };
    },
  );
}
