import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import type { GraphName } from '@/store/types';
import { MAX_LINK_KIND_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_create_link',
    {
      description:
        'Link a skill to another skill (same-graph) or to a node in the docs, code, files, knowledge, or tasks graph (cross-graph). ' +
        'Omit targetGraph for same-graph skill-to-skill links; set it for cross-graph links. ' +
        'The kind is a free-form string, e.g. "references", "implements", "documents".',
      inputSchema: {
        skillId:     z.number().int().positive().describe('Source skill ID'),
        targetId:    z.number().int().positive().describe('Target node ID'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks']).optional()
          .describe('Target graph: "docs", "code", "files", "knowledge", or "tasks". Omit for skill-to-skill links.'),
        kind:        z.string().min(1).max(MAX_LINK_KIND_LEN).describe('Relation type, e.g. "references", "implements", "documents"'),
      },
    },
    async ({ skillId, targetId, targetGraph, kind }) => {
      const toGraph = (targetGraph ?? 'skills') as GraphName;
      mgr.createEdge({ fromGraph: 'skills', fromId: skillId, toGraph, toId: targetId, kind });
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, targetId, targetGraph: toGraph, kind, created: true }, null, 2) }] };
    },
  );
}
