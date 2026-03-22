import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CodeGraphManager } from '@/graphs/code';

export function register(server: McpServer, mgr: CodeGraphManager): void {
  server.registerTool(
    'list_files',
    {
      description:
        'List indexed source files in the code graph. ' +
        'Optionally filter by file name substring (case-insensitive) and limit results. ' +
        'Returns an array of { fileId, symbolCount }. ' +
        'Pass a fileId to get_file_symbols to see all its declarations.',
      inputSchema: {
        filter: z.string().max(500).optional().describe(
          'Case-insensitive substring to match against file paths, e.g. "graph" or "src/lib"',
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
