import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'delete_relation',
    {
      description:
        'Delete a directed relation between a note and another note or a cross-graph target. ' +
        'Set targetGraph to "docs", "code", "files", or "tasks" when deleting a cross-graph link.',
      inputSchema: {
        fromId:      z.string().describe('Source note ID'),
        toId:        z.string().describe('Target note ID, or target node ID in docs/code/files/tasks graph'),
        targetGraph: z.enum(['docs', 'code', 'files', 'tasks', 'skills']).optional()
          .describe('Set to "docs", "code", "files", "tasks", or "skills" when deleting a cross-graph link'),
        projectId:   z.string().optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ fromId, toId, targetGraph, projectId }) => {
      const deleted = mgr.deleteRelation(fromId, toId, targetGraph, projectId);

      if (!deleted) {
        return { content: [{ type: 'text', text: 'Relation not found.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ fromId, toId, targetGraph, deleted: true }, null, 2) }] };
    },
  );
}
