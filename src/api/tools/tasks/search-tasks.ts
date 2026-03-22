import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';
import { MAX_SEARCH_QUERY_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'search_tasks',
    {
      description:
        'Semantic search over the task graph. ' +
        'Supports three modes: hybrid (default, BM25 + vector), vector, keyword. ' +
        'Finds the most relevant tasks, then expands results ' +
        'by traversing relations between tasks (graph walk). ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'id, title, description, status, priority, tags, score.',
      inputSchema: {
        query:      z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language search query'),
        topK:       z.number().min(1).max(500).optional().describe('How many top similar tasks to use as seeds (default 5)'),
        bfsDepth:   z.number().min(0).max(10).optional().describe('How many hops to follow relations from each seed (default 1; 0 = no expansion)'),
        maxResults: z.number().min(1).max(500).optional().describe('Maximum number of results to return (default 20)'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1 (default 0.5)'),
        bfsDecay:   z.number().min(0).max(1).optional().describe('Score multiplier per hop (default 0.8)'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode: hybrid (default, BM25 + vector), vector (embedding only), keyword (BM25 only)'),
      },
    },
    async ({ query, topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode }) => {
      const results = await mgr.searchTasks(query, { topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
