import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { VersionConflictError } from '@/graphs/manager-types';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_move',
    {
      description:
        'Change a task status. Automatically manages completedAt: ' +
        'sets it when moving to "done" or "cancelled", clears it when reopening. ' +
        'Returns the updated task summary. ' +
        'Pass expectedVersion to enable optimistic locking.',
      inputSchema: {
        taskId:          z.string().min(1).max(500).describe('Task ID to move (slug, e.g. "fix-auth-redirect-loop")'),
        status:          z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'])
          .describe('New status: "backlog", "todo", "in_progress", "review", "done", or "cancelled"'),
        expectedVersion: z.number().int().positive().optional().describe('Current version for optimistic locking — request fails with version_conflict if the task has been updated since'),
      },
    },
    async ({ taskId, status, expectedVersion }) => {
      try {
        const moved = mgr.moveTask(taskId, status, expectedVersion);
        if (!moved) {
          return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
        }
        const task = mgr.getTask(taskId)!;
        const clean = (_k: string, v: any) => (v === null ? undefined : v);
        return { content: [{ type: 'text', text: JSON.stringify({
          taskId: task.id,
          status: task.status,
          completedAt: task.completedAt,
        }, clean, 2) }] };
      } catch (err) {
        if (err instanceof VersionConflictError) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'version_conflict', current: err.current, expected: err.expected }) }], isError: true };
        }
        throw err;
      }
    },
  );
}
