import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';
import { VersionConflictError } from '@/graphs/manager-types';
import {
  MAX_TITLE_LEN, MAX_DESCRIPTION_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT,
  MAX_SKILL_STEP_LEN, MAX_SKILL_STEPS_COUNT,
  MAX_SKILL_TRIGGER_LEN, MAX_SKILL_TRIGGERS_COUNT,
} from '@/lib/defaults';

export function register(server: McpServer, mgr: SkillGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'skills_update',
    {
      description:
        'Update an existing skill. Only provided fields are changed. ' +
        'Re-embeds automatically when title or description changes. ' +
        'Pass expectedVersion to enable optimistic locking.',
      inputSchema: {
        skillId:         z.string().min(1).max(500).describe('Skill ID to update'),
        title:           z.string().max(MAX_TITLE_LEN).optional().describe('New title'),
        description:     z.string().max(MAX_DESCRIPTION_LEN).optional().describe('New description'),
        steps:           z.array(z.string().max(MAX_SKILL_STEP_LEN)).max(MAX_SKILL_STEPS_COUNT).optional().describe('Replace steps array'),
        triggers:        z.array(z.string().max(MAX_SKILL_TRIGGER_LEN)).max(MAX_SKILL_TRIGGERS_COUNT).optional().describe('Replace triggers array'),
        inputHints:      z.array(z.string().max(500)).max(100).optional().describe('Replace inputHints array'),
        filePatterns:    z.array(z.string().max(500)).max(100).optional().describe('Replace filePatterns array'),
        tags:            z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('Replace tags array'),
        source:          z.enum(['user', 'learned']).optional().describe('New source: "user" or "learned"'),
        confidence:      z.number().min(0).max(1).optional().describe('New confidence score 0–1'),
        expectedVersion: z.number().int().positive().optional().describe('Current version for optimistic locking — request fails with version_conflict if the skill has been updated since'),
      },
    },
    async ({ skillId, title, description, steps, triggers, inputHints, filePatterns, tags, source, confidence, expectedVersion }) => {
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

      const author = resolveAuthor();
      try {
        const updated = await mgr.updateSkill(skillId, patch, expectedVersion, author);
        if (!updated) {
          return { content: [{ type: 'text', text: 'Skill not found' }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ skillId, updated: true }, null, 2) }] };
      } catch (err) {
        if (err instanceof VersionConflictError) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'version_conflict', current: err.current, expected: err.expected }) }], isError: true };
        }
        throw err;
      }
    },
  );
}
