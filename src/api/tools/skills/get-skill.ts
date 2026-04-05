import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_get',
    {
      description:
        'Get full details of a skill by ID, including steps, triggers, inputHints, filePatterns, ' +
        'usage stats, and cross-graph links. ' +
        'Returns: id, title, description, steps, triggers, inputHints, filePatterns, tags, ' +
        'source, confidence, usageCount, lastUsedAt, createdAt, updatedAt, crossLinks[].',
      inputSchema: {
        skillId: z.number().int().positive().describe('Skill ID to retrieve'),
      },
    },
    async ({ skillId }) => {
      const skill = mgr.getSkill(skillId);
      if (!skill) {
        return { content: [{ type: 'text', text: 'Skill not found' }], isError: true };
      }
      const clean = (_k: string, v: unknown) => (v === null || (Array.isArray(v) && v.length === 0) ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(skill, clean, 2) }] };
    },
  );
}
