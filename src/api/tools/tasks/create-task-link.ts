import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'create_task_link',
    {
      description:
        'Link a task to a node in the docs, code, files, or knowledge graph. ' +
        'Creates a cross-graph relation from the task to the target node. ' +
        'The kind is a free-form string, e.g. "references", "fixes", "implements", "documents".',
      inputSchema: {
        taskId:      z.string().describe('Source task ID'),
        targetId:    z.string().describe('Target node ID in the external graph (e.g. "src/auth.ts::login", "api.md::Setup", "my-note")'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge'])
          .describe('Which graph the target belongs to'),
        kind:        z.string().describe('Relation type, e.g. "references", "fixes", "implements"'),
      },
    },
    async ({ taskId, targetId, targetGraph, kind }) => {
      const created = mgr.createCrossLink(taskId, targetId, targetGraph, kind);
      if (!created) {
        return { content: [{ type: 'text', text: `Could not create cross-graph link — task not found, target not found in ${targetGraph} graph, or link already exists.` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ taskId, targetId, targetGraph, kind, created: true }, null, 2) }] };
    },
  );
}
