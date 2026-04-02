import fs from 'fs';
import path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import { MAX_UPLOAD_SIZE } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_add_attachment',
    {
      description:
        'Attach a file to a task. Provide the absolute path to a local file. ' +
        'The file is copied into the task directory (.tasks/{slug}/). ' +
        'Returns attachment metadata (filename, mimeType, size).',
      inputSchema: {
        taskId:   z.number().int().positive().describe('Task ID to attach the file to'),
        filePath: z.string().min(1).max(4096).describe('Absolute path to the file on disk'),
      },
    },
    async ({ taskId, filePath }) => {
      const task = mgr.getTask(taskId);
      if (!task) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Task not found' }) }], isError: true };
      }

      const resolved = path.resolve(filePath);
      const projectDir = mgr.projectDir;

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
      const meta = mgr.addAttachment('tasks', taskId, task.slug, filename, data);

      return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
    },
  );
}
