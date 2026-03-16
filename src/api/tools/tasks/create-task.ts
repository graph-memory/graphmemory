import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'create_task',
    {
      description:
        'Create a new task in the task graph. ' +
        'The task is automatically embedded for semantic search. ' +
        'Returns the generated taskId (slug from title). ' +
        'Use link_task to connect tasks, or create_task_link to link to docs/code/files/knowledge.',
      inputSchema: {
        title:       z.string().describe('Short title for the task, e.g. "Fix auth redirect loop"'),
        description: z.string().describe('Full description of the task (markdown)'),
        priority:    z.enum(['critical', 'high', 'medium', 'low']).describe('Task priority'),
        status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('Initial status (default "backlog")'),
        tags:        z.array(z.string()).optional().describe('Optional tags for filtering, e.g. ["bug", "auth"]'),
        dueDate:     z.number().optional().describe('Due date as Unix timestamp in milliseconds'),
        estimate:    z.number().optional().describe('Estimated effort in hours'),
      },
    },
    async ({ title, description, priority, status, tags, dueDate, estimate }) => {
      const taskId = await mgr.createTask(
        title, description,
        status ?? 'backlog', priority,
        tags ?? [], dueDate ?? null, estimate ?? null,
      );
      return { content: [{ type: 'text', text: JSON.stringify({ taskId }, null, 2) }] };
    },
  );
}
