import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'skills_remove_attachment',
    {
      description:
        'Remove an attachment from a skill. The file is deleted from disk.',
      inputSchema: {
        skillId:  z.number().int().positive().describe('ID of the skill'),
        filename: z.string().min(1).max(255)
          .refine(s => !/[/\\]/.test(s), 'Filename must not contain path separators')
          .refine(s => !s.includes('..'), 'Filename must not contain ..')
          .refine(s => !s.includes('\0'), 'Filename must not contain null bytes')
          .describe('Filename of the attachment to remove'),
      },
    },
    async ({ skillId, filename }) => {
      const skill = mgr.getSkill(skillId);
      if (!skill) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Skill not found' }) }], isError: true };
      }
      mgr.removeAttachment('skills', skillId, skill.slug, filename);
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: filename }) }] };
    },
  );
}
