import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_get',
    {
      description:
        'Get full details of a task by ID, including subtasks, blockers, related tasks, and cross-graph links. ' +
        'Returns: id, title, description, status, priority, tags, dueDate, estimate, ' +
        'completedAt, createdAt, updatedAt, subtasks[], blockedBy[], blocks[], related[], crossLinks[].',
      inputSchema: {
        taskId: z.string().max(500).describe('Task ID to retrieve'),
      },
    },
    async ({ taskId }) => {
      const task = mgr.getTask(taskId);
      if (!task) {
        return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
      }
      const { version: _version, ...rest } = task;
      const clean = (_k: string, v: any) => (v === null || (Array.isArray(v) && v.length === 0) ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(rest, clean, 2) }] };
    },
  );
}
