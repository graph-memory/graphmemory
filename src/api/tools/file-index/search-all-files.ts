import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FileIndexGraphManager } from '@/graphs/file-index';
import { MAX_SEARCH_QUERY_LEN, FILE_SEARCH_TOP_K, SEARCH_MIN_SCORE_FILES } from '@/lib/defaults';

export function register(server: McpServer, mgr: FileIndexGraphManager): void {
  server.registerTool(
    'files_search',
    {
      description:
        'Semantic search over all indexed project files by file path. ' +
        'Finds the most relevant files by matching query against file path embeddings using vector similarity. ' +
        'Searches file nodes only (not directories). ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'filePath, fileName, extension, language, size, score. ' +
        'Use this to discover which project files are relevant to a topic.',
      inputSchema: {
        query: z.string().max(MAX_SEARCH_QUERY_LEN).describe('Search query'),
        limit: z.number().min(1).max(500).optional()
          .describe('Max results'),
        minScore: z.number().min(0).max(1).optional()
          .describe('Minimum cosine similarity score'),
      },
    },
    async ({ query, limit = FILE_SEARCH_TOP_K, minScore = SEARCH_MIN_SCORE_FILES }) => {
      const results = await mgr.search(query, { topK: limit, minScore });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
