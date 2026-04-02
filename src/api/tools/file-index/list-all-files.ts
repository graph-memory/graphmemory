import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FilesStore } from '@/store/types';

type EmbedQuery = (text: string) => Promise<number[]>;
interface FilesToolDeps { files: FilesStore; embedQuery: EmbedQuery; }

export function register(server: McpServer, deps: FilesToolDeps): void {
  server.registerTool(
    'files_list',
    {
      description:
        'List all indexed project files and directories with optional filters. ' +
        'When directory is set, returns immediate children (files + subdirectories) — use this to browse the project tree. ' +
        'Without directory, returns all files matching filters (no directories in flat listing). ' +
        'Returns an array of { filePath, kind, fileName, extension, language, size }. ' +
        'Use search_all_files for semantic search or get_file_info for detailed metadata on a specific path.',
      inputSchema: {
        directory: z.string().max(4096).optional()
          .describe('List immediate children of this directory (e.g. ".", "src/lib"). Default: lists all files'),
        extension: z.string().max(100).optional()
          .describe('Filter by extension (e.g. ".ts", ".md", ".png")'),
        filter: z.string().max(500).optional()
          .describe('Substring filter on file path (case-insensitive)'),
        limit: z.number().int().min(1).max(1000).optional().default(50)
          .describe('Max results (default 50)'),
        offset: z.number().int().min(0).max(100_000).optional()
          .describe('Offset for pagination (default 0)'),
      },
    },
    async ({ directory, extension, filter, limit, offset }) => {
      const { results, total } = deps.files.listFiles({ directory, extension, filter, limit, offset });
      const output = results.map(({ mimeType: _, mtime: _m, id: _id, ...r }) => r);
      return { content: [{ type: 'text', text: JSON.stringify({ results: output, total }, null, 2) }] };
    },
  );
}
