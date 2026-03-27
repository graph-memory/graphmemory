import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocGraphManager } from '@/graphs/docs';
import { MAX_SEARCH_QUERY_LEN, FILE_SEARCH_TOP_K, SEARCH_MIN_SCORE_FILES } from '@/lib/defaults';

export function register(server: McpServer, mgr: DocGraphManager): void {
  server.registerTool(
    'docs_search_files',
    {
      description:
        'Semantic search over indexed documentation files. ' +
        'Finds the most relevant files by matching query against file-level embeddings ' +
        '(file path + title/content summary) using vector similarity. ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'fileId, title, chunks, score. ' +
        'Use this to discover which doc files are relevant before diving into content with search or get_toc.',
      inputSchema: {
        query:    z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language search query, e.g. "authentication setup" or "API endpoints"'),
        limit:    z.number().min(1).max(500).optional().describe('Maximum number of results to return (default 10)'),
        minScore: z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1 (default 0.3)'),
      },
    },
    async ({ query, limit = FILE_SEARCH_TOP_K, minScore = SEARCH_MIN_SCORE_FILES }) => {
      const results = await mgr.searchFiles(query, { topK: limit, minScore });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
