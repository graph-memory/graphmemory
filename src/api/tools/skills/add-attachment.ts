import fs from 'fs';
import path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';
import { MAX_UPLOAD_SIZE } from '@/lib/defaults';

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
      const resolved = path.resolve(filePath);

      const projectDir = mgr.projectDir;
      if (projectDir) {
        const normalizedProject = path.resolve(projectDir) + path.sep;
        if (!resolved.startsWith(normalizedProject) && resolved !== path.resolve(projectDir)) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'File path must be within the project directory' }) }], isError: true };
        }
      }

      let stat: fs.Stats;
      try { stat = fs.statSync(resolved); } catch {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'File not found' }) }], isError: true };
      }
      if (!stat.isFile()) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Path is not a regular file' }) }], isError: true };
      }
      if (stat.size > MAX_UPLOAD_SIZE) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'File exceeds 50 MB limit' }) }], isError: true };
      }

      const data = fs.readFileSync(resolved);
      const filename = path.basename(resolved);
      const meta = mgr.addAttachment(skillId, filename, data);

      if (!meta) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Skill not found or no project dir' }) }], isError: true };
      }

      return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] };
    },
  );
}
