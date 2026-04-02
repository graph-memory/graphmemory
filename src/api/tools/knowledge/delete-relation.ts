import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import type { GraphName } from '@/store/types';
import { MAX_LINK_KIND_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'notes_delete_link',
    {
      description:
        'Delete a directed edge from a note to another note or a cross-graph target.',
      inputSchema: {
        fromId:      z.number().int().positive().describe('Source note ID'),
        toId:        z.number().int().positive().describe('Target node ID'),
        kind:        z.string().min(1).max(MAX_LINK_KIND_LEN).describe('Relation type to delete'),
        targetGraph: z.enum(['docs', 'code', 'files', 'tasks', 'skills', 'knowledge']).optional()
          .describe('Target graph. Defaults to "knowledge".'),
      },
    },
    async ({ fromId, toId, kind, targetGraph }) => {
      const toGraph = (targetGraph ?? 'knowledge') as GraphName;
      mgr.deleteEdge({ fromGraph: 'knowledge', fromId, toGraph, toId, kind });
      return { content: [{ type: 'text', text: JSON.stringify({ fromId, toId, targetGraph: toGraph, deleted: true }, null, 2) }] };
    },
  );
}
