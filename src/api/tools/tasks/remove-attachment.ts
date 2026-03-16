import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'remove_task_attachment',
    {
      description:
        'Remove an attachment from a task. The file is deleted from disk.',
      inputSchema: {
        taskId:   z.string().describe('ID of the task'),
        filename: z.string().describe('Filename of the attachment to remove'),
      },
    },
    async ({ taskId, filename }) => {
      const ok = mgr.removeAttachment(taskId, filename);
      if (!ok) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Attachment not found' }) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: filename }) }] };
    },
  );
}
