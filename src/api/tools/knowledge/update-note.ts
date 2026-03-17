import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';
import { VersionConflictError } from '@/graphs/manager-types';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'update_note',
    {
      description:
        'Update an existing note in the knowledge graph. ' +
        'Only the provided fields are changed; others remain unchanged. ' +
        'Re-embeds automatically if title or content changes. ' +
        'Pass expectedVersion to enable optimistic locking.',
      inputSchema: {
        noteId:          z.string().describe('ID of the note to update'),
        title:           z.string().optional().describe('New title'),
        content:         z.string().optional().describe('New content'),
        tags:            z.array(z.string()).optional().describe('New tags (replaces existing)'),
        expectedVersion: z.number().int().positive().optional().describe('Current version for optimistic locking — request fails with version_conflict if the note has been updated since'),
      },
    },
    async ({ noteId, title, content, tags, expectedVersion }) => {
      try {
        const updated = await mgr.updateNote(noteId, { title, content, tags }, expectedVersion);
        if (!updated) {
          return { content: [{ type: 'text', text: `Note not found: ${noteId}` }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ noteId, updated: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof VersionConflictError) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'version_conflict', current: err.current, expected: err.expected }) }], isError: true };
        }
        throw err;
      }
    },
  );
}
