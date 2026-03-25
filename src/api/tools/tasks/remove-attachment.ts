import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskGraphManager } from '@/graphs/task';

export function register(server: McpServer, mgr: TaskGraphManager): void {
  server.registerTool(
    'tasks_remove_attachment',
    {
      description:
        'Remove an attachment from a task. The file is deleted from disk.',
      inputSchema: {
        taskId:   z.string().min(1).max(500).describe('ID of the task'),
        filename: z.string().min(1).max(255)
          .refine(s => !/[/\\]/.test(s), 'Filename must not contain path separators')
          .refine(s => !s.includes('..'), 'Filename must not contain ..')
          .refine(s => !s.includes('\0'), 'Filename must not contain null bytes')
          .describe('Filename of the attachment to remove'),
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
