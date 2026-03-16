import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'find_linked_tasks',
    {
      description:
        'Find all tasks that link to a specific node in the docs, code, files, or knowledge graph. ' +
        'This is a reverse lookup — given a target, returns all tasks that reference it. ' +
        'Returns an array of { taskId, title, kind, status, priority, tags }. ' +
        'Use get_task to fetch full content of a returned task.',
      inputSchema: {
        targetId:    z.string().describe('Target node ID in the external graph'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge'])
          .describe('Which graph the target belongs to'),
        kind:        z.string().optional().describe('Filter by relation kind. If omitted, returns all relations.'),
      },
    },
    async ({ targetId, targetGraph, kind }) => {
      const results = mgr.findLinkedTasks(targetGraph, targetId, kind);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No tasks linked to ${targetGraph}::${targetId}` }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
