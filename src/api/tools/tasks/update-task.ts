import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { VersionConflictError } from '@/store/types';
import { MAX_TITLE_LEN, MAX_DESCRIPTION_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_update',
    {
      description:
        'Update an existing task. Only provided fields are changed. ' +
        'Re-embeds automatically when title or description changes. ' +
        'Status changes auto-manage completedAt (set on done/cancelled, cleared on reopen). ' +
        'Use move_task for a simpler status-only change. ' +
        'Pass expectedVersion to enable optimistic locking.',
      inputSchema: {
        taskId:          z.number().int().positive().describe('Task ID to update'),
        title:           z.string().max(MAX_TITLE_LEN).optional().describe('New title'),
        description:     z.string().max(MAX_DESCRIPTION_LEN).optional().describe('New description (markdown)'),
        status:          z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional()
          .describe('New status: "backlog", "todo", "in_progress", "review", "done", or "cancelled"'),
        priority:        z.enum(['critical', 'high', 'medium', 'low']).optional().describe('New priority: "critical", "high", "medium", or "low"'),
        tags:            z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('Replace entire tags array — include all tags you want to keep'),
        dueDate:         z.number().nullable().optional().describe('Due date as Unix timestamp in ms, or null to clear'),
        estimate:        z.number().nullable().optional().describe('Effort estimate in hours, or null to clear'),
        assigneeId:      z.number().int().positive().nullable().optional().describe('Team member ID to assign, or null to unassign'),
        expectedVersion: z.number().int().positive().optional().describe('Current version for optimistic locking — request fails with version_conflict if the task has been updated since'),
      },
    },
    async ({ taskId, title, description, status, priority, tags, dueDate, estimate, assigneeId, expectedVersion }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = description;
      if (status !== undefined) patch.status = status;
      if (priority !== undefined) patch.priority = priority;
      if (tags !== undefined) patch.tags = tags;
      if (dueDate !== undefined) patch.dueDate = dueDate;
      if (estimate !== undefined) patch.estimate = estimate;
      if (assigneeId !== undefined) patch.assigneeId = assigneeId;

      try {
        await mgr.updateTask(taskId, patch, undefined, expectedVersion);
        return { content: [{ type: 'text', text: JSON.stringify({ taskId, updated: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof VersionConflictError) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'version_conflict', current: err.current, expected: err.expected }) }], isError: true };
        }
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
