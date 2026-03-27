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

    // Store dynamic IDs from creation calls
    let addRestEndpointId: string;
    let debugAuthIssuesId: string;
    let runTestSuiteId: string;
    let authGuideNoteId: string;

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

    // -- skills_create --

    it('skills_create returns skillId', async () => {
      const res = json<CreateResult>(await call('skills_create', {
        title: 'Add REST Endpoint',
        description: 'How to add a new REST endpoint to the API.',
        steps: ['Create route file', 'Add handler', 'Register in router'],
        triggers: ['new endpoint needed', 'API extension'],
        tags: ['api', 'endpoint'],
        source: 'user',
      }));
      expect(res.skillId).toMatch(/^[0-9a-f]{8}-/);
      addRestEndpointId = res.skillId;
    });

    it('skills_create with all optional fields', async () => {
      const res = json<CreateResult>(await call('skills_create', {
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
      expect(res.skillId).toMatch(/^[0-9a-f]{8}-/);
      debugAuthIssuesId = res.skillId;
    });

    it('skills_create defaults to user source', async () => {
      const res = json<CreateResult>(await call('skills_create', {
        title: 'Run Test Suite',
        description: 'How to run the test suite end to end.',
        steps: ['npm test', 'Check coverage'],
        tags: ['test', 'ci'],
      }));
      expect(res.skillId).toMatch(/^[0-9a-f]{8}-/);
      runTestSuiteId = res.skillId;
      const skill = json<SkillResult>(await call('skills_get', { skillId: runTestSuiteId }));
      expect(skill.source).toBe('user');
      expect(skill.confidence).toBe(1);
    });

    // -- skills_get --

    it('skills_get returns full skill', async () => {
      const skill = json<SkillResult>(await call('skills_get', { skillId: addRestEndpointId }));
      expect(skill.title).toBe('Add REST Endpoint');
      expect(skill.description).toContain('REST endpoint');
      expect(skill.steps).toHaveLength(3);
      expect(skill.triggers).toHaveLength(2);
      expect(skill.tags).toEqual(['api', 'endpoint']);
      expect(skill.source).toBe('user');
      expect(skill.confidence).toBe(1);
      expect(skill.usageCount).toBe(0);
      expect(skill.lastUsedAt).toBeUndefined();
      expect(skill.dependsOn).toBeUndefined();
    });

    it('skills_get returns error for missing', async () => {
      const res = await call('skills_get', { skillId: 'nonexistent' });
      expect(res.isError).toBe(true);
    });

    // -- skills_update --

    it('skills_update changes description and steps', async () => {
      const res = json<UpdateResult>(await call('skills_update', {
        skillId: addRestEndpointId,
        description: 'Updated: Create a REST endpoint with validation.',
        steps: ['Create route file', 'Add Zod schema', 'Add handler', 'Register in router'],
      }));
      expect(res.updated).toBe(true);
    });

    it('skills_update verifies change', async () => {
      const skill = json<SkillResult>(await call('skills_get', { skillId: addRestEndpointId }));
      expect(skill.description).toContain('validation');
      expect(skill.steps).toHaveLength(4);
    });

    it('skills_update returns error for missing', async () => {
      const res = await call('skills_update', { skillId: 'nonexistent', description: 'x' });
      expect(res.isError).toBe(true);
    });

    // -- skills_list --

    it('skills_list returns all 3', async () => {
      const skills = json<SkillListEntry[]>(await call('skills_list'));
      expect(skills).toHaveLength(3);
    });

    it('skills_list filter by source', async () => {
      const skills = json<SkillListEntry[]>(await call('skills_list', { source: 'learned' }));
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe(debugAuthIssuesId);
    });

    it('skills_list filter by tag', async () => {
      const skills = json<SkillListEntry[]>(await call('skills_list', { tag: 'auth' }));
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe(debugAuthIssuesId);
    });

    it('skills_list substring filter', async () => {
      const skills = json<SkillListEntry[]>(await call('skills_list', { filter: 'rest' }));
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe(addRestEndpointId);
    });

    it('skills_list limit', async () => {
      const skills = json<SkillListEntry[]>(await call('skills_list', { limit: 1 }));
      expect(skills).toHaveLength(1);
    });

    // -- skills_search --

    it('skills_search finds by query (vector mode)', async () => {
      const hits = json<SkillSearchHit[]>(await call('skills_search', {
        query: 'endpoint',
        minScore: 0.5,
        searchMode: 'vector',
      }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe(addRestEndpointId);
      expect(hits[0].score).toBeGreaterThan(0.5);
    });

    it('skills_search finds by query (keyword mode)', async () => {
      const hits = json<SkillSearchHit[]>(await call('skills_search', {
        query: 'REST endpoint validation',
        minScore: 0,
        searchMode: 'keyword',
      }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe(addRestEndpointId);
    });

    // -- skills_link --

    it('skills_link creates depends_on between skills', async () => {
      const res = json<LinkResult>(await call('skills_link', {
        fromId: runTestSuiteId,
        toId: addRestEndpointId,
        kind: 'depends_on',
      }));
      expect(res.created).toBe(true);
    });

    it('skills_get shows dependsOn and dependedBy', async () => {
      const skill = json<SkillResult>(await call('skills_get', { skillId: runTestSuiteId }));
      expect(skill.dependsOn).toHaveLength(1);
      expect(skill.dependsOn[0].id).toBe(addRestEndpointId);

      const target = json<SkillResult>(await call('skills_get', { skillId: addRestEndpointId }));
      expect(target.dependedBy).toHaveLength(1);
      expect(target.dependedBy[0].id).toBe(runTestSuiteId);
    });

    it('skills_link duplicate returns error', async () => {
      const res = await call('skills_link', {
        fromId: runTestSuiteId,
        toId: addRestEndpointId,
        kind: 'depends_on',
      });
      expect(res.isError).toBe(true);
    });

    // -- skills_bump_usage --

    it('skills_bump_usage increments usageCount', async () => {
      const res = json<BumpResult>(await call('skills_bump_usage', { skillId: addRestEndpointId }));
      expect(res.bumped).toBe(true);

      const skill = json<SkillResult>(await call('skills_get', { skillId: addRestEndpointId }));
      expect(skill.usageCount).toBe(1);
      expect(skill.lastUsedAt).toBeGreaterThan(0);
    });

    it('skills_bump_usage increments again', async () => {
      await call('skills_bump_usage', { skillId: addRestEndpointId });
      const skill = json<SkillResult>(await call('skills_get', { skillId: addRestEndpointId }));
      expect(skill.usageCount).toBe(2);
    });

    it('skills_bump_usage returns error for missing', async () => {
      const res = await call('skills_bump_usage', { skillId: 'nonexistent' });
      expect(res.isError).toBe(true);
    });

    // -- skills_recall --

    it('skills_recall finds relevant skills', async () => {
      // skills_recall defaults to hybrid searchMode; with fakeEmbed the BM25 component
      // may push the fused score below minScore, so we set minScore low enough
      const hits = json<SkillSearchHit[]>(await call('skills_recall', {
        context: 'auth',
        minScore: 0.01,
      }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe(debugAuthIssuesId);
    });

    // -- skills_create_link (cross-graph to knowledge) --

    it('skills_create_link to knowledge note', async () => {
      // First create a knowledge note
      const noteRes = json<{ noteId: string }>(await call('notes_create', { title: 'Auth Guide', content: 'How auth works.' }));
      authGuideNoteId = noteRes.noteId;

      const res = json<CrossLinkResult>(await call('skills_create_link', {
        skillId: debugAuthIssuesId,
        targetId: authGuideNoteId,
        targetGraph: 'knowledge',
        kind: 'references',
        projectId: 'test',
      }));
      expect(res.created).toBe(true);
    });

    it('skills_create_link duplicate returns error', async () => {
      const res = await call('skills_create_link', {
        skillId: debugAuthIssuesId,
        targetId: authGuideNoteId,
        targetGraph: 'knowledge',
        kind: 'references',
        projectId: 'test',
      });
      expect(res.isError).toBe(true);
    });

    it('skills_create_link invalid target returns error', async () => {
      const res = await call('skills_create_link', {
        skillId: debugAuthIssuesId,
        targetId: 'nonexistent-note',
        targetGraph: 'knowledge',
        kind: 'references',
        projectId: 'test',
      });
      expect(res.isError).toBe(true);
    });

    // -- skills_find_linked --

    it('skills_find_linked finds skill linked to knowledge note', async () => {
      const results = json<LinkedSkillResult[]>(await call('skills_find_linked', {
        targetGraph: 'knowledge',
        targetId: authGuideNoteId,
        projectId: 'test',
      }));
      expect(results).toHaveLength(1);
      expect(results[0].skillId).toBe(debugAuthIssuesId);
      expect(results[0].kind).toBe('references');
    });

    it('skills_find_linked returns message for unlinked', async () => {
      const res = await call('skills_find_linked', {
        targetGraph: 'knowledge',
        targetId: 'nonexistent',
        projectId: 'test',
      });
      expect(res.isError).toBeUndefined();
      const text = res.content[0].text!;
      expect(text).toContain('No skills linked');
    });

    it('skills_find_linked filters by kind', async () => {
      const res = await call('skills_find_linked', {
        targetGraph: 'knowledge',
        targetId: authGuideNoteId,
        kind: 'implements', // linked with 'references', not 'implements'
        projectId: 'test',
      });
      const text = res.content[0].text!;
      expect(text).toContain('No skills linked');
    });

    // -- skills_delete_link --

    it('skills_delete_link removes cross-graph link', async () => {
      const res = json<CrossDeleteResult>(await call('skills_delete_link', {
        skillId: debugAuthIssuesId,
        targetId: authGuideNoteId,
        targetGraph: 'knowledge',
        projectId: 'test',
      }));
      expect(res.deleted).toBe(true);
    });

    it('after skills_delete_link, skills_find_linked returns empty', async () => {
      const res = await call('skills_find_linked', {
        targetGraph: 'knowledge',
        targetId: authGuideNoteId,
        projectId: 'test',
      });
      const text = res.content[0].text!;
      expect(text).toContain('No skills linked');
    });

    it('proxy cleaned up after skills_delete_link', async () => {
      expect(skillGraph.hasNode(`@knowledge::${authGuideNoteId}`)).toBe(false);
    });

    // -- skills_delete --

    it('skills_delete removes skill', async () => {
      const res = json<DeleteResult>(await call('skills_delete', { skillId: runTestSuiteId }));
      expect(res.deleted).toBe(true);
    });

    it('deleted skill no longer returned', async () => {
      const res = await call('skills_get', { skillId: runTestSuiteId });
      expect(res.isError).toBe(true);
    });

    it('skills_list after delete returns 2', async () => {
      const skills = json<SkillListEntry[]>(await call('skills_list'));
      expect(skills).toHaveLength(2);
    });

    it('skills_delete returns error for missing', async () => {
      const res = await call('skills_delete', { skillId: 'nonexistent' });
      expect(res.isError).toBe(true);
    });

    // -- skills_delete cleans up cross-graph proxy --

    it('skills_delete cleans up remaining cross-graph proxy', async () => {
      // Create a cross-graph link first
      await call('skills_create_link', {
        skillId: debugAuthIssuesId,
        targetId: authGuideNoteId,
        targetGraph: 'knowledge',
        kind: 'documents',
        projectId: 'test',
      });
      expect(skillGraph.hasNode(`@knowledge::test::${authGuideNoteId}`)).toBe(true);

      // Delete the skill
      const del = json<DeleteResult>(await call('skills_delete', { skillId: debugAuthIssuesId }));
      expect(del.deleted).toBe(true);

      // Proxy should be cleaned up
      expect(skillGraph.hasNode(`@knowledge::test::${authGuideNoteId}`)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Reverse-side deletion: delete skill↔knowledge link from the other side
// ---------------------------------------------------------------------------

describe('Reverse-side cross-graph link deletion (skills)', () => {
  const rSkillGraph = createSkillGraph();
  const rKnowledgeGraph = createKnowledgeGraph();
  const rFakeEmbed = createFakeEmbed([['skill', 10], ['note', 11]]);
  let rCtx: McpTestContext;
  let rCall: McpTestContext['call'];

  let revSkillId: string;
  let revNoteId: string;

  beforeAll(async () => {
    rCtx = await setupMcpClient({
      knowledgeGraph: rKnowledgeGraph,
      skillGraph: rSkillGraph,
      embedFn: rFakeEmbed,
    });
    rCall = rCtx.call;
  });

  afterAll(async () => {
    await rCtx.close();
  });

  it('skill→knowledge link can be deleted from knowledge (note) side', async () => {
    // Create skill and note
    const skillRes = json<CreateResult>(await rCall('skills_create', { title: 'Rev Skill', description: 'A skill for reverse test', source: 'user', confidence: 0.9 }));
    revSkillId = skillRes.skillId;
    const noteRes = json<{ noteId: string }>(await rCall('notes_create', { title: 'Rev Note', content: 'note for skill reverse test' }));
    revNoteId = noteRes.noteId;

    // Create link from skill to knowledge
    const link = json<CrossLinkResult>(await rCall('skills_create_link', {
      skillId: revSkillId,
      targetId: revNoteId,
      targetGraph: 'knowledge',
      kind: 'documents',
      projectId: 'test',
    }));
    expect(link.created).toBe(true);

    // Verify mirror proxy exists in KnowledgeGraph (project-scoped)
    expect(rKnowledgeGraph.hasNode(`@skills::test::${revSkillId}`)).toBe(true);

    // Delete from knowledge side
    const del = json<{ deleted: boolean }>(await rCall('notes_delete_link', {
      fromId: revNoteId,
      toId: revSkillId,
      targetGraph: 'skills',
      projectId: 'test',
    }));
    expect(del.deleted).toBe(true);
  });

  it('after knowledge-side deletion, mirror proxy is cleaned up in KnowledgeGraph', () => {
    expect(rKnowledgeGraph.hasNode(`@skills::test::${revSkillId}`)).toBe(false);
    expect(rKnowledgeGraph.hasNode(`@skills::${revSkillId}`)).toBe(false);
  });

  it('after knowledge-side deletion, original proxy in SkillGraph is left (no bidirectional mirror from knowledge→skill)', () => {
    // Knowledge→skill doesn't create a mirror in SkillGraph, so the original edge remains
    // The skill-side proxy is still there because only the knowledge-side mirror was removed
    expect(rSkillGraph.hasNode(`@knowledge::test::${revNoteId}`)).toBe(true);
  });

  it('skill-side can then clean up remaining cross-graph link', async () => {
    const del = json<CrossDeleteResult>(await rCall('skills_delete_link', {
      skillId: revSkillId,
      targetId: revNoteId,
      targetGraph: 'knowledge',
      projectId: 'test',
    }));
    expect(del.deleted).toBe(true);
    expect(rSkillGraph.hasNode(`@knowledge::test::${revNoteId}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Same-graph skill-to-skill links via skills_create_link / skills_delete_link
// ---------------------------------------------------------------------------

describe('Same-graph skill links via skills_create_link/skills_delete_link', () => {
  const sgSkillGraph = createSkillGraph();
  const sgFakeEmbed = createFakeEmbed([['skill', 10]]);
  let sgCtx: McpTestContext;
  let sgCall: McpTestContext['call'];

  let skillAId: string;
  let skillBId: string;

  beforeAll(async () => {
    sgCtx = await setupMcpClient({
      skillGraph: sgSkillGraph,
      embedFn: sgFakeEmbed,
    });
    sgCall = sgCtx.call;

    const resA = json<CreateResult>(await sgCall('skills_create', { title: 'Skill A', description: 'First skill' }));
    skillAId = resA.skillId;
    const resB = json<CreateResult>(await sgCall('skills_create', { title: 'Skill B', description: 'Second skill' }));
    skillBId = resB.skillId;
  });

  afterAll(async () => {
    await sgCtx.close();
  });

  it('skills_create_link without targetGraph creates same-graph link', async () => {
    const res = json<{ skillId: string; targetId: string; kind: string; created: boolean }>(
      await sgCall('skills_create_link', {
        skillId: skillAId,
        targetId: skillBId,
        kind: 'depends_on',
      }),
    );
    expect(res.created).toBe(true);
    expect(res.skillId).toBe(skillAId);
    expect(res.targetId).toBe(skillBId);
  });

  it('skills_delete_link without targetGraph removes same-graph link', async () => {
    const res = json<{ skillId: string; targetId: string; deleted: boolean }>(
      await sgCall('skills_delete_link', {
        skillId: skillAId,
        targetId: skillBId,
      }),
    );
    expect(res.deleted).toBe(true);
  });

  it('after deletion, link no longer exists', () => {
    expect(sgSkillGraph.hasEdge(skillAId, skillBId)).toBe(false);
  });
});
