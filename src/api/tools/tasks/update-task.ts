import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { VersionConflictError } from '@/graphs/manager-types';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'update_task',
    {
      description:
        'Update an existing task. Only provided fields are changed. ' +
        'Re-embeds automatically when title or description changes. ' +
        'Status changes auto-manage completedAt (set on done/cancelled, cleared on reopen). ' +
        'Use move_task for a simpler status-only change. ' +
        'Pass expectedVersion to enable optimistic locking.',
      inputSchema: {
        taskId:          z.string().describe('Task ID to update'),
        title:           z.string().optional().describe('New title'),
        description:     z.string().optional().describe('New description'),
        status:          z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('New status'),
        priority:        z.enum(['critical', 'high', 'medium', 'low']).optional().describe('New priority'),
        tags:            z.array(z.string()).optional().describe('Replace tags array'),
        dueDate:         z.number().nullable().optional().describe('New due date (ms timestamp) or null to clear'),
        estimate:        z.number().nullable().optional().describe('New estimate (hours) or null to clear'),
        expectedVersion: z.number().int().positive().optional().describe('Current version for optimistic locking — request fails with version_conflict if the task has been updated since'),
      },
    },
    async ({ taskId, title, description, status, priority, tags, dueDate, estimate, expectedVersion }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = description;
      if (status !== undefined) patch.status = status;
      if (priority !== undefined) patch.priority = priority;
      if (tags !== undefined) patch.tags = tags;
      if (dueDate !== undefined) patch.dueDate = dueDate;
      if (estimate !== undefined) patch.estimate = estimate;

      try {
        const updated = await mgr.updateTask(taskId, patch, expectedVersion);
        if (!updated) {
          return { content: [{ type: 'text', text: `Task "${taskId}" not found.` }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ taskId, updated: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof VersionConflictError) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'version_conflict', current: err.current, expected: err.expected }) }], isError: true };
        }
        throw err;
      }
    },
  );
}
