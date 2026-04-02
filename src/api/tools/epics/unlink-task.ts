import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'epics_unlink_task',
    {
      description: 'Remove a task from an epic (remove belongs_to relationship).',
      inputSchema: {
        epicId: z.number().int().positive().describe('Epic ID to unlink from'),
        taskId: z.number().int().positive().describe('Task ID to unlink'),
      },
    },
    async ({ epicId, taskId }) => {
      try {
        mgr.unlinkTaskFromEpic(epicId, taskId);
        return { content: [{ type: 'text', text: JSON.stringify({ epicId, taskId, unlinked: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Link not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
