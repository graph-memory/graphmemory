import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'get_note',
    {
      description:
        'Return the full content of a note by its ID. ' +
        'Returns id, title, content, tags, createdAt, updatedAt, and relations (including cross-graph links from/to tasks, docs, code, files).',
      inputSchema: {
        noteId: z.string().max(500).describe('Note ID, e.g. "auth-uses-jwt-tokens"'),
      },
    },
    async ({ noteId }) => {
      const note = mgr.getNote(noteId);
      if (!note) {
        return { content: [{ type: 'text', text: 'Note not found' }], isError: true };
      }
      const { embedding: _embedding, ...rest } = note;
      return { content: [{ type: 'text', text: JSON.stringify(rest, null, 2) }] };
    },
  );
}
