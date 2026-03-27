import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_TARGET_NODE_ID_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_delete_link',
    {
      description:
        'Remove a link from a task to another task (same-graph) or to a node in the docs, code, files, knowledge, or skills graph (cross-graph). ' +
        'Omit targetGraph for same-graph task-to-task links; set it for cross-graph links. ' +
        'Orphaned proxy nodes are cleaned up automatically.',
      inputSchema: {
        taskId:      z.string().min(1).max(500).describe('Source task ID (slug)'),
        targetId:    z.string().min(1).max(MAX_TARGET_NODE_ID_LEN).describe('Target task ID (same-graph) or target node ID in external graph'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills']).optional()
          .describe('Target graph: "docs", "code", "files", "knowledge", or "skills". Omit for task-to-task links.'),
        projectId:   z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ taskId, targetId, targetGraph, projectId }) => {
      if (targetGraph) {
        const deleted = mgr.deleteCrossLink(taskId, targetId, targetGraph, projectId);
        if (!deleted) {
          return { content: [{ type: 'text', text: 'Cross-graph link not found.' }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ taskId, targetId, targetGraph, deleted: true }, null, 2) }] };
      }
      // Same-graph task-to-task link
      const deleted = mgr.deleteTaskLink(taskId, targetId);
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Link not found.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, targetId, deleted: true }, null, 2) }] };
    },
  );
}
