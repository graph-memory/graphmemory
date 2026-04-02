import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { VersionConflictError } from '@/store/types';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_move',
    {
      description:
        'Change a task status. Automatically manages completedAt: ' +
        'sets it when moving to "done" or "cancelled", clears it when reopening. ' +
        'Returns the updated task summary. ' +
        'Pass expectedVersion to enable optimistic locking.',
      inputSchema: {
        taskId:          z.number().int().positive().describe('Task ID to move'),
        status:          z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'])
          .describe('New status: "backlog", "todo", "in_progress", "review", "done", or "cancelled"'),
        order:           z.number().int().optional().describe('Target order position within the new status group'),
        expectedVersion: z.number().int().positive().optional().describe('Current version for optimistic locking — request fails with version_conflict if the task has been updated since'),
      },
    },
    async ({ taskId, status, order, expectedVersion }) => {
      try {
        const task = mgr.moveTask(taskId, status, order, undefined, expectedVersion);
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
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
