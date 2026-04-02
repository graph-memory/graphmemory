import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'epics_get',
    {
      description: 'Get a single epic by ID. Returns title, status, priority, tags, progress (done/total), and cross-links.',
      inputSchema: {
        epicId: z.number().int().positive().describe('Epic ID'),
      },
    },
    async ({ epicId }) => {
      const epic = mgr.getEpic(epicId);
      if (!epic) return { content: [{ type: 'text', text: 'Epic not found' }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(epic, null, 2) }] };
    },
  );
}
