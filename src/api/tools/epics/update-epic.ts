import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { VersionConflictError } from '@/store/types';
import { MAX_TITLE_LEN, MAX_DESCRIPTION_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'epics_update',
    {
      description: 'Update an existing epic. Only provided fields are changed.',
      inputSchema: {
        epicId:          z.number().int().positive().describe('Epic ID to update'),
        title:           z.string().min(1).max(MAX_TITLE_LEN).optional().describe('New title'),
        description:     z.string().max(MAX_DESCRIPTION_LEN).optional().describe('New description'),
        status:          z.enum(['open', 'in_progress', 'done', 'cancelled']).optional().describe('New status'),
        priority:        z.enum(['critical', 'high', 'medium', 'low']).optional().describe('New priority'),
        tags:            z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('New tags'),
        expectedVersion: z.number().int().positive().optional().describe('Current version for optimistic locking — request fails with version_conflict if the epic has been updated since'),
      },
    },
    async ({ epicId, title, description, status, priority, tags, expectedVersion }) => {
      try {
        await mgr.updateEpic(epicId, { title, description, status, priority, tags }, undefined, expectedVersion);
        return { content: [{ type: 'text', text: JSON.stringify({ epicId, updated: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof VersionConflictError) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'version_conflict', current: err.current, expected: err.expected }) }], isError: true };
        }
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Epic not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
