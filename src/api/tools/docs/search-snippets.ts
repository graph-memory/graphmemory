import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocGraphManager } from '@/graphs/docs';
import { MAX_SEARCH_QUERY_LEN, LIST_LIMIT_SMALL, SEARCH_MIN_SCORE_CODE } from '@/lib/defaults';

export function register(server: McpServer, mgr: DocGraphManager): void {
  const graph = mgr.graph;

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
      // Search all nodes via mgr.search (no BFS expansion), then filter to code blocks only
      const allResults = await mgr.search(query, { topK: limit * 3, maxResults: limit * 5, minScore, bfsDepth: 0 });
      const filtered = allResults.filter(r => {
        const attrs = graph.getNodeAttributes(r.id);
        if (attrs.language === undefined) return false;
        if (language && attrs.language !== language.toLowerCase()) return false;
        return true;
      }).slice(0, limit);

      const results = filtered.map(r => {
        const attrs = graph.getNodeAttributes(r.id);
        return {
          id: r.id,
          fileId: attrs.fileId,
          language: attrs.language,
          symbols: attrs.symbols,
          content: attrs.content,
          score: r.score,
        };
      });

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
