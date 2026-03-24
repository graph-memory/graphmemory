import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_TARGET_NODE_ID_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_delete_link',
    {
      description:
        'Remove a cross-graph link from a task to a node in the docs, code, files, or knowledge graph. ' +
        'Orphaned proxy nodes are cleaned up automatically.',
      inputSchema: {
        taskId:      z.string().max(500).describe('Source task ID'),
        targetId:    z.string().max(MAX_TARGET_NODE_ID_LEN).describe('Target node ID in the external graph'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills'])
          .describe('Which graph the target belongs to'),
        projectId:   z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ taskId, targetId, targetGraph, projectId }) => {
      const deleted = mgr.deleteCrossLink(taskId, targetId, targetGraph, projectId);
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Cross-graph link not found.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, targetId, targetGraph, deleted: true }, null, 2) }] };
    },
  );
}
