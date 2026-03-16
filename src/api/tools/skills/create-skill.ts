import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'create_skill',
    {
      description:
        'Create a new skill (reusable recipe/procedure) in the skill graph. ' +
        'The skill is automatically embedded for semantic search. ' +
        'Returns the generated skillId (slug from title). ' +
        'Use link_skill to connect skills, or create_skill_link to link to docs/code/files/knowledge/tasks.',
      inputSchema: {
        title:        z.string().describe('Short title for the skill, e.g. "Deploy to staging"'),
        description:  z.string().describe('Full description of the skill (markdown)'),
        steps:        z.array(z.string()).optional().describe('Ordered steps to execute this skill (default [])'),
        triggers:     z.array(z.string()).optional().describe('Conditions or cues that suggest using this skill (default [])'),
        inputHints:   z.array(z.string()).optional().describe('Expected inputs or prerequisites (default [])'),
        filePatterns: z.array(z.string()).optional().describe('Glob patterns for files this skill applies to (default [])'),
        tags:         z.array(z.string()).optional().describe('Optional tags for filtering, e.g. ["deploy", "ci"]'),
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
