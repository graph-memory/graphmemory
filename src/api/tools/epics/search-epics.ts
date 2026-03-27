import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_SEARCH_QUERY_LEN, MAX_SEARCH_TOP_K } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'epics_search',
    {
      description: 'Semantic search over epics. Returns matching epics ranked by relevance.',
      inputSchema: {
        query:      z.string().min(1).max(MAX_SEARCH_QUERY_LEN).describe('Search query'),
        topK:       z.number().int().positive().max(MAX_SEARCH_TOP_K).optional().describe('Max results'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode'),
      },
    },
    async ({ query, topK, minScore, searchMode }) => {
      const results = await mgr.searchEpics(query, { topK, minScore, searchMode });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
