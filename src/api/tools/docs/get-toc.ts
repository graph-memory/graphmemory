import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocGraphManager } from '@/graphs/docs';

export function register(server: McpServer, mgr: DocGraphManager): void {
  server.registerTool(
    'get_toc',
    {
      description:
        'Return the table of contents (headings hierarchy) for a specific file. ' +
        'Use this to understand the structure of a file before deciding which sections to read. ' +
        'Returns an array of { id, title, level } objects. ' +
        'The id field is a node ID you can pass directly to get_node to fetch full content.',
      inputSchema: {
        fileId: z.string().describe('File path relative to docs dir, e.g. "docs/auth.md"'),
      },
    },
    async ({ fileId }) => {
      const chunks = mgr.getFileChunks(fileId);
      if (chunks.length === 0) {
        return { content: [{ type: 'text', text: `File not found: ${fileId}` }], isError: true };
      }
      const toc = chunks.map(c => ({ id: c.id, title: c.title, level: c.level }));
      return { content: [{ type: 'text', text: JSON.stringify(toc, null, 2) }] };
    },
  );
}
