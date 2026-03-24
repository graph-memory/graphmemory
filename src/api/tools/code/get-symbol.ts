import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CodeGraphManager } from '@/graphs/code';

export function register(server: McpServer, mgr: CodeGraphManager): void {
  server.registerTool(
    'code_get_symbol',
    {
      description:
        'Return the full content of a specific code symbol. ' +
        'Use this after search_code or get_file_symbols to read the full implementation. ' +
        'Node IDs have the form "fileId::symbolName" or "fileId::ClassName::methodName". ' +
        'Returns id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported, and crossLinks (notes/tasks linking to this symbol).',
      inputSchema: {
        nodeId: z.string().max(500).describe('Symbol ID from search_code or get_file_symbols, e.g. "src/lib/graph.ts::updateFile"'),
      },
    },
    async ({ nodeId }) => {
      const symbol = mgr.getSymbol(nodeId);
      if (!symbol) {
        return { content: [{ type: 'text', text: 'Symbol not found' }], isError: true };
      }
      const { embedding: _embedding, mtime: _mtime, fileEmbedding: _fe, pendingImports: _pi, pendingEdges: _pe, ...rest } = symbol;
      return { content: [{ type: 'text', text: JSON.stringify(rest, null, 2) }] };
    },
  );
}
