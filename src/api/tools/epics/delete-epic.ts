import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'epics_delete',
    {
      description: 'Delete an epic. Tasks linked to it are NOT deleted, only the epic and its links.',
      inputSchema: {
        epicId: z.string().min(1).max(500).describe('Epic ID to delete'),
      },
    },
    async ({ epicId }) => {
      const author = resolveAuthor();
      const ok = mgr.deleteEpic(epicId, author);
      if (!ok) return { content: [{ type: 'text', text: 'Epic not found' }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify({ epicId, deleted: true }, null, 2) }] };
    },
  );
}
