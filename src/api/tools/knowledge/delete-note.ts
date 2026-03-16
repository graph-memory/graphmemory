import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'delete_note',
    {
      description:
        'Delete a note from the knowledge graph. ' +
        'Also removes all relations (edges) connected to this note.',
      inputSchema: {
        noteId: z.string().describe('ID of the note to delete'),
      },
    },
    async ({ noteId }) => {
      const deleted = mgr.deleteNote(noteId);
      if (!deleted) {
        return { content: [{ type: 'text', text: `Note not found: ${noteId}` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ noteId, deleted: true }, null, 2) }] };
    },
  );
}
