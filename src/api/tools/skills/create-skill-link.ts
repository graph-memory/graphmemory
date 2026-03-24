import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';
import { MAX_TARGET_NODE_ID_LEN, MAX_LINK_KIND_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'skills_create_link',
    {
      description:
        'Link a skill to a node in the docs, code, files, knowledge, or tasks graph. ' +
        'Creates a cross-graph relation from the skill to the target node. ' +
        'The kind is a free-form string, e.g. "references", "implements", "documents".',
      inputSchema: {
        skillId:     z.string().max(500).describe('Source skill ID'),
        targetId:    z.string().max(MAX_TARGET_NODE_ID_LEN).describe('Target node ID in the external graph (e.g. "src/auth.ts::login", "api.md::Setup", "my-note", "my-task")'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks'])
          .describe('Which graph the target belongs to'),
        kind:        z.string().max(MAX_LINK_KIND_LEN).describe('Relation type, e.g. "references", "implements", "documents"'),
        projectId:   z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ skillId, targetId, targetGraph, kind, projectId }) => {
      const created = mgr.createCrossLink(skillId, targetId, targetGraph, kind, projectId);
      if (!created) {
        return { content: [{ type: 'text', text: 'Could not create cross-graph link — skill not found, target not found, or link already exists.' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, targetId, targetGraph, kind, created: true }, null, 2) }] };
    },
  );
}
