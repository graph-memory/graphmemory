import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import type { EpicStatus } from '@/graphs/task-types';
import { MAX_TITLE_LEN, MAX_DESCRIPTION_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'epics_update',
    {
      description: 'Update an existing epic. Only provided fields are changed.',
      inputSchema: {
        epicId:      z.string().min(1).max(500).describe('Epic ID to update'),
        title:       z.string().min(1).max(MAX_TITLE_LEN).optional().describe('New title'),
        description: z.string().max(MAX_DESCRIPTION_LEN).optional().describe('New description'),
        status:      z.enum(['open', 'in_progress', 'done', 'cancelled']).optional().describe('New status'),
        priority:    z.enum(['critical', 'high', 'medium', 'low']).optional().describe('New priority'),
        tags:        z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('New tags'),
        version:     z.number().int().positive().optional().describe('Expected version for optimistic locking'),
      },
    },
    async ({ epicId, title, description, status, priority, tags, version }) => {
      const patch: any = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = description;
      if (priority !== undefined) patch.priority = priority;
      if (tags !== undefined) patch.tags = tags;
      const ok = await mgr.updateEpic(epicId, patch, status as EpicStatus | undefined, version);
      if (!ok) return { content: [{ type: 'text', text: 'Epic not found' }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify({ epicId, updated: true }, null, 2) }] };
    },
  );
}
