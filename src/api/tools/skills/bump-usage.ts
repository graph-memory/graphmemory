import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_bump_usage',
    {
      description:
        'Record that a skill was used. Increments usageCount and updates lastUsedAt timestamp. ' +
        'Call this after successfully applying a skill.',
      inputSchema: {
        skillId: z.number().int().positive().describe('Skill ID to bump usage for'),
      },
    },
    async ({ skillId }) => {
      try {
        mgr.bumpSkillUsage(skillId);
        return { content: [{ type: 'text', text: JSON.stringify({ skillId, bumped: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Skill not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
