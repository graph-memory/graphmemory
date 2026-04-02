import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'notes_remove_attachment',
    {
      description:
        'Remove an attachment from a note. The file is deleted from disk.',
      inputSchema: {
        noteId:   z.number().int().positive().describe('ID of the note'),
        filename: z.string().min(1).max(255)
          .refine(s => !/[/\\]/.test(s), 'Filename must not contain path separators')
          .refine(s => !s.includes('..'), 'Filename must not contain ..')
          .refine(s => !s.includes('\0'), 'Filename must not contain null bytes')
          .describe('Filename of the attachment to remove'),
      },
    },
    async ({ noteId, filename }) => {
      const note = mgr.getNote(noteId);
      if (!note) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Note not found' }) }], isError: true };
      }
      mgr.removeAttachment('knowledge', noteId, note.slug, filename);
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: filename }) }] };
    },
  );
}
