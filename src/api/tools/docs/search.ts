import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocGraphManager } from '@/graphs/docs';

export function register(server: McpServer, mgr: DocGraphManager): void {
  server.registerTool(
    'search',
    {
      description:
        'Semantic search over the indexed documentation. ' +
        'Finds the most relevant sections using vector similarity, then expands results ' +
        'by traversing links between documents (graph walk). ' +
        'Returns an array of chunks sorted by relevance score (0–1), each with: ' +
        'id, fileId, title, content, level, score. ' +
        'Use the id from results to fetch full content with get_node. ' +
        'Prefer this tool when looking for information without knowing which file contains it.',
      inputSchema: {
        query:      z.string().describe('Natural language search query'),
        topK:       z.number().min(1).max(500).optional().describe('How many top similar sections to use as seeds for graph expansion (default 5)'),
        bfsDepth:   z.number().min(0).max(10).optional().describe('How many hops to follow cross-document links from each seed (default 1; 0 = no expansion)'),
        maxResults: z.number().min(1).max(500).optional().describe('Maximum number of results to return (default 20)'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score threshold 0–1; lower values return more results (default 0.5)'),
        bfsDecay:   z.number().min(0).max(1).optional().describe('Score multiplier applied per graph hop; controls how quickly relevance fades with distance (default 0.8)'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode: hybrid (default, BM25 + vector), vector (embedding only), keyword (BM25 only)'),
      },
    },
    async ({ query, topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode }) => {
      const results = await mgr.search(query, { topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
