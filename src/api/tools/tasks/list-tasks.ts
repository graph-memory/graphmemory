import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_TAG_LEN, MAX_ASSIGNEE_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_list',
    {
      description:
        'List tasks with optional filters. ' +
        'Sorted by priority (critical first) then due date (earliest first, nulls last). ' +
        'Returns an array of { id, title, description, status, priority, tags, dueDate, estimate, completedAt, createdAt, updatedAt }. ' +
        'Use search_tasks for semantic search.',
      inputSchema: {
        status:   z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('Filter by status'),
        priority: z.enum(['critical', 'high', 'medium', 'low']).optional()
          .describe('Filter by priority'),
        tag:      z.string().max(MAX_TAG_LEN).optional().describe('Filter by tag (exact match, case-insensitive)'),
        filter:   z.string().max(500).optional().describe('Substring match on title or ID'),
        assignee: z.string().max(MAX_ASSIGNEE_LEN).optional().describe('Filter by assignee (team member ID)'),
        limit:    z.number().int().min(1).max(1000).optional().describe('Max results (default 50)'),
      },
    },
    async ({ status, priority, tag, filter, assignee, limit }) => {
      const results = mgr.listTasks({ status, priority, tag, filter, assignee, limit });
      const clean = (k: string, v: any) => (k !== '' && (v === null || (Array.isArray(v) && v.length === 0)) ? undefined : v);
      const output = results.map(({ version: _, ...r }) => r);
      return { content: [{ type: 'text', text: JSON.stringify(output, clean, 2) }] };
    },
  );
}
