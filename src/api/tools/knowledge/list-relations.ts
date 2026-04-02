import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'notes_list_links',
    {
      description:
        'List all edges (incoming and outgoing) for a note. ' +
        'Returns an array of { fromGraph, fromId, toGraph, toId, kind }.',
      inputSchema: {
        noteId: z.number().int().positive().describe('Note ID to list edges for'),
      },
    },
    async ({ noteId }) => {
      const outgoing = mgr.findOutgoingEdges('knowledge', noteId);
      const incoming = mgr.findIncomingEdges('knowledge', noteId);
      const edges = [...outgoing, ...incoming];
      return { content: [{ type: 'text', text: JSON.stringify(edges, null, 2) }] };
    },
  );
}
