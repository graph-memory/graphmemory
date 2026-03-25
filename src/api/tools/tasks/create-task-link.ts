import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_TARGET_NODE_ID_LEN, MAX_LINK_KIND_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_create_link',
    {
      description:
        'Link a task to a node in the docs, code, files, or knowledge graph. ' +
        'Creates a cross-graph relation from the task to the target node. ' +
        'The kind is a free-form string, e.g. "references", "fixes", "implements", "documents".',
      inputSchema: {
        taskId:      z.string().min(1).max(500).describe('Source task ID'),
        targetId:    z.string().min(1).max(MAX_TARGET_NODE_ID_LEN).describe('Target node ID in the external graph (e.g. "src/auth.ts::login", "api.md::Setup", "my-note")'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills'])
          .describe('Which graph the target belongs to'),
        kind:        z.string().min(1).max(MAX_LINK_KIND_LEN).describe('Relation type, e.g. "references", "fixes", "implements"'),
        projectId:   z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ taskId, targetId, targetGraph, kind, projectId }) => {
      const created = mgr.createCrossLink(taskId, targetId, targetGraph, kind, projectId);
      if (!created) {
        return { content: [{ type: 'text', text: 'Could not create cross-graph link — task not found, target not found, or link already exists.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, targetId, targetGraph, kind, created: true }, null, 2) }] };
    },
  );
}
