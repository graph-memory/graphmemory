import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'epics_link_task',
    {
      description: 'Link a task to an epic (belongs_to relationship). A task can belong to multiple epics.',
      inputSchema: {
        epicId: z.number().int().positive().describe('Epic ID to link to'),
        taskId: z.number().int().positive().describe('Task ID to link'),
      },
    },
    async ({ epicId, taskId }) => {
      try {
        mgr.linkTaskToEpic(epicId, taskId);
        return { content: [{ type: 'text', text: JSON.stringify({ epicId, taskId, linked: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Failed to link — task or epic not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
