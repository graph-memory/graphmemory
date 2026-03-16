import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CodeGraphManager } from '@/graphs/code';

export function register(server: McpServer, mgr: CodeGraphManager): void {
  server.registerTool(
    'search_code',
    {
      description:
        'Semantic search over the indexed source code. ' +
        'Finds the most relevant symbols (functions, classes, types) by matching ' +
        'against their signatures and doc comments using vector similarity, ' +
        'then expands results by following graph edges (imports, contains, extends). ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'id, fileId, kind, name, signature, docComment, startLine, endLine, score. ' +
        'Pass an id to get_symbol to read the full implementation.',
      inputSchema: {
        query:      z.string().describe('Natural language or code search query, e.g. "function that loads the graph from disk"'),
        topK:       z.number().optional().describe('How many top similar symbols to use as seeds (default 5)'),
        bfsDepth:   z.number().optional().describe('How many hops to follow graph edges from each seed (default 1; 0 = no expansion)'),
        maxResults: z.number().optional().describe('Maximum number of results to return (default 20)'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1; lower values return more results (default 0.5)'),
        bfsDecay:   z.number().min(0).max(1).optional().describe('Score multiplier per graph hop (default 0.8)'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode: hybrid (default, BM25 + vector), vector (embedding only), keyword (BM25 only)'),
      },
    },
    async ({ query, topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode }) => {
      const results = await mgr.search(query, { topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
