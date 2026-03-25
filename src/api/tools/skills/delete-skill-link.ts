import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';
import { MAX_TARGET_NODE_ID_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'skills_delete_link',
    {
      description:
        'Remove a cross-graph link from a skill to a node in the docs, code, files, knowledge, or tasks graph. ' +
        'Orphaned proxy nodes are cleaned up automatically.',
      inputSchema: {
        skillId:     z.string().min(1).max(500).describe('Source skill ID'),
        targetId:    z.string().min(1).max(MAX_TARGET_NODE_ID_LEN).describe('Target node ID in the external graph'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks'])
          .describe('Which graph the target belongs to'),
        projectId:   z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ skillId, targetId, targetGraph, projectId }) => {
      const deleted = mgr.deleteCrossLink(skillId, targetId, targetGraph, projectId);
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Cross-graph link not found.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, targetId, targetGraph, deleted: true }, null, 2) }] };
    },
  );
}
