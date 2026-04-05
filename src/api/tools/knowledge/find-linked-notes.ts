import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import type { GraphName } from '@/store/types';
import { MAX_LINK_KIND_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'notes_find_linked',
    {
      description:
        'Find all notes that link to a specific node in another graph. ' +
        'Reverse lookup — given a target (e.g. a code symbol or task), ' +
        'returns all notes that reference it. ' +
        'Use notes_get to fetch full content of a returned note.',
      inputSchema: {
        targetId:    z.number().int().positive().describe('Target node ID'),
        targetGraph: z.enum(['docs', 'code', 'files', 'tasks', 'skills']).describe('Which graph the target belongs to'),
        kind:        z.string().max(MAX_LINK_KIND_LEN).optional().describe('Filter by edge kind. If omitted, returns all edges.'),
      },
    },
    async ({ targetId, targetGraph, kind }) => {
      // Find edges from knowledge → targetGraph where toId = targetId
      const edges = mgr.listEdges({ fromGraph: 'knowledge', toGraph: targetGraph as GraphName, toId: targetId });
      const filtered = kind ? edges.filter(e => e.kind === kind) : edges;

      if (filtered.length === 0) {
        return { content: [{ type: 'text', text: `No notes linked to ${targetGraph}::${targetId}` }] };
      }

      const results = filtered.map(e => {
        const note = mgr.getNote(e.fromId);
        return note ? { noteId: note.id, title: note.title, kind: e.kind, tags: note.tags } : null;
      }).filter(Boolean);

      const clean = (_k: string, v: unknown) => (Array.isArray(v) && v.length === 0 ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(results, clean, 2) }] };
    },
  );
}
