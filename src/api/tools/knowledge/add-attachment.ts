import fs from 'fs';
import path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'add_note_attachment',
    {
      description:
        'Attach a file to a note. Provide the absolute path to a local file. ' +
        'The file is copied into the note directory (.notes/{noteId}/). ' +
        'Returns attachment metadata (filename, mimeType, size).',
      inputSchema: {
        noteId:   z.string().describe('ID of the note to attach the file to'),
        filePath: z.string().describe('Absolute path to the file on disk'),
      },
    },
    async ({ noteId, filePath }) => {
      if (!fs.existsSync(filePath)) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'File not found' }) }], isError: true };
      }

      const data = fs.readFileSync(filePath);
      const filename = path.basename(filePath);
      const meta = mgr.addAttachment(noteId, filename, data);

      if (!meta) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Note not found or no project dir' }) }], isError: true };
      }

      return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
    },
  );
}
