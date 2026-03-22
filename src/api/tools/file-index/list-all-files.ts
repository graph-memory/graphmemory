import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FileIndexGraphManager } from '@/graphs/file-index';

export function register(server: McpServer, mgr: FileIndexGraphManager): void {
  server.registerTool(
    'list_all_files',
    {
      description:
        'List all indexed project files and directories with optional filters. ' +
        'When directory is set, returns immediate children (files + subdirectories) — use this to browse the project tree. ' +
        'Without directory, returns all files matching filters (no directories in flat listing). ' +
        'Returns an array of { filePath, kind, fileName, extension, language, mimeType, size, fileCount }. ' +
        'Use search_all_files for semantic search or get_file_info for detailed metadata on a specific path.',
      inputSchema: {
        directory: z.string().max(4096).optional()
          .describe('List immediate children of this directory (e.g. ".", "src/lib"). Default: lists all files'),
        extension: z.string().max(100).optional()
          .describe('Filter by extension (e.g. ".ts", ".md", ".png")'),
        language: z.string().max(100).optional()
          .describe('Filter by language (e.g. "typescript", "markdown", "json")'),
        filter: z.string().max(500).optional()
          .describe('Substring filter on file path (case-insensitive)'),
        limit: z.number().max(1000).optional().default(50)
          .describe('Max results (default 50)'),
      },
    },
    async ({ directory, extension, language, filter, limit }) => {
      const results = mgr.listAllFiles({ directory, extension, language, filter, limit });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
