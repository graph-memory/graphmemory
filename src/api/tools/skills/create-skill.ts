import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';
import {
  MAX_TITLE_LEN, MAX_DESCRIPTION_LEN, MAX_TAG_LEN, MAX_TAGS_COUNT,
  MAX_SKILL_STEP_LEN, MAX_SKILL_STEPS_COUNT,
  MAX_SKILL_TRIGGER_LEN, MAX_SKILL_TRIGGERS_COUNT,
} from '@/lib/defaults';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'skills_create',
    {
      description:
        'Create a new skill (reusable recipe/procedure) in the skill graph. ' +
        'The skill is automatically embedded for semantic search. ' +
        'Returns the generated skillId (slug from title). ' +
        'Use link_skill to connect skills, or create_skill_link to link to docs/code/files/knowledge/tasks.',
      inputSchema: {
        title:        z.string().max(MAX_TITLE_LEN).describe('Short title for the skill, e.g. "Deploy to staging"'),
        description:  z.string().max(MAX_DESCRIPTION_LEN).describe('Full description of the skill (markdown)'),
        steps:        z.array(z.string().max(MAX_SKILL_STEP_LEN)).max(MAX_SKILL_STEPS_COUNT).optional().describe('Ordered steps to execute this skill (default [])'),
        triggers:     z.array(z.string().max(MAX_SKILL_TRIGGER_LEN)).max(MAX_SKILL_TRIGGERS_COUNT).optional().describe('Conditions or cues that suggest using this skill (default [])'),
        inputHints:   z.array(z.string().max(500)).max(100).optional().describe('Expected inputs or prerequisites (default [])'),
        filePatterns: z.array(z.string().max(500)).max(100).optional().describe('Glob patterns for files this skill applies to (default [])'),
        tags:         z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().describe('Optional tags for filtering, e.g. ["deploy", "ci"]'),
        source:       z.enum(['user', 'learned']).optional().describe('How this skill was created (default "user")'),
        confidence:   z.number().min(0).max(1).optional().describe('Confidence score 0–1 (default 1)'),
      },
    },
    async ({ title, description, steps, triggers, inputHints, filePatterns, tags, source, confidence }) => {
      const skillId = await mgr.createSkill(
        title, description,
        steps ?? [], triggers ?? [], inputHints ?? [], filePatterns ?? [],
        tags ?? [], source ?? 'user', confidence ?? 1,
      );
      return { content: [{ type: 'text', text: JSON.stringify({ skillId }, null, 2) }] };
    },
  );
}
