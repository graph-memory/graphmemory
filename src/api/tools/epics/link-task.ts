import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'epics_link_task',
    {
      description: 'Link a task to an epic (belongs_to relationship). A task can belong to multiple epics.',
      inputSchema: {
        taskId: z.string().min(1).max(500).describe('Task ID to link'),
        epicId: z.string().min(1).max(500).describe('Epic ID to link to'),
      },
    },
    async ({ taskId, epicId }) => {
      const ok = mgr.linkTaskToEpic(taskId, epicId);
      if (!ok) return { content: [{ type: 'text', text: 'Failed to link — task or epic not found, or already linked' }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, epicId, linked: true }, null, 2) }] };
    },
  );
}
