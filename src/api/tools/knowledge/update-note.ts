import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'update_note',
    {
      description:
        'Update an existing note in the knowledge graph. ' +
        'Only the provided fields are changed; others remain unchanged. ' +
        'Re-embeds automatically if title or content changes.',
      inputSchema: {
        noteId:  z.string().describe('ID of the note to update'),
        title:   z.string().optional().describe('New title'),
        content: z.string().optional().describe('New content'),
        tags:    z.array(z.string()).optional().describe('New tags (replaces existing)'),
      },
    },
    async ({ noteId, title, content, tags }) => {
      const updated = await mgr.updateNote(noteId, { title, content, tags });
      if (!updated) {
        return { content: [{ type: 'text', text: `Note not found: ${noteId}` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ noteId, updated: true }, null, 2) }] };
    },
  );
}
