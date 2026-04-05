import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'notes_get',
    {
      description:
        'Return the full content of a note by its ID. ' +
        'Returns id, title, content, tags, createdAt, updatedAt, and edges.',
      inputSchema: {
        noteId: z.number().int().positive().describe('Note ID'),
      },
    },
    async ({ noteId }) => {
      const note = mgr.getNote(noteId);
      if (!note) {
        return { content: [{ type: 'text', text: 'Note not found' }], isError: true };
      }
      const clean = (_k: string, v: unknown) => (v === null || (Array.isArray(v) && v.length === 0) ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(note, clean, 2) }] };
    },
  );
}
