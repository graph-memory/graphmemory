import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DocGraphManager } from '@/graphs/docs';

export function register(server: McpServer, mgr: DocGraphManager): void {
  server.registerTool(
    'list_topics',
    {
      description:
        'List indexed documentation files. ' +
        'Optionally filter by file name substring (case-insensitive) and limit results. ' +
        'Returns an array of { fileId, title, chunks }. ' +
        'Pass a fileId to get_toc to see its structure, or to search to query it.',
      inputSchema: {
        filter: z.string().max(500).optional().describe(
          'Case-insensitive substring to match against file paths, e.g. "auth" or "api"',
        ),
        limit: z.number().max(1000).optional().describe(
          'Maximum number of results to return (default 20)',
        ),
      },
    },
    async ({ filter, limit }) => ({
      content: [{ type: 'text', text: JSON.stringify(mgr.listFiles(filter, limit), null, 2) }],
    }),
  );
}
