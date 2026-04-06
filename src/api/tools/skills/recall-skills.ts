import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { MAX_SEARCH_QUERY_LEN } from '@/lib/defaults';
import { stripEmptyInList } from '@/api/tools/response';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_recall',
    {
      description:
        'Recall relevant skills for a given task context. Like search_skills but with lower ' +
        'minScore default (0.3) for higher recall. Use at the start of a task to find applicable recipes.',
      inputSchema: {
        context:    z.string().max(MAX_SEARCH_QUERY_LEN).describe('Description of the current task or context to match skills against'),
        maxResults:      z.number().min(1).max(500).optional().describe('Maximum number of results to return'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1 (default 0.3)'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode: hybrid (default, BM25 + vector), vector (embedding only), keyword (BM25 only)'),
      },
    },
    async ({ context, maxResults, minScore, searchMode }) => {
      const results = await mgr.searchSkills({ text: context, searchMode, maxResults, minScore: minScore ?? 0 });
      return { content: [{ type: 'text', text: JSON.stringify(results, stripEmptyInList, 2) }] };
    },
  );
}
