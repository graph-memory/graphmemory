import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocsStore, SearchQuery } from '@/store/types';
import { MAX_SEARCH_QUERY_LEN, LIST_LIMIT_SMALL, SEARCH_MIN_SCORE_CODE } from '@/lib/defaults';

type EmbedQuery = (text: string) => Promise<number[]>;
interface DocsToolDeps { docs: DocsStore; embedQuery: EmbedQuery; }

export function register(server: McpServer, { docs, embedQuery }: DocsToolDeps): void {
  server.registerTool(
    'docs_search_snippets',
    {
      description:
        'Semantic search over code snippets extracted from documentation. ' +
        'Finds the most relevant code examples using vector similarity. ' +
        'Only searches nodes that are fenced code blocks (have a language tag). ' +
        'Use this when looking for code examples by description, e.g. "authentication example" or "database query". ' +
        'Returns code block nodes sorted by relevance score.',
      inputSchema: {
        query:      z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language search query'),
        limit:      z.number().min(1).max(500).optional().describe('Max results to return (default 10)'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1 (default 0.3)'),
        language:   z.string().max(100).optional().describe('Filter by language, e.g. "typescript", "python"'),
      },
    },
    async ({ query, limit = LIST_LIMIT_SMALL, minScore = SEARCH_MIN_SCORE_CODE, language }) => {
      const sq: SearchQuery = {
        text: query,
        embedding: await embedQuery(query),
        maxResults: limit,
        minScore,
      };

      const hits = docs.searchSnippets(sq, language?.toLowerCase());
      const results = hits.map(h => {
        const node = docs.getNode(h.id);
        return node
          ? {
              id: node.id,
              fileId: node.fileId,
              language: node.language,
              symbols: node.symbols,
              content: node.content,
              score: h.score,
            }
          : { id: h.id, score: h.score };
      });

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
