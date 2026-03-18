import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'list_tasks',
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
        tag:      z.string().optional().describe('Filter by tag (exact match, case-insensitive)'),
        filter:   z.string().optional().describe('Substring match on title or ID'),
        assignee: z.string().optional().describe('Filter by assignee (team member ID)'),
        limit:    z.number().optional().describe('Max results (default 50)'),
      },
    },
    async ({ status, priority, tag, filter, assignee, limit }) => {
      const results = mgr.listTasks({ status, priority, tag, filter, assignee, limit });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
