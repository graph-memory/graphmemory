import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CodeGraphManager } from '@/graphs/code';

export function register(server: McpServer, mgr: CodeGraphManager): void {
  server.registerTool(
    'code_get_file_symbols',
    {
      description:
        'Return all symbols (functions, classes, types, etc.) declared in a specific file. ' +
        'Use this to understand the structure of a file before reading individual symbols. ' +
        'Returns an array of { id, kind, name, signature, startLine, endLine, isExported }. ' +
        'Pass an id to get_symbol to fetch full content including body and docComment.',
      inputSchema: {
        fileId: z.string().min(1).max(500).describe('File path relative to code dir, e.g. "src/lib/graph.ts"'),
      },
    },
    async ({ fileId }) => {
      const symbols = mgr.getFileSymbols(fileId);
      if (symbols.length === 0) {
        return { content: [{ type: 'text', text: 'File not found or contains no symbols' }], isError: true };
      }
      const result = symbols.map(s => ({
        id: s.id,
        kind: s.kind,
        name: s.name,
        signature: s.signature,
        startLine: s.startLine,
        endLine: s.endLine,
        isExported: s.isExported,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}
