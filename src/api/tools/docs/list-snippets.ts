import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { NodeAttributes } from '@/graphs/docs';
import type { DocGraphManager } from '@/graphs/docs';

export function register(server: McpServer, mgr: DocGraphManager): void {
  const graph = mgr.graph;

  server.registerTool(
    'list_snippets',
    {
      description:
        'List code snippets extracted from documentation files. ' +
        'Returns code block nodes with language, symbols, and a content preview. ' +
        'Supports filtering by file, language, and content substring. ' +
        'Use this to discover what code examples exist in the docs.',
      inputSchema: {
        fileId:   z.string().optional().describe('Filter by file, e.g. "docs/auth.md"'),
        filter:   z.string().optional().describe('Case-insensitive substring match on content'),
        language: z.string().optional().describe('Filter by language, e.g. "typescript"'),
        limit:    z.number().optional().describe('Max results to return (default 20)'),
      },
    },
    async ({ fileId, filter, language, limit = 20 }) => {
      const lowerFilter = filter?.toLowerCase();
      const lowerLang = language?.toLowerCase();
      const results: Array<{
        id: string;
        fileId: string;
        language: string | undefined;
        symbols: string[];
        preview: string;
      }> = [];

      graph.forEachNode((id, attrs: NodeAttributes) => {
        if (results.length >= limit) return;
        if (attrs.language === undefined) return; // skip text chunks
        if (fileId && attrs.fileId !== fileId) return;
        if (lowerLang && attrs.language !== lowerLang) return;
        if (lowerFilter && !attrs.content.toLowerCase().includes(lowerFilter)) return;

        results.push({
          id,
          fileId: attrs.fileId,
          language: attrs.language,
          symbols: attrs.symbols,
          preview: attrs.content.length > 200 ? attrs.content.slice(0, 200) + '…' : attrs.content,
        });
      });

      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No code snippets found matching the criteria.' }] };
      }

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
