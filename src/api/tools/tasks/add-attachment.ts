import fs from 'fs';
import path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'add_task_attachment',
    {
      description:
        'Attach a file to a task. Provide the absolute path to a local file. ' +
        'The file is copied into the task directory (.tasks/{taskId}/). ' +
        'Returns attachment metadata (filename, mimeType, size).',
      inputSchema: {
        taskId:   z.string().describe('ID of the task to attach the file to'),
        filePath: z.string().describe('Absolute path to the file on disk'),
      },
    },
    async ({ taskId, filePath }) => {
      if (!fs.existsSync(filePath)) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'File not found' }) }], isError: true };
      }

      const data = fs.readFileSync(filePath);
      const filename = path.basename(filePath);
      const meta = mgr.addAttachment(taskId, filename, data);

      if (!meta) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Task not found or no project dir' }) }], isError: true };
      }

      return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
    },
  );
}
