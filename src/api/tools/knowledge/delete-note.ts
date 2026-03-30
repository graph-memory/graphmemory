import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'notes_delete',
    {
      description:
        'Delete a note from the knowledge graph. ' +
        'Also removes all relations (edges) connected to this note.',
      inputSchema: {
        noteId: z.string().min(1).max(500).describe('ID of the note to delete'),
      },
    },
    async ({ noteId }) => {
      const author = resolveAuthor();
      const deleted = mgr.deleteNote(noteId, author);
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Note not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ noteId, deleted: true }, null, 2) }] };
    },
  );
}
