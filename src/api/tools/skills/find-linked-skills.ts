import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import type { GraphName } from '@/store/types';
import { MAX_LINK_KIND_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_find_linked',
    {
      description:
        'Find all skills that link to a specific node in the docs, code, files, knowledge, or tasks graph. ' +
        'This is a reverse lookup — given a target, returns all skills that reference it. ' +
        'Returns an array of { skillId, title, kind, source, confidence, tags }. ' +
        'Use skills_get to fetch full content of a returned skill.',
      inputSchema: {
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks'])
          .describe('Which graph the target belongs to: "docs", "code", "files", "knowledge", or "tasks"'),
        targetId:    z.number().int().positive().describe('Target node ID'),
        kind:        z.string().max(MAX_LINK_KIND_LEN).optional().describe('Filter by relation kind. If omitted, returns all relations.'),
      },
    },
    async ({ targetGraph, targetId, kind }) => {
      const edges = mgr.listEdges({ fromGraph: 'skills', toGraph: targetGraph as GraphName, toId: targetId });
      const filtered = kind ? edges.filter(e => e.kind === kind) : edges;

      if (filtered.length === 0) {
        return { content: [{ type: 'text', text: `No skills linked to ${targetGraph}::${targetId}` }] };
      }

      const results = filtered.map(e => {
        const skill = mgr.getSkill(e.fromId);
        return skill ? { skillId: skill.id, title: skill.title, kind: e.kind, source: skill.source, confidence: skill.confidence, tags: skill.tags } : null;
      }).filter(Boolean);

      const clean = (_k: string, v: unknown) => (Array.isArray(v) && v.length === 0 ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(results, clean, 2) }] };
    },
  );
}
