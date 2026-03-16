import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'list_notes',
    {
      description:
        'List notes in the knowledge graph. ' +
        'Optionally filter by title/id substring and/or tag. ' +
        'Returns an array of { id, title, tags, updatedAt } sorted by most recently updated.',
      inputSchema: {
        filter: z.string().optional().describe('Case-insensitive substring to match against note title or ID'),
        tag:    z.string().optional().describe('Filter by tag (exact match, case-insensitive)'),
        limit:  z.number().optional().describe('Maximum number of results (default 20)'),
      },
    },
    async ({ filter, tag, limit }) => ({
      content: [{ type: 'text', text: JSON.stringify(mgr.listNotes(filter, tag, limit), null, 2) }],
    }),
  );
}
