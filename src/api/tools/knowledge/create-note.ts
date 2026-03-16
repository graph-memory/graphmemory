import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'create_note',
    {
      description:
        'Create a new note or fact in the knowledge graph. ' +
        'The note is automatically embedded for semantic search. ' +
        'Returns the generated noteId (slug from title). ' +
        'Use create_relation to link notes together.',
      inputSchema: {
        title:   z.string().describe('Short title for the note, e.g. "Auth uses JWT tokens"'),
        content: z.string().describe('Full text content of the note'),
        tags:    z.array(z.string()).optional().describe('Optional tags for filtering, e.g. ["architecture", "decision"]'),
      },
    },
    async ({ title, content, tags }) => {
      const noteId = await mgr.createNote(title, content, tags ?? []);
      return { content: [{ type: 'text', text: JSON.stringify({ noteId }, null, 2) }] };
    },
  );
}
