import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocsStore } from '@/store/types';
import { LIST_LIMIT_SMALL } from '@/lib/defaults';
import { stripEmptyArrays } from '@/api/tools/response';

interface DocsToolDeps { docs: DocsStore; }

export function register(server: McpServer, { docs }: DocsToolDeps): void {
  server.registerTool(
    'docs_list_snippets',
    {
      description:
        'List code snippets extracted from documentation files. ' +
        'Returns code block nodes with language, symbols, and a content preview. ' +
        'Supports filtering by language. ' +
        'Use this to discover what code examples exist in the docs.',
      inputSchema: {
        language: z.string().max(100).optional().describe('Filter by language, e.g. "typescript"'),
        limit:    z.number().int().min(1).max(1000).optional().describe('Max results to return (default 10)'),
        offset:   z.number().int().min(0).max(100_000).optional().describe('Offset for pagination (default 0)'),
      },
    },
    async ({ language, limit = LIST_LIMIT_SMALL, offset = 0 }) => {
      const { results: nodes, total } = docs.listSnippets(
        language?.toLowerCase(),
        { limit, offset },
      );

      if (nodes.length === 0) {
        return { content: [{ type: 'text', text: 'No code snippets found matching the criteria.' }] };
      }

      const results = nodes.map(n => ({
        id: n.id,
        fileId: n.fileId,
        language: n.language,
        symbols: n.symbols,
        preview: n.content.length > 200 ? n.content.slice(0, 200) + '\u2026' : n.content,
      }));

      return { content: [{ type: 'text', text: JSON.stringify({ results, total }, stripEmptyArrays, 2) }] };
    },
  );
}
