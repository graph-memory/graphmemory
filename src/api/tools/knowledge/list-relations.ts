import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'list_relations',
    {
      description:
        'List all relations (incoming and outgoing) for a note. ' +
        'Returns an array of { fromId, toId, kind, targetGraph? }. ' +
        'Cross-graph links include targetGraph ("docs", "code", "files", or "tasks") and resolve the real node ID.',
      inputSchema: {
        noteId: z.string().describe('Note ID to list relations for'),
      },
    },
    async ({ noteId }) => {
      const relations = mgr.listRelations(noteId);
      return { content: [{ type: 'text', text: JSON.stringify(relations, null, 2) }] };
    },
  );
}
