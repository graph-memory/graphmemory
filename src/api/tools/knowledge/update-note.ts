import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { VersionConflictError } from '@/store/types';
import { MAX_TITLE_LEN, MAX_NOTE_CONTENT_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'notes_update',
    {
      description:
        'Update an existing note in the knowledge graph. ' +
        'Only the provided fields are changed; others remain unchanged. ' +
        'Re-embeds automatically if title or content changes. ' +
        'Pass expectedVersion to enable optimistic locking.',
      inputSchema: {
        noteId:          z.number().int().positive().describe('ID of the note to update'),
        title:           z.string().max(MAX_TITLE_LEN).optional().describe('New title'),
        content:         z.string().max(MAX_NOTE_CONTENT_LEN).optional().describe('New content'),
        tags:            z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('New tags (replaces existing)'),
        expectedVersion: z.number().int().positive().optional().describe('Current version for optimistic locking — request fails with version_conflict if the note has been updated since'),
      },
    },
    async ({ noteId, title, content, tags, expectedVersion }) => {
      try {
        await mgr.updateNote(noteId, { title, content, tags }, undefined, expectedVersion);
        return { content: [{ type: 'text', text: JSON.stringify({ noteId, updated: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof VersionConflictError) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'version_conflict', current: err.current, expected: err.expected }) }], isError: true };
        }
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Note not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
