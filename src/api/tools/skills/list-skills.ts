import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'list_skills',
    {
      description:
        'List skills with optional filters. ' +
        'Returns an array of { id, title, description, tags, source, confidence, usageCount, lastUsedAt, createdAt, updatedAt }. ' +
        'Use search_skills for semantic search.',
      inputSchema: {
        source: z.enum(['user', 'learned']).optional().describe('Filter by source'),
        tag:    z.string().optional().describe('Filter by tag (exact match, case-insensitive)'),
        filter: z.string().optional().describe('Substring match on title or ID'),
        limit:  z.number().optional().describe('Max results (default 50)'),
      },
    },
    async ({ source, tag, filter, limit }) => {
      const results = mgr.listSkills({ source, tag, filter, limit });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
