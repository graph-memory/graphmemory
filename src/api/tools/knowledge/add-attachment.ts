import fs from 'fs';
import path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';
import { MAX_UPLOAD_SIZE } from '@/lib/defaults';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'notes_add_attachment',
    {
      description:
        'Attach a file to a note. Provide the absolute path to a local file. ' +
        'The file is copied into the note directory (.notes/{noteId}/). ' +
        'Returns attachment metadata (filename, mimeType, size).',
      inputSchema: {
        noteId:   z.string().min(1).max(500).describe('ID of the note to attach the file to'),
        filePath: z.string().min(1).max(4096).describe('Absolute path to the file on disk'),
      },
    },
    async ({ noteId, filePath }) => {
      const resolved = path.resolve(filePath);

      const projectDir = mgr.projectDir;
      if (!projectDir) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'No project directory configured' }) }], isError: true };
      }

      let realResolved: string;
      try { realResolved = fs.realpathSync(resolved); } catch {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'File not found' }) }], isError: true };
      }
      let realProject: string;
      try { realProject = fs.realpathSync(path.resolve(projectDir)); } catch {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Project directory not found' }) }], isError: true };
      }
      const normalizedProject = realProject + path.sep;
      if (!realResolved.startsWith(normalizedProject) && realResolved !== realProject) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'File path must be within the project directory' }) }], isError: true };
      }

      let stat: fs.Stats;
      try { stat = fs.statSync(realResolved); } catch {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'File not found' }) }], isError: true };
      }
      if (!stat.isFile()) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Path is not a regular file' }) }], isError: true };
      }
      if (stat.size > MAX_UPLOAD_SIZE) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'File exceeds 50 MB limit' }) }], isError: true };
      }

      const data = fs.readFileSync(realResolved);
      const filename = path.basename(resolved);
      const meta = mgr.addAttachment(noteId, filename, data);

      if (!meta) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Note not found or no project dir' }) }], isError: true };
      }

      return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
    },
  );
}
