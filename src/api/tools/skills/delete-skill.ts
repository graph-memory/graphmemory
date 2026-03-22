import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'delete_skill',
    {
      description:
        'Delete a skill and all its edges (relations, cross-graph links). ' +
        'Orphaned proxy nodes are cleaned up automatically. ' +
        'This action is irreversible.',
      inputSchema: {
        skillId: z.string().max(500).describe('Skill ID to delete'),
      },
    },
    async ({ skillId }) => {
      const deleted = mgr.deleteSkill(skillId);
      if (!deleted) {
        return { content: [{ type: 'text', text: `Skill "${skillId}" not found.` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, deleted: true }, null, 2) }] };
    },
  );
}
