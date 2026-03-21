import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SkillGraphManager } from '@/graphs/skill';

export function register(server: McpServer, mgr: SkillGraphManager): void {
  server.registerTool(
    'search_skills',
    {
      description:
        'Semantic search over the skill graph. ' +
        'Supports three modes: hybrid (default, BM25 + vector), vector, keyword. ' +
        'Finds the most relevant skills, then expands results ' +
        'by traversing relations between skills (graph walk). ' +
        'Returns an array sorted by relevance score (0–1), each with: ' +
        'id, title, description, tags, source, confidence, usageCount, score.',
      inputSchema: {
        query:      z.string().describe('Natural language search query'),
        topK:       z.number().min(1).max(500).optional().describe('How many top similar skills to use as seeds (default 5)'),
        bfsDepth:   z.number().min(0).max(10).optional().describe('How many hops to follow relations from each seed (default 1; 0 = no expansion)'),
        maxResults: z.number().min(1).max(500).optional().describe('Maximum number of results to return (default 20)'),
        minScore:   z.number().min(0).max(1).optional().describe('Minimum relevance score 0–1 (default 0.5)'),
        bfsDecay:   z.number().min(0).max(1).optional().describe('Score multiplier per hop (default 0.8)'),
        searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional().describe('Search mode: hybrid (default, BM25 + vector), vector (embedding only), keyword (BM25 only)'),
      },
    },
    async ({ query, topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode }) => {
      const results = await mgr.searchSkills(query, { topK, bfsDepth, maxResults, minScore, bfsDecay, searchMode });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
