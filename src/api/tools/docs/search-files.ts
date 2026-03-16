import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocGraphManager } from '@/graphs/docs';

export function register(server: McpServer, mgr: DocGraphManager): void {
  server.registerTool(
    'search_topic_files',
    {
      description:
        'Semantic search over indexed documentation files. ' +
        'Finds the most relevant files by matching query against file-level embeddings ' +
        '(file path + title/content summary) using vector similarity. ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'fileId, title, chunks, score. ' +
        'Use this to discover which doc files are relevant before diving into content with search or get_toc.',
      inputSchema: {
        query:    z.string().describe('Natural language search query, e.g. "authentication setup" or "API endpoints"'),
        topK:     z.number().optional().describe('Maximum number of results to return (default 10)'),
        minScore: z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1 (default 0.3)'),
      },
    },
    async ({ query, topK, minScore }) => {
      const results = await mgr.searchFiles(query, { topK, minScore });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
