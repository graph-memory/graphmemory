import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'delete_skill_link',
    {
      description:
        'Remove a cross-graph link from a skill to a node in the docs, code, files, knowledge, or tasks graph. ' +
        'Orphaned proxy nodes are cleaned up automatically.',
      inputSchema: {
        skillId:     z.string().describe('Source skill ID'),
        targetId:    z.string().describe('Target node ID in the external graph'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks'])
          .describe('Which graph the target belongs to'),
      },
    },
    async ({ skillId, targetId, targetGraph }) => {
      const deleted = mgr.deleteCrossLink(skillId, targetId, targetGraph);
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Cross-graph link not found.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, targetId, targetGraph, deleted: true }, null, 2) }] };
    },
  );
}
