import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CodeStore, SearchQuery } from '@/store/types';
import { MAX_SEARCH_QUERY_LEN } from '@/lib/defaults';

type EmbedQuery = (text: string) => Promise<number[]>;
interface CodeToolDeps { code: CodeStore; embedQuery: EmbedQuery; }

export function register(server: McpServer, deps: CodeToolDeps): void {
  server.registerTool(
    'code_search',
    {
      description:
        'Semantic search over the indexed source code. ' +
        'Supports three modes: hybrid (default, combines BM25 keyword + vector similarity), ' +
        'vector (embedding only), keyword (BM25 text matching only). ' +
        'Finds the most relevant symbols (functions, classes, constructors, types) by matching ' +
        'against name, signature, doc comments, and body text. ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'id, fileId, kind, name, signature, docComment, startLine, endLine, score. ' +
        'Set includeBody=true to include full source code in results (avoids extra get_symbol calls).',
      inputSchema: {
        query:      z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language or code search query, e.g. "function that loads the graph from disk"'),
        topK:       z.number().min(1).max(500).optional().describe('How many top vector candidates to use (default 50)'),
        maxResults: z.number().min(1).max(500).optional().describe('Maximum number of results to return (default 5)'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1; lower values return more results (default 0.3)'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode: hybrid (default, BM25 + vector), vector (embedding only), keyword (BM25 only)'),
        includeBody: z.boolean().optional().describe('Include full source code body in results (default false)'),
      },
    },
    async ({ query, topK, maxResults, minScore, searchMode, includeBody }) => {
      const searchQuery: SearchQuery = {
        text: query,
        searchMode,
        topK,
        maxResults,
        minScore,
      };

      if (searchMode !== 'keyword') {
        searchQuery.embedding = await deps.embedQuery(query);
      }

      const searchResults = deps.code.search(searchQuery);

      const results = searchResults.map(sr => {
        const node = deps.code.getNode(sr.id);
        if (!node) return null;
        const { body, mtime, ...rest } = node;
        return {
          ...rest,
          score: sr.score,
          ...(includeBody ? { body } : {}),
        };
      }).filter(Boolean);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
