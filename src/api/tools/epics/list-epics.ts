import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_TAG_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'epics_list',
    {
      description: 'List epics with optional filters. Each epic includes progress (done/total tasks).',
      inputSchema: {
        status:   z.enum(['open', 'in_progress', 'done', 'cancelled']).optional().describe('Filter by status'),
        priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Filter by priority'),
        tag:      z.string().max(MAX_TAG_LEN).optional().describe('Filter by tag'),
        limit:    z.number().int().positive().max(500).optional().describe('Max results'),
      },
    },
    async ({ status, priority, tag, limit }) => {
      const epics = mgr.listEpics({ status, priority, tag, limit });
      return { content: [{ type: 'text', text: JSON.stringify(epics, null, 2) }] };
    },
  );
}
