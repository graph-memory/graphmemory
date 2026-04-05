import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { MAX_SEARCH_QUERY_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_search',
    {
      description:
        'Semantic search over the task graph. ' +
        'Supports three modes: hybrid (default, BM25 + vector), vector, keyword. ' +
        'Returns an array sorted by relevance score (0-1), each with: ' +
        'id, title, description, status, priority, tags, score.',
      inputSchema: {
        query:      z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language search query'),
        maxResults:      z.number().min(1).max(500).optional().describe('Maximum number of results to return'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score 0-1 (default 0.5)'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode: "hybrid" (default, BM25 + vector), "vector" (embedding only), or "keyword" (BM25 only)'),
      },
    },
    async ({ query, maxResults, minScore, searchMode }) => {
      const results = await mgr.searchTasks({ text: query, searchMode, maxResults, minScore });
      const clean = (k: string, v: unknown) => (k !== '' && Array.isArray(v) && v.length === 0 ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(results, clean, 2) }] };
    },
  );
}
