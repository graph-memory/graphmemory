import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CodeStore } from '@/store/types';

type EmbedQuery = (text: string) => Promise<number[]>;
interface CodeToolDeps { code: CodeStore; embedQuery: EmbedQuery; }

export function register(server: McpServer, deps: CodeToolDeps): void {
  server.registerTool(
    'code_get_symbol',
    {
      description:
        'Return the full content of a specific code symbol. ' +
        'Use this after search_code or get_file_symbols to read the full implementation. ' +
        'Node IDs are numeric integers returned by search or list operations. ' +
        'Returns id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported.',
      inputSchema: {
        nodeId: z.number().int().min(1).describe('Numeric symbol ID from search_code or get_file_symbols'),
      },
    },
    async ({ nodeId }) => {
      const node = deps.code.getNode(nodeId);
      if (!node) {
        return { content: [{ type: 'text', text: 'Symbol not found' }], isError: true };
      }
      const { mtime, ...rest } = node;
      return { content: [{ type: 'text', text: JSON.stringify(rest, null, 2) }] };
    },
  );
}
