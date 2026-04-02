import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import type { GraphName } from '@/store/types';
import { MAX_LINK_KIND_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'notes_create_link',
    {
      description:
        'Create a directed edge from a note to another note or to a node in another graph. ' +
        'The kind is a free-form string describing the relationship, ' +
        'e.g. "relates_to", "depends_on", "contradicts", "supports", "part_of", "references". ' +
        'Set targetGraph to link to a node in docs/code/files/tasks/skills graph.',
      inputSchema: {
        fromId:      z.number().int().positive().describe('Source note ID'),
        toId:        z.number().int().positive().describe('Target node ID'),
        kind:        z.string().min(1).max(MAX_LINK_KIND_LEN).describe('Relation type, e.g. "depends_on", "references"'),
        targetGraph: z.enum(['docs', 'code', 'files', 'tasks', 'skills', 'knowledge']).optional()
          .describe('Target graph. Defaults to "knowledge" for note-to-note links.'),
      },
    },
    async ({ fromId, toId, kind, targetGraph }) => {
      const toGraph = (targetGraph ?? 'knowledge') as GraphName;
      mgr.createEdge({ fromGraph: 'knowledge', fromId, toGraph, toId, kind });
      return { content: [{ type: 'text', text: JSON.stringify({ fromId, toId, kind, targetGraph: toGraph, created: true }, null, 2) }] };
    },
  );
}
