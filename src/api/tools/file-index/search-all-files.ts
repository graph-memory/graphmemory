import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FileIndexGraphManager } from '@/graphs/file-index';

export function register(server: McpServer, mgr: FileIndexGraphManager): void {
  server.registerTool(
    'search_all_files',
    {
      description:
        'Semantic search over all indexed project files by file path. ' +
        'Finds the most relevant files by matching query against file path embeddings using vector similarity. ' +
        'Searches file nodes only (not directories). ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'filePath, fileName, extension, language, size, score. ' +
        'Use this to discover which project files are relevant to a topic.',
      inputSchema: {
        query: z.string().describe('Search query'),
        topK: z.number().min(1).max(500).optional().default(10)
          .describe('Max results (default 10)'),
        minScore: z.number().optional().default(0.3)
          .describe('Minimum cosine similarity score (default 0.3)'),
      },
    },
    async ({ query, topK, minScore }) => {
      const results = await mgr.search(query, { topK, minScore });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
