import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { cleanReplacer } from '@/api/tools/response';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_get',
    {
      description:
        'Get full details of a task by ID, including edges and cross-graph links. ' +
        'Returns: id, title, description, status, priority, tags, dueDate, estimate, ' +
        'completedAt, createdAt, updatedAt, edges.',
      inputSchema: {
        taskId: z.number().int().positive().describe('Task ID (numeric)'),
      },
    },
    async ({ taskId }) => {
      const task = mgr.getTask(taskId);
      if (!task) {
        return { content: [{ type: 'text', text: 'Task not found' }], isError: true };
      }
      // Transform edges into structured arrays for easier consumption
      const subtasks: number[] = [];
      const blockedBy: number[] = [];
      const blocks: number[] = [];
      const related: number[] = [];
      const crossLinks: { graph: string; nodeId: number; kind: string }[] = [];

      for (const e of task.edges) {
        if (e.fromGraph === 'tasks' && e.toGraph === 'tasks') {
          if (e.kind === 'subtask_of' && e.fromId === taskId) subtasks.push(e.toId);
          else if (e.kind === 'subtask_of' && e.toId === taskId) subtasks.push(e.fromId);
          else if (e.kind === 'blocks' && e.toId === taskId) blockedBy.push(e.fromId);
          else if (e.kind === 'blocks' && e.fromId === taskId) blocks.push(e.toId);
          else if (e.kind === 'related_to') related.push(e.fromId === taskId ? e.toId : e.fromId);
        } else {
          const otherGraph = e.fromGraph === 'tasks' ? e.toGraph : e.fromGraph;
          const otherId = e.fromGraph === 'tasks' ? e.toId : e.fromId;
          crossLinks.push({ graph: otherGraph, nodeId: otherId, kind: e.kind });
        }
      }

      const { edges: _edges, ...rest } = task;
      const result = { ...rest, subtasks, blockedBy, blocks, related, crossLinks };
      return { content: [{ type: 'text', text: JSON.stringify(result, cleanReplacer, 2) }] };
    },
  );
}
