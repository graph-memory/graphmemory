import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'remove_skill_attachment',
    {
      description:
        'Remove an attachment from a skill. The file is deleted from disk.',
      inputSchema: {
        skillId:  z.string().max(500).describe('ID of the skill'),
        filename: z.string().min(1).max(255)
          .refine(s => !/[/\\]/.test(s), 'Filename must not contain path separators')
          .refine(s => !s.includes('..'), 'Filename must not contain ..')
          .refine(s => !s.includes('\0'), 'Filename must not contain null bytes')
          .describe('Filename of the attachment to remove'),
      },
    },
    async ({ skillId, filename }) => {
      const ok = mgr.removeAttachment(skillId, filename);
      if (!ok) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Attachment not found' }) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: filename }) }] };
    },
  );
}
