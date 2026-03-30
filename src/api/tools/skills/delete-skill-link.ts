import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';
import { MAX_TARGET_NODE_ID_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: SkillGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'skills_delete_link',
    {
      description:
        'Remove a link from a skill to another skill (same-graph) or to a node in the docs, code, files, knowledge, or tasks graph (cross-graph). ' +
        'Omit targetGraph for same-graph skill-to-skill links; set it for cross-graph links. ' +
        'Orphaned proxy nodes are cleaned up automatically.',
      inputSchema: {
        skillId:     z.string().min(1).max(500).describe('Source skill ID'),
        targetId:    z.string().min(1).max(MAX_TARGET_NODE_ID_LEN).describe('Target skill ID (same-graph) or target node ID in external graph (cross-graph)'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks']).optional()
          .describe('Target graph: "docs", "code", "files", "knowledge", or "tasks". Omit for skill-to-skill links.'),
        projectId:   z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ skillId, targetId, targetGraph, projectId }) => {
      const author = resolveAuthor();
      if (targetGraph) {
        const deleted = mgr.deleteCrossLink(skillId, targetId, targetGraph, projectId, author);
        if (!deleted) {
          return { content: [{ type: 'text', text: 'Cross-graph link not found.' }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ skillId, targetId, targetGraph, deleted: true }, null, 2) }] };
      }
      // Same-graph skill-to-skill link
      const deleted = mgr.deleteSkillLink(skillId, targetId, author);
      if (!deleted) {
        return { content: [{ type: 'text', text: 'Link not found.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, targetId, deleted: true }, null, 2) }] };
    },
  );
}
