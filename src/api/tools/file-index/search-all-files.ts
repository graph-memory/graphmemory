import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FilesStore, SearchQuery } from '@/store/types';
import { MAX_SEARCH_QUERY_LEN, FILE_SEARCH_TOP_K, SEARCH_MIN_SCORE_FILES } from '@/lib/defaults';

type EmbedQuery = (text: string) => Promise<number[]>;
interface FilesToolDeps { files: FilesStore; embedQuery: EmbedQuery; }

export function register(server: McpServer, deps: FilesToolDeps): void {
  server.registerTool(
    'files_search',
    {
      description:
        'Semantic search over all indexed project files by file path. ' +
        'Finds the most relevant files by matching query against file path embeddings using vector similarity. ' +
        'Searches file nodes only (not directories). ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'id, score. ' +
        'Use get_file_info with a file path to get full metadata for a specific result.',
      inputSchema: {
        query: z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language or path search query, e.g. "database config" or "test helpers"'),
        limit: z.number().min(1).max(500).optional()
          .describe('Maximum number of results to return (default 10)'),
        minScore: z.number().min(0).max(1).optional()
          .describe('Minimum relevance score 0–1 (default 0.3)'),
      },
    },
    async ({ query, limit = FILE_SEARCH_TOP_K, minScore = SEARCH_MIN_SCORE_FILES }) => {
      const searchQuery: SearchQuery = {
        text: query,
        embedding: await deps.embedQuery(query),
        maxResults: limit,
        minScore,
      };

      const results = deps.files.search(searchQuery);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
