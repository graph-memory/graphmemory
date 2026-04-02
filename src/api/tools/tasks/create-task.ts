import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { MAX_TITLE_LEN, MAX_DESCRIPTION_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_create',
    {
      description:
        'Create a new task in the task graph. ' +
        'The task is automatically embedded for semantic search. ' +
        'Returns the generated taskId (numeric). ' +
        'Use link_task to connect tasks, or create_task_link to link to docs/code/files/knowledge.',
      inputSchema: {
        title:       z.string().min(1).max(MAX_TITLE_LEN).describe('Short title, e.g. "Fix auth redirect loop". Used to generate the task slug.'),
        description: z.string().max(MAX_DESCRIPTION_LEN).describe('Full task description in markdown'),
        priority:    z.enum(['critical', 'high', 'medium', 'low']).describe('Priority: "critical", "high", "medium", or "low"'),
        status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('Initial status: "backlog" (default), "todo", "in_progress", "review", "done", or "cancelled"'),
        tags:        z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('Tags array, e.g. ["bug", "auth"]'),
        dueDate:     z.number().optional().describe('Due date as Unix timestamp in milliseconds, e.g. 1735689600000'),
        estimate:    z.number().optional().describe('Estimated effort in hours, e.g. 4'),
        assigneeId:  z.number().int().positive().optional().describe('Team member ID to assign the task to'),
        order:       z.number().int().optional().describe('Position within status group (integer, lower = higher). Auto-assigned if omitted.'),
      },
    },
    async ({ title, description, priority, status, tags, dueDate, estimate, assigneeId, order }) => {
      const record = await mgr.createTask({
        title, description, priority,
        status: status ?? 'backlog',
        tags: tags ?? [],
        dueDate, estimate, assigneeId, order,
      });
      return { content: [{ type: 'text', text: JSON.stringify({ taskId: record.id }, null, 2) }] };
    },
  );
}
