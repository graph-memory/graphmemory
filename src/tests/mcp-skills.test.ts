import { createSkillGraph } from '@/graphs/skill-types';
import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import {
  setupMcpClient, createFakeEmbed, json,
  type McpTestContext,
} from '@/tests/helpers';
import type { SkillSource } from '@/graphs/skill-types';

// ---------------------------------------------------------------------------
// Types for result parsing
// ---------------------------------------------------------------------------

type CreateResult = { skillId: string };
type UpdateResult = { skillId: string; updated: boolean };
type DeleteResult = { skillId: string; deleted: boolean };
type BumpResult = { skillId: string; bumped: boolean };
type LinkResult = { fromId: string; toId: string; kind: string; created: boolean };
type CrossLinkResult = { skillId: string; targetId: string; targetGraph: string; kind: string; created: boolean };
type CrossDeleteResult = { skillId: string; targetId: string; targetGraph: string; deleted: boolean };

interface SkillResult {
  id: string;
  title: string;
  description: string;
  steps: string[];
  triggers: string[];
  inputHints: string[];
  filePatterns: string[];
  tags: string[];
  source: SkillSource;
  confidence: number;
  usageCount: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
  dependsOn: Array<{ id: string; title: string }>;
  dependedBy: Array<{ id: string; title: string }>;
  related: Array<{ id: string; title: string }>;
  variants: Array<{ id: string; title: string }>;
  crossLinks: Array<{ nodeId: string; targetGraph: string; kind: string; direction: string }>;
}

interface SkillListEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  source: SkillSource;
  confidence: number;
  usageCount: number;
}

interface SkillSearchHit {
  id: string;
  title: string;
  description: string;
  tags: string[];
  source: SkillSource;
  confidence: number;
  score: number;
}

type LinkedSkillResult = {
  skillId: string;
  title: string;
  kind: string;
  source: SkillSource;
  confidence: number;
  tags: string[];
};

// ---------------------------------------------------------------------------
// CRUD tests
// ---------------------------------------------------------------------------

describe('MCP Skill Tools', () => {

  describe('Skill CRUD tools', () => {
    const skillGraph = createSkillGraph();
    const knowledgeGraph = createKnowledgeGraph();
    const fakeEmbed = createFakeEmbed([
      ['endpoint', 0],
      ['auth', 1],
      ['test', 2],
      ['deploy', 3],
    ]);
    let ctx: McpTestContext;
    let call: McpTestContext['call'];

    beforeAll(async () => {
      ctx = await setupMcpClient({
        skillGraph,
        knowledgeGraph,
        embedFn: fakeEmbed,
      });
      call = ctx.call;
    });

    afterAll(async () => {
      await ctx.close();
    });

    // -- create_skill --

    it('create_skill returns skillId', async () => {
      const res = json<CreateResult>(await call('create_skill', {
        title: 'Add REST Endpoint',
        description: 'How to add a new REST endpoint to the API.',
        steps: ['Create route file', 'Add handler', 'Register in router'],
        triggers: ['new endpoint needed', 'API extension'],
        tags: ['api', 'endpoint'],
        source: 'user',
      }));
      expect(res.skillId).toBe('add-rest-endpoint');
    });

    it('create_skill with all optional fields', async () => {
      const res = json<CreateResult>(await call('create_skill', {
        title: 'Debug Auth Issues',
        description: 'Steps to debug authentication failures.',
        steps: ['Check tokens', 'Inspect headers', 'Verify middleware'],
        triggers: ['auth error', '401 response'],
        inputHints: ['error message', 'request logs'],
        filePatterns: ['src/auth/**'],
        tags: ['auth', 'debug'],
        source: 'learned',
        confidence: 0.8,
      }));
      expect(res.skillId).toBe('debug-auth-issues');
    });

    it('create_skill defaults to user source', async () => {
      const res = json<CreateResult>(await call('create_skill', {
        title: 'Run Test Suite',
        description: 'How to run the test suite end to end.',
        steps: ['npm test', 'Check coverage'],
        tags: ['test', 'ci'],
      }));
      expect(res.skillId).toBe('run-test-suite');
      const skill = json<SkillResult>(await call('get_skill', { skillId: 'run-test-suite' }));
      expect(skill.source).toBe('user');
      expect(skill.confidence).toBe(1);
    });

    // -- get_skill --

    it('get_skill returns full skill', async () => {
      const skill = json<SkillResult>(await call('get_skill', { skillId: 'add-rest-endpoint' }));
      expect(skill.title).toBe('Add REST Endpoint');
      expect(skill.description).toContain('REST endpoint');
      expect(skill.steps).toHaveLength(3);
      expect(skill.triggers).toHaveLength(2);
      expect(skill.tags).toEqual(['api', 'endpoint']);
      expect(skill.source).toBe('user');
      expect(skill.confidence).toBe(1);
      expect(skill.usageCount).toBe(0);
      expect(skill.lastUsedAt).toBeNull();
      expect(skill.dependsOn).toHaveLength(0);
    });

    it('get_skill returns error for missing', async () => {
      const res = await call('get_skill', { skillId: 'nonexistent' });
      expect(res.isError).toBe(true);
    });

    // -- update_skill --

    it('update_skill changes description and steps', async () => {
      const res = json<UpdateResult>(await call('update_skill', {
        skillId: 'add-rest-endpoint',
        description: 'Updated: Create a REST endpoint with validation.',
        steps: ['Create route file', 'Add Zod schema', 'Add handler', 'Register in router'],
      }));
      expect(res.updated).toBe(true);
    });

    it('update_skill verifies change', async () => {
      const skill = json<SkillResult>(await call('get_skill', { skillId: 'add-rest-endpoint' }));
      expect(skill.description).toContain('validation');
      expect(skill.steps).toHaveLength(4);
    });

    it('update_skill returns error for missing', async () => {
      const res = await call('update_skill', { skillId: 'nonexistent', description: 'x' });
      expect(res.isError).toBe(true);
    });

    // -- list_skills --

    it('list_skills returns all 3', async () => {
      const skills = json<SkillListEntry[]>(await call('list_skills'));
      expect(skills).toHaveLength(3);
    });

    it('list_skills filter by source', async () => {
      const skills = json<SkillListEntry[]>(await call('list_skills', { source: 'learned' }));
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('debug-auth-issues');
    });

    it('list_skills filter by tag', async () => {
      const skills = json<SkillListEntry[]>(await call('list_skills', { tag: 'auth' }));
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('debug-auth-issues');
    });

    it('list_skills substring filter', async () => {
      const skills = json<SkillListEntry[]>(await call('list_skills', { filter: 'rest' }));
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('add-rest-endpoint');
    });

    it('list_skills limit', async () => {
      const skills = json<SkillListEntry[]>(await call('list_skills', { limit: 1 }));
      expect(skills).toHaveLength(1);
    });

    // -- search_skills --

    it('search_skills finds by query (vector mode)', async () => {
      const hits = json<SkillSearchHit[]>(await call('search_skills', {
        query: 'endpoint',
        minScore: 0.5,
        searchMode: 'vector',
      }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe('add-rest-endpoint');
      expect(hits[0].score).toBeGreaterThan(0.5);
    });

    it('search_skills finds by query (keyword mode)', async () => {
      const hits = json<SkillSearchHit[]>(await call('search_skills', {
        query: 'REST endpoint validation',
        minScore: 0,
        searchMode: 'keyword',
      }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe('add-rest-endpoint');
    });

    // -- link_skill --

    it('link_skill creates depends_on between skills', async () => {
      const res = json<LinkResult>(await call('link_skill', {
        fromId: 'run-test-suite',
        toId: 'add-rest-endpoint',
        kind: 'depends_on',
      }));
      expect(res.created).toBe(true);
    });

    it('get_skill shows dependsOn and dependedBy', async () => {
      const skill = json<SkillResult>(await call('get_skill', { skillId: 'run-test-suite' }));
      expect(skill.dependsOn).toHaveLength(1);
      expect(skill.dependsOn[0].id).toBe('add-rest-endpoint');

      const target = json<SkillResult>(await call('get_skill', { skillId: 'add-rest-endpoint' }));
      expect(target.dependedBy).toHaveLength(1);
      expect(target.dependedBy[0].id).toBe('run-test-suite');
    });

    it('link_skill duplicate returns error', async () => {
      const res = await call('link_skill', {
        fromId: 'run-test-suite',
        toId: 'add-rest-endpoint',
        kind: 'depends_on',
      });
      expect(res.isError).toBe(true);
    });

    // -- bump_skill_usage --

    it('bump_skill_usage increments usageCount', async () => {
      const res = json<BumpResult>(await call('bump_skill_usage', { skillId: 'add-rest-endpoint' }));
      expect(res.bumped).toBe(true);

      const skill = json<SkillResult>(await call('get_skill', { skillId: 'add-rest-endpoint' }));
      expect(skill.usageCount).toBe(1);
      expect(skill.lastUsedAt).toBeGreaterThan(0);
    });

    it('bump_skill_usage increments again', async () => {
      await call('bump_skill_usage', { skillId: 'add-rest-endpoint' });
      const skill = json<SkillResult>(await call('get_skill', { skillId: 'add-rest-endpoint' }));
      expect(skill.usageCount).toBe(2);
    });

    it('bump_skill_usage returns error for missing', async () => {
      const res = await call('bump_skill_usage', { skillId: 'nonexistent' });
      expect(res.isError).toBe(true);
    });

    // -- recall_skills --

    it('recall_skills finds relevant skills', async () => {
      // recall_skills defaults to hybrid searchMode; with fakeEmbed the BM25 component
      // may push the fused score below minScore, so we set minScore low enough
      const hits = json<SkillSearchHit[]>(await call('recall_skills', {
        context: 'auth',
        minScore: 0.01,
      }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe('debug-auth-issues');
    });

    // -- create_skill_link (cross-graph to knowledge) --

    it('create_skill_link to knowledge note', async () => {
      // First create a knowledge note
      await call('create_note', { title: 'Auth Guide', content: 'How auth works.' });

      const res = json<CrossLinkResult>(await call('create_skill_link', {
        skillId: 'debug-auth-issues',
        targetId: 'auth-guide',
        targetGraph: 'knowledge',
        kind: 'references',
        projectId: 'test',
      }));
      expect(res.created).toBe(true);
    });

    it('create_skill_link duplicate returns error', async () => {
      const res = await call('create_skill_link', {
        skillId: 'debug-auth-issues',
        targetId: 'auth-guide',
        targetGraph: 'knowledge',
        kind: 'references',
        projectId: 'test',
      });
      expect(res.isError).toBe(true);
    });

    it('create_skill_link invalid target returns error', async () => {
      const res = await call('create_skill_link', {
        skillId: 'debug-auth-issues',
        targetId: 'nonexistent-note',
        targetGraph: 'knowledge',
        kind: 'references',
        projectId: 'test',
      });
      expect(res.isError).toBe(true);
    });

    // -- find_linked_skills --

    it('find_linked_skills finds skill linked to knowledge note', async () => {
      const results = json<LinkedSkillResult[]>(await call('find_linked_skills', {
        targetGraph: 'knowledge',
        targetNodeId: 'auth-guide',
        projectId: 'test',
      }));
      expect(results).toHaveLength(1);
      expect(results[0].skillId).toBe('debug-auth-issues');
      expect(results[0].kind).toBe('references');
    });

    it('find_linked_skills returns message for unlinked', async () => {
      const res = await call('find_linked_skills', {
        targetGraph: 'knowledge',
        targetNodeId: 'nonexistent',
        projectId: 'test',
      });
      expect(res.isError).toBeUndefined();
      const text = res.content[0].text!;
      expect(text).toContain('No skills linked');
    });

    it('find_linked_skills filters by kind', async () => {
      const res = await call('find_linked_skills', {
        targetGraph: 'knowledge',
        targetNodeId: 'auth-guide',
        kind: 'implements', // linked with 'references', not 'implements'
        projectId: 'test',
      });
      const text = res.content[0].text!;
      expect(text).toContain('No skills linked');
    });

    // -- delete_skill_link --

    it('delete_skill_link removes cross-graph link', async () => {
      const res = json<CrossDeleteResult>(await call('delete_skill_link', {
        skillId: 'debug-auth-issues',
        targetId: 'auth-guide',
        targetGraph: 'knowledge',
        projectId: 'test',
      }));
      expect(res.deleted).toBe(true);
    });

    it('after delete_skill_link, find_linked_skills returns empty', async () => {
      const res = await call('find_linked_skills', {
        targetGraph: 'knowledge',
        targetNodeId: 'auth-guide',
        projectId: 'test',
      });
      const text = res.content[0].text!;
      expect(text).toContain('No skills linked');
    });

    it('proxy cleaned up after delete_skill_link', async () => {
      expect(skillGraph.hasNode('@knowledge::auth-guide')).toBe(false);
    });

    // -- delete_skill --

    it('delete_skill removes skill', async () => {
      const res = json<DeleteResult>(await call('delete_skill', { skillId: 'run-test-suite' }));
      expect(res.deleted).toBe(true);
    });

    it('deleted skill no longer returned', async () => {
      const res = await call('get_skill', { skillId: 'run-test-suite' });
      expect(res.isError).toBe(true);
    });

    it('list_skills after delete returns 2', async () => {
      const skills = json<SkillListEntry[]>(await call('list_skills'));
      expect(skills).toHaveLength(2);
    });

    it('delete_skill returns error for missing', async () => {
      const res = await call('delete_skill', { skillId: 'nonexistent' });
      expect(res.isError).toBe(true);
    });

    // -- delete_skill cleans up cross-graph proxy --

    it('delete_skill cleans up remaining cross-graph proxy', async () => {
      // Create a cross-graph link first
      await call('create_skill_link', {
        skillId: 'debug-auth-issues',
        targetId: 'auth-guide',
        targetGraph: 'knowledge',
        kind: 'documents',
        projectId: 'test',
      });
      expect(skillGraph.hasNode('@knowledge::test::auth-guide')).toBe(true);

      // Delete the skill
      const del = json<DeleteResult>(await call('delete_skill', { skillId: 'debug-auth-issues' }));
      expect(del.deleted).toBe(true);

      // Proxy should be cleaned up
      expect(skillGraph.hasNode('@knowledge::test::auth-guide')).toBe(false);
    });
  });
});
