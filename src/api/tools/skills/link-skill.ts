import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'skills_link',
    {
      description:
        'Create a directed relation between two skills. ' +
        '"depends_on": fromId depends on toId. ' +
        '"related_to": free association between skills. ' +
        '"variant_of": fromId is a variant of toId.',
      inputSchema: {
        fromId: z.string().min(1).max(500).describe('Source skill ID'),
        toId:   z.string().min(1).max(500).describe('Target skill ID'),
        kind:   z.enum(['depends_on', 'related_to', 'variant_of']).describe('Relation type: "depends_on", "related_to", or "variant_of"'),
      },
    },
    async ({ fromId, toId, kind }) => {
      const created = mgr.linkSkills(fromId, toId, kind);
      if (!created) {
        return { content: [{ type: 'text', text: 'Could not create relation — one or both skills not found, or relation already exists.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ fromId, toId, kind, created: true }, null, 2) }] };
    },
  );
}
