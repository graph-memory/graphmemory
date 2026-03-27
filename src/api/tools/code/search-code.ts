import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CodeGraphManager } from '@/graphs/code';
import { MAX_SEARCH_QUERY_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: CodeGraphManager): void {
  server.registerTool(
    'code_search',
    {
      description:
        'Semantic search over the indexed source code. ' +
        'Supports three modes: hybrid (default, combines BM25 keyword + vector similarity), ' +
        'vector (embedding only), keyword (BM25 text matching only). ' +
        'Finds the most relevant symbols (functions, classes, constructors, types) by matching ' +
        'against name, signature, doc comments, and body text, ' +
        'then expands results by following graph edges (imports, contains, extends). ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'id, fileId, kind, name, signature, docComment, startLine, endLine, score. ' +
        'Set includeBody=true to include full source code in results (avoids extra get_symbol calls).',
      inputSchema: {
        query:      z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language or code search query, e.g. "function that loads the graph from disk"'),
        topK:       z.number().min(1).max(500).optional().describe('How many top similar symbols to use as seeds (default 5)'),
        bfsDepth:   z.number().min(0).max(10).optional().describe('How many hops to follow graph edges from each seed (default 1; 0 = no expansion)'),
        maxResults: z.number().min(1).max(500).optional().describe('Maximum number of results to return (default 5)'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1; lower values return more results (default 0.3)'),
        bfsDecay:   z.number().min(0).max(1).optional().describe('Score multiplier per graph hop (default 0.8)'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode: hybrid (default, BM25 + vector), vector (embedding only), keyword (BM25 only)'),
        includeBody: z.boolean().optional().describe('Include full source code body in results (default false)'),
      },
    },
    async ({ query, topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode, includeBody }) => {
      const results = await mgr.search(query, { topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode, includeBody });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
