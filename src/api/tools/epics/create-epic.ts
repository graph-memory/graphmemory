import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_TITLE_LEN, MAX_DESCRIPTION_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'epics_create',
    {
      description:
        'Create a new epic. Epics group related tasks and track progress. ' +
        'Returns the generated epicId. Use epics_link_task to add tasks.',
      inputSchema: {
        title:       z.string().min(1).max(MAX_TITLE_LEN).describe('Short epic title'),
        description: z.string().max(MAX_DESCRIPTION_LEN).optional().describe('Epic description in markdown'),
        status:      z.enum(['open', 'in_progress', 'done', 'cancelled']).optional().describe('Status: "open" (default), "in_progress", "done", "cancelled"'),
        priority:    z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Priority level'),
        tags:        z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('Tags array'),
      },
    },
    async ({ title, description, status, priority, tags }) => {
      const epicId = await mgr.createEpic(
        title, description ?? '', status ?? 'open', priority ?? 'medium', tags ?? [],
      );
      return { content: [{ type: 'text', text: JSON.stringify({ epicId }, null, 2) }] };
    },
  );
}
