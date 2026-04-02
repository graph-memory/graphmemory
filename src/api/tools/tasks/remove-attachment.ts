import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_remove_attachment',
    {
      description:
        'Remove an attachment from a task. The file is deleted from disk.',
      inputSchema: {
        taskId:   z.number().int().positive().describe('Task ID'),
        filename: z.string().min(1).max(255)
          .refine(s => !/[/\\]/.test(s), 'Filename must not contain path separators')
          .refine(s => !s.includes('..'), 'Filename must not contain ..')
          .refine(s => !s.includes('\0'), 'Filename must not contain null bytes')
          .describe('Filename of the attachment to remove'),
      },
    },
    async ({ taskId, filename }) => {
      const task = mgr.getTask(taskId);
      if (!task) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Task not found' }) }], isError: true };
      }
      mgr.removeAttachment('tasks', taskId, task.slug, filename);
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: filename }) }] };
    },
  );
}
