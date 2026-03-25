import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocGraphManager } from '@/graphs/docs';

export function register(server: McpServer, mgr: DocGraphManager): void {
  server.registerTool(
    'docs_get_node',
    {
      description:
        'Return the full content of a specific node (file root or section). ' +
        'Use this after search or get_toc to read the full text of a result. ' +
        'Node IDs have two forms: ' +
        '"docs/auth.md" for the file root (intro text before any headings), ' +
        '"docs/auth.md::Overview" for a named section. ' +
        'Returns id, fileId, title, content, level, links, mtime, and crossLinks (notes/tasks linking to this node).',
      inputSchema: {
        nodeId: z.string().min(1).max(500).describe('Node ID from search results or get_toc, e.g. "docs/auth.md" or "docs/auth.md::Overview"'),
      },
    },
    async ({ nodeId }) => {
      const node = mgr.getNode(nodeId);
      if (!node) {
        return { content: [{ type: 'text', text: 'Node not found' }], isError: true };
      }
      const { embedding: _embedding, fileEmbedding: _fe, pendingLinks: _pl, mtime: _mtime, ...rest } = node;
      return { content: [{ type: 'text', text: JSON.stringify(rest, null, 2) }] };
    },
  );
}
