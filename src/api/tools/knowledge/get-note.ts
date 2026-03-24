import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'notes_get',
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
      const { embedding: _embedding, version: _version, ...rest } = note;
      const clean = (_k: string, v: any) => (v === null || (Array.isArray(v) && v.length === 0) ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(rest, clean, 2) }] };
    },
  );
}
