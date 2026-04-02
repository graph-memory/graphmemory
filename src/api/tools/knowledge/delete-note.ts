import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'notes_delete',
    {
      description:
        'Delete a note from the knowledge graph. ' +
        'Also removes all edges connected to this note.',
      inputSchema: {
        noteId: z.number().int().positive().describe('ID of the note to delete'),
      },
    },
    async ({ noteId }) => {
      try {
        mgr.deleteNote(noteId);
        return { content: [{ type: 'text', text: JSON.stringify({ noteId, deleted: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Note not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
