import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_TITLE_LEN, MAX_DESCRIPTION_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT, MAX_ASSIGNEE_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_create',
    {
      description:
        'Create a new task in the task graph. ' +
        'The task is automatically embedded for semantic search. ' +
        'Returns the generated taskId (slug from title). ' +
        'Use link_task to connect tasks, or create_task_link to link to docs/code/files/knowledge.',
      inputSchema: {
        title:       z.string().min(1).max(MAX_TITLE_LEN).describe('Short title for the task, e.g. "Fix auth redirect loop"'),
        description: z.string().min(1).max(MAX_DESCRIPTION_LEN).describe('Full description of the task (markdown)'),
        priority:    z.enum(['critical', 'high', 'medium', 'low']).describe('Task priority'),
        status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('Initial status (default "backlog")'),
        tags:        z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('Optional tags for filtering, e.g. ["bug", "auth"]'),
        dueDate:     z.number().optional().describe('Due date as Unix timestamp in milliseconds'),
        estimate:    z.number().optional().describe('Estimated effort in hours'),
        assignee:    z.string().max(MAX_ASSIGNEE_LEN).optional().describe('Team member ID to assign the task to'),
      },
    },
    async ({ title, description, priority, status, tags, dueDate, estimate, assignee }) => {
      const taskId = await mgr.createTask(
        title, description,
        status ?? 'backlog', priority,
        tags ?? [], dueDate ?? null, estimate ?? null,
        assignee ?? null,
      );
      return { content: [{ type: 'text', text: JSON.stringify({ taskId }, null, 2) }] };
    },
  );
}
