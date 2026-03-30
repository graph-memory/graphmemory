import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_TARGET_NODE_ID_LEN, MAX_LINK_KIND_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'tasks_create_link',
    {
      description:
        'Link a task to another task (same-graph) or to a node in the docs, code, files, knowledge, or skills graph (cross-graph). ' +
        'Omit targetGraph for same-graph task-to-task links; set it for cross-graph links. ' +
        'The kind is a free-form string, e.g. "references", "fixes", "implements", "documents".',
      inputSchema: {
        taskId:      z.string().min(1).max(500).describe('Source task ID (slug)'),
        targetId:    z.string().min(1).max(MAX_TARGET_NODE_ID_LEN).describe('Target task ID (same-graph) or target node ID in external graph, e.g. "src/auth.ts::login"'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills']).optional()
          .describe('Target graph: "docs", "code", "files", "knowledge", or "skills". Omit for task-to-task links.'),
        kind:        z.string().min(1).max(MAX_LINK_KIND_LEN).describe('Relation type, e.g. "references", "fixes", "implements", "documents"'),
        projectId:   z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ taskId, targetId, targetGraph, kind, projectId }) => {
      const author = resolveAuthor();
      if (targetGraph) {
        const created = mgr.createCrossLink(taskId, targetId, targetGraph, kind, projectId, author);
        if (!created) {
          return { content: [{ type: 'text', text: 'Could not create cross-graph link — task not found, target not found, or link already exists.' }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ taskId, targetId, targetGraph, kind, created: true }, null, 2) }] };
      }
      // Same-graph task-to-task link
      const created = mgr.linkTasks(taskId, targetId, kind, author);
      if (!created) {
        return { content: [{ type: 'text', text: 'Could not create link — one or both tasks not found, or link already exists.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, targetId, kind, created: true }, null, 2) }] };
    },
  );
}
