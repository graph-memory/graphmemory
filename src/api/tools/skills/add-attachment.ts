import fs from 'fs';
import path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'add_skill_attachment',
    {
      description:
        'Attach a file to a skill. Provide the absolute path to a local file. ' +
        'The file is copied into the skill directory (.skills/{skillId}/). ' +
        'Returns attachment metadata (filename, mimeType, size).',
      inputSchema: {
        skillId:  z.string().describe('ID of the skill to attach the file to'),
        filePath: z.string().describe('Absolute path to the file on disk'),
      },
    },
    async ({ skillId, filePath }) => {
      if (!fs.existsSync(filePath)) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'File not found' }) }], isError: true };
      }

      const data = fs.readFileSync(filePath);
      const filename = path.basename(filePath);
      const meta = mgr.addAttachment(skillId, filename, data);

      if (!meta) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Skill not found or no project dir' }) }], isError: true };
      }

      return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
    },
  );
}
