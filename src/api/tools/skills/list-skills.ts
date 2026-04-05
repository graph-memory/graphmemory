import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { MAX_TAG_LEN } from '@/lib/defaults';
import { cleanListReplacer } from '@/api/tools/response';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_list',
    {
      description:
        'List skills with optional filters. ' +
        'Returns an array of { id, title, description, tags, source, confidence, usageCount, lastUsedAt, createdAt, updatedAt }. ' +
        'Use search_skills for semantic search.',
      inputSchema: {
        source: z.enum(['user', 'learned']).optional().describe('Filter by source: "user" or "learned"'),
        tag:    z.string().max(MAX_TAG_LEN).optional().describe('Filter by tag (exact match, case-insensitive)'),
        filter: z.string().max(500).optional().describe('Substring match on title or ID'),
        limit:  z.number().int().min(1).max(1000).optional().describe('Max results (default 50)'),
        offset: z.number().int().min(0).max(100_000).optional().describe('Offset for pagination (default 0)'),
      },
    },
    async ({ source, tag, filter, limit, offset }) => {
      const { results, total } = mgr.listSkills({ source, tag, filter, limit, offset });
      return { content: [{ type: 'text', text: JSON.stringify({ results, total }, cleanListReplacer, 2) }] };
    },
  );
}
