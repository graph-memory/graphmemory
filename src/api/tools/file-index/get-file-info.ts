import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FilesStore } from '@/store/types';

type EmbedQuery = (text: string) => Promise<number[]>;
interface FilesToolDeps { files: FilesStore; embedQuery: EmbedQuery; }

export function register(server: McpServer, deps: FilesToolDeps): void {
  server.registerTool(
    'files_get_info',
    {
      description:
        'Get full metadata for a specific file or directory by path. ' +
        'For files: returns filePath, kind, fileName, directory, extension, language, size, mtime. ' +
        'For directories: returns filePath, kind, fileName, directory, size (total of direct children). ' +
        'Use "." for the project root.',
      inputSchema: {
        filePath: z.string().min(1).max(4096).describe('Relative file or directory path (e.g. "src/lib/config.ts" or "src/lib")'),
      },
    },
    async ({ filePath }) => {
      const info = deps.files.getFileInfo(filePath);
      if (!info) {
        return { content: [{ type: 'text', text: 'File or directory not found' }], isError: true };
      }
      const { mimeType: _, ...rest } = info;
      return { content: [{ type: 'text', text: JSON.stringify(rest, null, 2) }] };
    },
  );
}
