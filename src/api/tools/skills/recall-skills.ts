import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';
import { MAX_SEARCH_QUERY_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'recall_skills',
    {
      description:
        'Recall relevant skills for a given task context. Like search_skills but with lower ' +
        'minScore default (0.3) for higher recall. Use at the start of a task to find applicable recipes.',
      inputSchema: {
        context:  z.string().max(MAX_SEARCH_QUERY_LEN).describe('Description of the current task or context to match skills against'),
        topK:     z.number().min(1).max(500).optional().describe('How many top similar skills to use as seeds (default 5)'),
        minScore: z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1 (default 0.3)'),
      },
    },
    async ({ context, topK, minScore }) => {
      const results = await mgr.searchSkills(context, { topK, minScore: minScore ?? 0.3 });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
