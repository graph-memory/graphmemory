import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocsStore, SearchQuery } from '@/store/types';
import { MAX_SEARCH_QUERY_LEN, FILE_SEARCH_TOP_K, SEARCH_MIN_SCORE_FILES } from '@/lib/defaults';

type EmbedQuery = (text: string) => Promise<number[]>;
interface DocsToolDeps { docs: DocsStore; embedQuery: EmbedQuery; }

export function register(server: McpServer, { docs, embedQuery }: DocsToolDeps): void {
  server.registerTool(
    'docs_search_files',
    {
      description:
        'Semantic search over indexed documentation files. ' +
        'Finds the most relevant files by matching query against file-level embeddings ' +
        '(file path + title/content summary) using vector similarity. ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'fileId, title, chunkCount, score. ' +
        'Use this to discover which doc files are relevant before diving into content with search or get_toc.',
      inputSchema: {
        query:    z.string().max(MAX_SEARCH_QUERY_LEN).describe('Natural language search query, e.g. "authentication setup" or "API endpoints"'),
        limit:    z.number().min(1).max(500).optional().describe('Maximum number of results to return (default 10)'),
        minScore: z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1 (default 0.3)'),
      },
    },
    async ({ query, limit = FILE_SEARCH_TOP_K, minScore = SEARCH_MIN_SCORE_FILES }) => {
      const sq: SearchQuery = {
        text: query,
        embedding: await embedQuery(query),
        maxResults: limit,
        minScore,
      };

      const hits = docs.searchFiles(sq);
      const results = hits.map(h => {
        const node = docs.getNode(h.id);
        return node
          ? { fileId: node.fileId, title: node.title, score: h.score }
          : { id: h.id, score: h.score };
      });

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
