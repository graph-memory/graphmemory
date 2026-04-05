import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { MAX_TAG_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_list',
    {
      description:
        'List tasks with optional filters. ' +
        'Sorted by priority (critical first) then due date (earliest first, nulls last). ' +
        'Returns an array of { id, title, description, status, priority, tags, dueDate, estimate, completedAt, createdAt, updatedAt }. ' +
        'Use search_tasks for semantic search.',
      inputSchema: {
        status:     z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('Filter by status: "backlog", "todo", "in_progress", "review", "done", or "cancelled"'),
        priority:   z.enum(['critical', 'high', 'medium', 'low']).optional()
          .describe('Filter by priority: "critical", "high", "medium", or "low"'),
        tag:        z.string().max(MAX_TAG_LEN).optional().describe('Filter by tag (exact match, case-insensitive)'),
        filter:     z.string().max(500).optional().describe('Substring match on title or ID'),
        assigneeId: z.number().int().positive().optional().describe('Filter by assignee (team member ID)'),
        limit:      z.number().int().min(1).max(1000).optional().describe('Max results (default 50)'),
        offset:     z.number().int().min(0).max(100_000).optional().describe('Offset for pagination (default 0)'),
      },
    },
    async ({ status, priority, tag, filter, assigneeId, limit, offset }) => {
      const { results, total } = mgr.listTasks({ status, priority, tag, filter, assigneeId, limit, offset });
      const clean = (k: string, v: unknown) => (k !== '' && (v === null || (Array.isArray(v) && v.length === 0)) ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify({ results, total }, clean, 2) }] };
    },
  );
}
