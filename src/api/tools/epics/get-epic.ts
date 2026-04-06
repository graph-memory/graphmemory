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
      // Extract linked task IDs from edges
      const tasks = epic.edges
        .filter(e => e.kind === 'belongs_to')
        .map(e => e.toId);
      const { edges: _edges, ...rest } = epic;
      const result = { ...rest, tasks };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}
