import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocGraph, NodeAttributes } from '@/graphs/docs';
import type { DocGraphManager } from '@/graphs/docs';

export function register(server: McpServer, mgr: DocGraphManager): void {
  const graph = mgr.graph;

  server.registerTool(
    'explain_symbol',
    {
      description:
        'Find documentation that explains a specific symbol. ' +
        'Searches code blocks in docs for the symbol, then returns both the code example ' +
        'and the surrounding text section that provides context/explanation. ' +
        'Use this to understand what a function, class, or type does based on documentation.',
      inputSchema: {
        symbol: z.string().describe('Symbol name to look up, e.g. "createUser", "AuthService"'),
        limit:  z.number().optional().describe('Max results to return (default 10)'),
      },
    },
    async ({ symbol, limit = 10 }) => {
      const symbolLower = symbol.toLowerCase();
      const results: Array<{
        codeBlock: { id: string; language: string | undefined; symbols: string[]; content: string };
        explanation: { id: string; title: string; content: string } | null;
        fileId: string;
      }> = [];

      graph.forEachNode((id, attrs: NodeAttributes) => {
        if (results.length >= limit) return;
        if (attrs.symbols.length === 0) return;
        if (!attrs.symbols.some(s => s === symbol || s.toLowerCase() === symbolLower)) return;

        // Find the parent text section
        const parent = findParentTextSection(graph, id, attrs);

        results.push({
          codeBlock: {
            id,
            language: attrs.language,
            symbols: attrs.symbols,
            content: attrs.content,
          },
          explanation: parent
            ? { id: parent.id, title: parent.title, content: parent.content }
            : null,
          fileId: attrs.fileId,
        });
      });

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No documentation found for symbol: ${symbol}` }] };
      }

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}

function findParentTextSection(
  graph: DocGraph,
  nodeId: string,
  attrs: NodeAttributes,
): { id: string; title: string; content: string } | null {
  // The code block's in-neighbor with same fileId, lower level, and no language = parent text section
  for (const neighbor of graph.inNeighbors(nodeId)) {
    const nAttrs = graph.getNodeAttributes(neighbor);
    if (nAttrs.fileId === attrs.fileId && nAttrs.language === undefined && nAttrs.level < attrs.level) {
      return { id: neighbor, title: nAttrs.title, content: nAttrs.content };
    }
  }
  return null;
}
