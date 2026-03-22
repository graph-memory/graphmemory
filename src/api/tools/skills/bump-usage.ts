import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'bump_skill_usage',
    {
      description:
        'Record that a skill was used. Increments usageCount and updates lastUsedAt timestamp. ' +
        'Call this after successfully applying a skill.',
      inputSchema: {
        skillId: z.string().max(500).describe('Skill ID to bump usage for'),
      },
    },
    async ({ skillId }) => {
      const ok = mgr.bumpUsage(skillId);
      if (!ok) {
        return { content: [{ type: 'text', text: 'Skill not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, bumped: true }, null, 2) }] };
    },
  );
}
