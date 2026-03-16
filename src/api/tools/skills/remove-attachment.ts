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
        skillId:  z.string().describe('ID of the skill'),
        filename: z.string().describe('Filename of the attachment to remove'),
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
