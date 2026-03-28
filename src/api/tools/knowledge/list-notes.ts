import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';
import { MAX_TAG_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'notes_list',
    {
      description:
        'List notes in the knowledge graph. ' +
        'Optionally filter by title/id substring and/or tag. ' +
        'Returns an array of { id, title, tags, updatedAt } sorted by most recently updated.',
      inputSchema: {
        filter: z.string().max(500).optional().describe('Case-insensitive substring to match against note title or ID'),
        tag:    z.string().max(MAX_TAG_LEN).optional().describe('Filter by tag (exact match, case-insensitive)'),
        limit:  z.number().int().min(1).max(1000).optional().describe('Maximum number of results'),
        offset: z.number().int().min(0).max(100_000).optional().describe('Offset for pagination (default 0)'),
      },
    },
    async ({ filter, tag, limit, offset }) => {
      const { results: notes, total } = mgr.listNotes(filter, tag, limit, offset);
      const output = notes.map(({ content: _, ...n }) => n);
      return { content: [{ type: 'text', text: JSON.stringify({ results: output, total }, null, 2) }] };
    },
  );
}
