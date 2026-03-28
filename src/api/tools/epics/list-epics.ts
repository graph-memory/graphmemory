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
        offset:   z.number().int().min(0).max(100_000).optional().describe('Offset for pagination (default 0)'),
      },
    },
    async ({ status, priority, tag, limit, offset }) => {
      const { results: epics, total } = mgr.listEpics({ status, priority, tag, limit, offset });
      return { content: [{ type: 'text', text: JSON.stringify({ results: epics, total }, null, 2) }] };
    },
  );
}
