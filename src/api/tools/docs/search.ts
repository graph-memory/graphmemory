import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocsStore, SearchQuery } from '@/store/types';
import { MAX_SEARCH_QUERY_LEN } from '@/lib/defaults';

type EmbedQuery = (text: string) => Promise<number[]>;
interface DocsToolDeps { docs: DocsStore; embedQuery: EmbedQuery; }

export function register(server: McpServer, { docs, embedQuery }: DocsToolDeps): void {
  server.registerTool(
    'docs_search',
    {
      description:
        'Semantic search over the indexed documentation. ' +
        'Supports three modes: hybrid (default, BM25 + vector), vector, keyword. ' +
        'Returns an array of chunks sorted by relevance score (0–1), each with: ' +
        'id, fileId, title, content, level, score. ' +
        'Use the id from results to fetch full content with get_node. ' +
        'Prefer this tool when looking for information without knowing which file contains it.',
      inputSchema: {
        query:      z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language search query'),
        topK:       z.number().min(1).max(500).optional().describe('How many top similar sections to return as vector candidates (default 50)'),
        maxResults: z.number().min(1).max(500).optional().describe('Maximum number of results to return (default 5)'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score threshold 0–1; lower values return more results (default 0.5)'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode: hybrid (default, BM25 + vector), vector (embedding only), keyword (BM25 only)'),
      },
    },
    async ({ query, topK, maxResults, minScore, searchMode }) => {
      const sq: SearchQuery = {
        text: query,
        searchMode,
        topK,
        maxResults,
        minScore,
      };

      if (searchMode !== 'keyword') {
        sq.embedding = await embedQuery(query);
      }

      const hits = docs.search(sq);
      const results = hits.map(h => {
        const node = docs.getNode(h.id);
        return node
          ? { id: node.id, fileId: node.fileId, title: node.title, content: node.content, level: node.level, score: h.score }
          : { id: h.id, score: h.score };
      });

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
