import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'update_skill',
    {
      description:
        'Update an existing skill. Only provided fields are changed. ' +
        'Re-embeds automatically when title or description changes.',
      inputSchema: {
        skillId:      z.string().describe('Skill ID to update'),
        title:        z.string().optional().describe('New title'),
        description:  z.string().optional().describe('New description'),
        steps:        z.array(z.string()).optional().describe('Replace steps array'),
        triggers:     z.array(z.string()).optional().describe('Replace triggers array'),
        inputHints:   z.array(z.string()).optional().describe('Replace inputHints array'),
        filePatterns: z.array(z.string()).optional().describe('Replace filePatterns array'),
        tags:         z.array(z.string()).optional().describe('Replace tags array'),
        source:       z.enum(['user', 'learned']).optional().describe('New source'),
        confidence:   z.number().min(0).max(1).optional().describe('New confidence score 0–1'),
      },
    },
    async ({ skillId, title, description, steps, triggers, inputHints, filePatterns, tags, source, confidence }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = description;
      if (steps !== undefined) patch.steps = steps;
      if (triggers !== undefined) patch.triggers = triggers;
      if (inputHints !== undefined) patch.inputHints = inputHints;
      if (filePatterns !== undefined) patch.filePatterns = filePatterns;
      if (tags !== undefined) patch.tags = tags;
      if (source !== undefined) patch.source = source;
      if (confidence !== undefined) patch.confidence = confidence;

      const updated = await mgr.updateSkill(skillId, patch);
      if (!updated) {
        return { content: [{ type: 'text', text: `Skill "${skillId}" not found.` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ skillId, updated: true }, null, 2) }] };
    },
  );
}
