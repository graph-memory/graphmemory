import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'epics_delete',
    {
      description: 'Delete an epic. Tasks linked to it are NOT deleted, only the epic and its links.',
      inputSchema: {
        epicId: z.number().int().positive().describe('Epic ID to delete'),
      },
    },
    async ({ epicId }) => {
      try {
        mgr.deleteEpic(epicId);
        return { content: [{ type: 'text', text: JSON.stringify({ epicId, deleted: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Epic not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
