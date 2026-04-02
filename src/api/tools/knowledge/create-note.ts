import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { MAX_TITLE_LEN, MAX_NOTE_CONTENT_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'notes_create',
    {
      description:
        'Create a new note or fact in the knowledge graph. ' +
        'The note is automatically embedded for semantic search. ' +
        'Returns the generated noteId. ' +
        'Use notes_create_link to link notes together.',
      inputSchema: {
        title:   z.string().min(1).max(MAX_TITLE_LEN).describe('Short title for the note, e.g. "Auth uses JWT tokens"'),
        content: z.string().max(MAX_NOTE_CONTENT_LEN).describe('Full text content of the note (markdown)'),
        tags:    z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('Optional tags for filtering, e.g. ["architecture", "decision"]'),
      },
    },
    async ({ title, content, tags }) => {
      const record = await mgr.createNote({ title, content, tags: tags ?? [] });
      return { content: [{ type: 'text', text: JSON.stringify({ noteId: record.id }, null, 2) }] };
    },
  );
}
