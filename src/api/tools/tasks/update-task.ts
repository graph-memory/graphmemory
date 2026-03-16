import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'update_task',
    {
      description:
        'Update an existing task. Only provided fields are changed. ' +
        'Re-embeds automatically when title or description changes. ' +
        'Status changes auto-manage completedAt (set on done/cancelled, cleared on reopen). ' +
        'Use move_task for a simpler status-only change.',
      inputSchema: {
        taskId:      z.string().describe('Task ID to update'),
        title:       z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('New status'),
        priority:    z.enum(['critical', 'high', 'medium', 'low']).optional().describe('New priority'),
        tags:        z.array(z.string()).optional().describe('Replace tags array'),
        dueDate:     z.number().nullable().optional().describe('New due date (ms timestamp) or null to clear'),
        estimate:    z.number().nullable().optional().describe('New estimate (hours) or null to clear'),
      },
    },
    async ({ taskId, title, description, status, priority, tags, dueDate, estimate }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = description;
      if (status !== undefined) patch.status = status;
      if (priority !== undefined) patch.priority = priority;
      if (tags !== undefined) patch.tags = tags;
      if (dueDate !== undefined) patch.dueDate = dueDate;
      if (estimate !== undefined) patch.estimate = estimate;

      const updated = await mgr.updateTask(taskId, patch);
      if (!updated) {
        return { content: [{ type: 'text', text: `Task "${taskId}" not found.` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, updated: true }, null, 2) }] };
    },
  );
}
