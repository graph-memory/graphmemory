import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'skills_bump_usage',
    {
      description:
        'Record that a skill was used. Increments usageCount and updates lastUsedAt timestamp. ' +
        'Call this after successfully applying a skill.',
      inputSchema: {
        skillId: z.string().min(1).max(500).describe('Skill ID to bump usage for'),
      },
    },
    async ({ skillId }) => {
      const author = resolveAuthor();
      const ok = mgr.bumpUsage(skillId, author);
      if (!ok) {
        return { content: [{ type: 'text', text: 'Skill not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, bumped: true }, null, 2) }] };
    },
  );
}
