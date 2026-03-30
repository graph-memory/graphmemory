import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'tasks_delete',
    {
      description:
        'Delete a task and all its edges (relations, cross-graph links). ' +
        'Orphaned proxy nodes are cleaned up automatically. ' +
        'This action is irreversible.',
      inputSchema: {
        taskId: z.string().min(1).max(500).describe('Task ID to delete (slug, e.g. "fix-auth-redirect-loop")'),
      },
    },
    async ({ taskId }) => {
      const author = resolveAuthor();
      const deleted = mgr.deleteTask(taskId, author);
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, deleted: true }, null, 2) }] };
    },
  );
}
