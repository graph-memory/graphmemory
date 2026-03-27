import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CodeGraphManager } from '@/graphs/code';
import { MAX_SEARCH_QUERY_LEN, FILE_SEARCH_TOP_K, SEARCH_MIN_SCORE_FILES } from '@/lib/defaults';

export function register(server: McpServer, mgr: CodeGraphManager): void {
  server.registerTool(
    'code_search_files',
    {
      description:
        'Semantic search over indexed source code files. ' +
        'Finds the most relevant files by matching query against file-level embeddings ' +
        '(file path) using vector similarity. ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'fileId, symbolCount, score. ' +
        'Use this to discover which source files are relevant before diving into symbols with get_file_symbols or search_code.',
      inputSchema: {
        query:    z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language or path search query, e.g. "graph persistence" or "search module"'),
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
