import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'notes_remove_attachment',
    {
      description:
        'Remove an attachment from a note. The file is deleted from disk.',
      inputSchema: {
        noteId:   z.string().min(1).max(500).describe('ID of the note'),
        filename: z.string().min(1).max(255)
          .refine(s => !/[/\\]/.test(s), 'Filename must not contain path separators')
          .refine(s => !s.includes('..'), 'Filename must not contain ..')
          .refine(s => !s.includes('\0'), 'Filename must not contain null bytes')
          .describe('Filename of the attachment to remove'),
      },
    },
    async ({ noteId, filename }) => {
      const author = resolveAuthor();
      const ok = mgr.removeAttachment(noteId, filename, author);
      if (!ok) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Attachment not found' }) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: filename }) }] };
    },
  );
}
