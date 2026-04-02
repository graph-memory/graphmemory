import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocsStore } from '@/store/types';

interface DocsToolDeps { docs: DocsStore; }

export function register(server: McpServer, { docs }: DocsToolDeps): void {
  server.registerTool(
    'docs_get_node',
    {
      description:
        'Return the full content of a specific node (file root or section). ' +
        'Use this after search or get_toc to read the full text of a result. ' +
        'Node IDs are numeric integers returned by search, get_toc, and other tools. ' +
        'Returns id, fileId, title, content, level, language, symbols, mtime.',
      inputSchema: {
        nodeId: z.number().int().describe('Numeric node ID from search results or get_toc'),
      },
    },
    async ({ nodeId }) => {
      const node = docs.getNode(nodeId);
      if (!node) {
        return { content: [{ type: 'text', text: 'Node not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(node, null, 2) }] };
    },
  );
}
