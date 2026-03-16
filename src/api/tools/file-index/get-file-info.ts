import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FileIndexGraphManager } from '@/graphs/file-index';

export function register(server: McpServer, mgr: FileIndexGraphManager): void {
  server.registerTool(
    'get_file_info',
    {
      description:
        'Get full metadata for a specific file or directory by path. ' +
        'For files: returns filePath, kind, fileName, directory, extension, language, mimeType, size, mtime, and crossLinks (notes/tasks linking to this file). ' +
        'For directories: returns filePath, kind, fileName, directory, fileCount, size (total of direct children). ' +
        'Use "." for the project root.',
      inputSchema: {
        filePath: z.string().describe('Relative file or directory path (e.g. "src/lib/config.ts" or "src/lib")'),
      },
    },
    async ({ filePath }) => {
      const info = mgr.getFileInfo(filePath);
      if (!info) {
        return { content: [{ type: 'text', text: `File or directory not found: ${filePath}` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
    },
  );
}
