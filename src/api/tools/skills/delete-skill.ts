import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_delete',
    {
      description:
        'Delete a skill and all its edges (relations, cross-graph links). ' +
        'Orphaned proxy nodes are cleaned up automatically. ' +
        'This action is irreversible.',
      inputSchema: {
        skillId: z.number().int().positive().describe('Skill ID to delete'),
      },
    },
    async ({ skillId }) => {
      try {
        mgr.deleteSkill(skillId);
        return { content: [{ type: 'text', text: JSON.stringify({ skillId, deleted: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return { content: [{ type: 'text', text: 'Skill not found' }], isError: true };
        }
        throw err;
      }
    },
  );
}
