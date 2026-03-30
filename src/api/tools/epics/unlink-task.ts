import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'epics_unlink_task',
    {
      description: 'Remove a task from an epic (remove belongs_to relationship).',
      inputSchema: {
        taskId: z.string().min(1).max(500).describe('Task ID to unlink'),
        epicId: z.string().min(1).max(500).describe('Epic ID to unlink from'),
      },
    },
    async ({ taskId, epicId }) => {
      const author = resolveAuthor();
      const ok = mgr.unlinkTaskFromEpic(taskId, epicId, author);
      if (!ok) return { content: [{ type: 'text', text: 'Link not found' }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, epicId, unlinked: true }, null, 2) }] };
    },
  );
}
