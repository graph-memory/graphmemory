import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';
import { MAX_TARGET_NODE_ID_LEN, MAX_LINK_KIND_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'skills_create_link',
    {
      description:
        'Link a skill to another skill (same-graph) or to a node in the docs, code, files, knowledge, or tasks graph (cross-graph). ' +
        'Omit targetGraph for same-graph skill-to-skill links; set it for cross-graph links. ' +
        'The kind is a free-form string, e.g. "references", "implements", "documents".',
      inputSchema: {
        skillId:     z.string().min(1).max(500).describe('Source skill ID'),
        targetId:    z.string().min(1).max(MAX_TARGET_NODE_ID_LEN).describe('Target skill ID (same-graph) or target node ID in external graph (cross-graph)'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks']).optional()
          .describe('Which graph the target belongs to. Omit for skill-to-skill links.'),
        kind:        z.string().min(1).max(MAX_LINK_KIND_LEN).describe('Relation type, e.g. "references", "implements", "documents"'),
        projectId:   z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ skillId, targetId, targetGraph, kind, projectId }) => {
      if (targetGraph) {
        const created = mgr.createCrossLink(skillId, targetId, targetGraph, kind, projectId);
        if (!created) {
          return { content: [{ type: 'text', text: 'Could not create cross-graph link — skill not found, target not found, or link already exists.' }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ skillId, targetId, targetGraph, kind, created: true }, null, 2) }] };
      }
      // Same-graph skill-to-skill link
      const created = mgr.linkSkills(skillId, targetId, kind);
      if (!created) {
        return { content: [{ type: 'text', text: 'Could not create link — one or both skills not found, or link already exists.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, targetId, kind, created: true }, null, 2) }] };
    },
  );
}
