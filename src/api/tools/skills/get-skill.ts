import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { cleanReplacer } from '@/api/tools/response';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_get',
    {
      description:
        'Get full details of a skill by ID, including steps, triggers, inputHints, filePatterns, ' +
        'usage stats, and cross-graph links. ' +
        'Returns: id, title, description, steps, triggers, inputHints, filePatterns, tags, ' +
        'source, confidence, usageCount, lastUsedAt, createdAt, updatedAt, crossLinks[].',
      inputSchema: {
        skillId: z.number().int().positive().describe('Skill ID to retrieve'),
      },
    },
    async ({ skillId }) => {
      const skill = mgr.getSkill(skillId);
      if (!skill) {
        return { content: [{ type: 'text', text: 'Skill not found' }], isError: true };
      }
      // Transform edges into structured arrays
      const dependsOn: number[] = [];
      const dependedBy: number[] = [];
      const related: number[] = [];
      const variants: number[] = [];
      const crossLinks: { graph: string; nodeId: number; kind: string }[] = [];

      for (const e of skill.edges) {
        if (e.fromGraph === 'skills' && e.toGraph === 'skills') {
          if (e.kind === 'depends_on' && e.fromId === skillId) dependsOn.push(e.toId);
          else if (e.kind === 'depends_on' && e.toId === skillId) dependedBy.push(e.fromId);
          else if (e.kind === 'variant_of') variants.push(e.fromId === skillId ? e.toId : e.fromId);
          else if (e.kind === 'related_to') related.push(e.fromId === skillId ? e.toId : e.fromId);
        } else {
          const otherGraph = e.fromGraph === 'skills' ? e.toGraph : e.fromGraph;
          const otherId = e.fromGraph === 'skills' ? e.toId : e.fromId;
          crossLinks.push({ graph: otherGraph, nodeId: otherId, kind: e.kind });
        }
      }

      const { edges: _edges, ...rest } = skill;
      const result = { ...rest, dependsOn, dependedBy, related, variants, crossLinks };
      return { content: [{ type: 'text', text: JSON.stringify(result, cleanReplacer, 2) }] };
    },
  );
}
