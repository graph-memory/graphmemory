import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';
import { MAX_TARGET_NODE_ID_LEN, MAX_LINK_KIND_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'skills_find_linked',
    {
      description:
        'Find all skills that link to a specific node in the docs, code, files, knowledge, or tasks graph. ' +
        'This is a reverse lookup — given a target, returns all skills that reference it. ' +
        'Returns an array of { skillId, title, kind, source, confidence, tags }. ' +
        'Use skills_get to fetch full content of a returned skill.',
      inputSchema: {
        targetGraph:  z.enum(['docs', 'code', 'files', 'knowledge', 'tasks'])
          .describe('Which graph the target belongs to: "docs", "code", "files", "knowledge", or "tasks"'),
        targetId:     z.string().min(1).max(MAX_TARGET_NODE_ID_LEN).describe('Target node ID in the external graph, e.g. "src/auth.ts" or "guide.md::Setup"'),
        kind:         z.string().max(MAX_LINK_KIND_LEN).optional().describe('Filter by relation kind. If omitted, returns all relations.'),
        projectId:    z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ targetGraph, targetId, kind, projectId }) => {
      const results = mgr.findLinkedSkills(targetGraph, targetId, kind, projectId);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No skills linked to ${targetGraph}::${targetId}` }] };
      }
      const clean = (_k: string, v: any) => (Array.isArray(v) && v.length === 0 ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(results, clean, 2) }] };
    },
  );
}
