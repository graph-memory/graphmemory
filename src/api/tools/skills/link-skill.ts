import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_link',
    {
      description:
        'Create a directed relation between two skills. ' +
        '"depends_on": fromId depends on toId. ' +
        '"related_to": free association between skills. ' +
        '"variant_of": fromId is a variant of toId.',
      inputSchema: {
        fromId: z.number().int().positive().describe('Source skill ID'),
        toId:   z.number().int().positive().describe('Target skill ID'),
        kind:   z.enum(['depends_on', 'related_to', 'variant_of']).describe('Relation type: "depends_on", "related_to", or "variant_of"'),
      },
    },
    async ({ fromId, toId, kind }) => {
      mgr.createEdge({ fromGraph: 'skills', fromId, toGraph: 'skills', toId, kind });
      return { content: [{ type: 'text', text: JSON.stringify({ fromId, toId, kind, created: true }, null, 2) }] };
    },
  );
}
