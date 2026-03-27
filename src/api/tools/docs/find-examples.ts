import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocGraph, NodeAttributes } from '@/graphs/docs';
import type { DocGraphManager } from '@/graphs/docs';
import { MAX_SEARCH_QUERY_LEN, LIST_LIMIT_SMALL } from '@/lib/defaults';

export function register(server: McpServer, mgr: DocGraphManager): void {
  const graph = mgr.graph;

  server.registerTool(
    'docs_find_examples',
    {
      description:
        'Find code examples in documentation that contain a specific symbol (function, class, interface, etc.). ' +
        'Searches the `symbols` array extracted from fenced code blocks via AST parsing. ' +
        'Use this to find usage examples of a known symbol in the docs. ' +
        'Returns matching code block nodes with id, fileId, language, symbols, content, and the parent section context.',
      inputSchema: {
        symbol: z.string().max(MAX_SEARCH_QUERY_LEN).describe('Symbol name to search for, e.g. "createUser", "UserService"'),
        limit:  z.number().optional().describe('Max results to return (default 10)'),
      },
    },
    async ({ symbol, limit = LIST_LIMIT_SMALL }) => {
      const symbolLower = symbol.toLowerCase();
      const results: Array<{
        id: string;
        fileId: string;
        language: string | undefined;
        symbols: string[];
        content: string;
        parentId: string | undefined;
        parentTitle: string | undefined;
      }> = [];

      graph.forEachNode((id, attrs: NodeAttributes) => {
        if (results.length >= limit) return;
        if (attrs.symbols.length === 0) return;
        if (!attrs.symbols.some(s => s === symbol || s.toLowerCase() === symbolLower)) return;

        // Find parent text section (previous node with lower level and no language)
        const parentId = findParentSection(graph, id, attrs);

        results.push({
          id,
          fileId: attrs.fileId,
          language: attrs.language,
          symbols: attrs.symbols,
          content: attrs.content,
          parentId,
          parentTitle: parentId ? graph.getNodeAttribute(parentId, 'title') : undefined,
        });
      });

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No code examples found containing symbol: ${symbol}` }] };
      }

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}

function findParentSection(graph: DocGraph, nodeId: string, attrs: NodeAttributes): string | undefined {
  // Walk inNeighbors (sibling edges point forward, so the parent is an inNeighbor)
  for (const neighbor of graph.inNeighbors(nodeId)) {
    const nAttrs = graph.getNodeAttributes(neighbor);
    if (nAttrs.fileId === attrs.fileId && nAttrs.language === undefined && nAttrs.level < attrs.level) {
      return neighbor;
    }
  }
  return undefined;
}
