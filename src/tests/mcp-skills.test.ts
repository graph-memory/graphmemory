import {
  createFakeEmbed, createTestStoreManager, setupMcpClient, json, jsonList,
  type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';
import type { SkillSource } from '@/store/types/skills';
import type { Edge } from '@/store/types/common';

// ---------------------------------------------------------------------------
// Types for result parsing
// ---------------------------------------------------------------------------

type CreateResult = { skillId: number };
type UpdateResult = { skillId: number; updated: boolean };
type DeleteResult = { skillId: number; deleted: boolean };
type BumpResult = { skillId: number; bumped: boolean };
type LinkResult = { fromId: number; toId: number; kind: string; created: boolean };
type CrossLinkResult = { skillId: number; targetId: number; targetGraph: string; kind: string; created: boolean };
type CrossDeleteResult = { skillId: number; targetId: number; targetGraph: string; deleted: boolean };

interface SkillResult {
  id: number;
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
  edges: Edge[];
}

interface SkillListEntry {
  id: number;
  title: string;
  description: string;
  tags: string[];
  source: SkillSource;
  confidence: number;
  usageCount: number;
}

interface SkillSearchHit {
  id: number;
  title: string;
  description: string;
  tags: string[];
  source: SkillSource;
  confidence: number;
  score: number;
}

type LinkedSkillResult = {
  skillId: number;
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
    const fakeEmbed = createFakeEmbed([
      ['endpoint', 0],
      ['auth', 1],
      ['test', 2],
      ['deploy', 3],
    ]);
    let storeCtx: TestStoreContext;
    let ctx: McpTestContext;
    let call: McpTestContext['call'];

    // Store dynamic IDs from creation calls
    let addRestEndpointId: number;
    let debugAuthIssuesId: number;
    let runTestSuiteId: number;
    let authGuideNoteId: number;

    beforeAll(async () => {
      storeCtx = createTestStoreManager(fakeEmbed);
      ctx = await setupMcpClient({
        storeManager: storeCtx.storeManager,
        embedFn: fakeEmbed,
      });
      call = ctx.call;
    });

    afterAll(async () => {
      await ctx.close();
      storeCtx.cleanup();
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
      expect(typeof res.skillId).toBe('number');
      expect(res.skillId).toBeGreaterThan(0);
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
      expect(typeof res.skillId).toBe('number');
      expect(res.skillId).toBeGreaterThan(0);
      debugAuthIssuesId = res.skillId;
    });

    it('skills_create defaults to user source', async () => {
      const res = json<CreateResult>(await call('skills_create', {
        title: 'Run Test Suite',
        description: 'How to run the test suite end to end.',
        steps: ['npm test', 'Check coverage'],
        tags: ['test', 'ci'],
      }));
      expect(typeof res.skillId).toBe('number');
      expect(res.skillId).toBeGreaterThan(0);
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
    });

    it('skills_get returns error for missing', async () => {
      const res = await call('skills_get', { skillId: 999999 });
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
      const res = await call('skills_update', { skillId: 999999, description: 'x' });
      expect(res.isError).toBe(true);
    });

    // -- skills_list --

    it('skills_list returns all 3', async () => {
      const skills = jsonList<SkillListEntry>(await call('skills_list'));
      expect(skills).toHaveLength(3);
    });

    it('skills_list filter by source', async () => {
      const skills = jsonList<SkillListEntry>(await call('skills_list', { source: 'learned' }));
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe(debugAuthIssuesId);
    });

    it('skills_list filter by tag', async () => {
      const skills = jsonList<SkillListEntry>(await call('skills_list', { tag: 'auth' }));
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe(debugAuthIssuesId);
    });

    it('skills_list substring filter', async () => {
      const skills = jsonList<SkillListEntry>(await call('skills_list', { filter: 'rest' }));
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe(addRestEndpointId);
    });

    it('skills_list limit', async () => {
      const skills = jsonList<SkillListEntry>(await call('skills_list', { limit: 1 }));
      expect(skills).toHaveLength(1);
    });

    // -- skills_search --

    it('skills_search finds by query (vector mode)', async () => {
      const hits = json<SkillSearchHit[]>(await call('skills_search', {
        query: 'endpoint',
        minScore: 0,
        searchMode: 'vector',
      }));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].id).toBe(addRestEndpointId);
      expect(hits[0].score).toBeGreaterThan(0);
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

    it('skills_get shows depends_on link', async () => {
      const skill = json<any>(await call('skills_get', { skillId: runTestSuiteId }));
      expect(skill.dependsOn).toBeDefined();
      expect(skill.dependsOn).toContain(addRestEndpointId);
    });

    it('skills_link duplicate is silently ignored (INSERT OR IGNORE)', async () => {
      const res = json<LinkResult>(await call('skills_link', {
        fromId: runTestSuiteId,
        toId: addRestEndpointId,
        kind: 'depends_on',
      }));
      // SQLite INSERT OR IGNORE silently ignores duplicates
      expect(res.created).toBe(true);
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

    it('skills_bump_usage on missing skill is a no-op (UPDATE affects 0 rows)', async () => {
      const res = json<BumpResult>(await call('skills_bump_usage', { skillId: 999999 }));
      // SQLite UPDATE on non-existent row does nothing but doesn't throw
      expect(res.bumped).toBe(true);
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
      const noteRes = json<{ noteId: number }>(await call('notes_create', { title: 'Auth Guide', content: 'How auth works.' }));
      authGuideNoteId = noteRes.noteId;

      const res = json<CrossLinkResult>(await call('skills_create_link', {
        skillId: debugAuthIssuesId,
        targetId: authGuideNoteId,
        targetGraph: 'knowledge',
        kind: 'references',
      }));
      expect(res.created).toBe(true);
    });

    it('skills_create_link duplicate is silently ignored', async () => {
      const res = json<CrossLinkResult>(await call('skills_create_link', {
        skillId: debugAuthIssuesId,
        targetId: authGuideNoteId,
        targetGraph: 'knowledge',
        kind: 'references',
      }));
      // INSERT OR IGNORE — duplicate is silently ignored
      expect(res.created).toBe(true);
    });

    // -- skills_find_linked --

    it('skills_find_linked finds skill linked to knowledge note', async () => {
      const results = json<LinkedSkillResult[]>(await call('skills_find_linked', {
        targetGraph: 'knowledge',
        targetId: authGuideNoteId,
      }));
      expect(results).toHaveLength(1);
      expect(results[0].skillId).toBe(debugAuthIssuesId);
      expect(results[0].kind).toBe('references');
    });

    it('skills_find_linked returns message for unlinked', async () => {
      const res = await call('skills_find_linked', {
        targetGraph: 'knowledge',
        targetId: 999999,
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
        kind: 'references',
      }));
      expect(res.deleted).toBe(true);
    });

    it('after skills_delete_link, skills_find_linked returns empty', async () => {
      const res = await call('skills_find_linked', {
        targetGraph: 'knowledge',
        targetId: authGuideNoteId,
      });
      const text = res.content[0].text!;
      expect(text).toContain('No skills linked');
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
      const skills = jsonList<SkillListEntry>(await call('skills_list'));
      expect(skills).toHaveLength(2);
    });

    it('skills_delete returns error for missing', async () => {
      const res = await call('skills_delete', { skillId: 999999 });
      expect(res.isError).toBe(true);
    });

    // -- skills_delete cleans up cross-graph link --

    it('skills_delete cleans up remaining cross-graph link', async () => {
      // Create a cross-graph link first
      await call('skills_create_link', {
        skillId: debugAuthIssuesId,
        targetId: authGuideNoteId,
        targetGraph: 'knowledge',
        kind: 'documents',
      });

      // Verify link exists
      const before = json<LinkedSkillResult[]>(await call('skills_find_linked', {
        targetGraph: 'knowledge',
        targetId: authGuideNoteId,
      }));
      expect(before.some(r => r.skillId === debugAuthIssuesId)).toBe(true);

      // Delete the skill
      const del = json<DeleteResult>(await call('skills_delete', { skillId: debugAuthIssuesId }));
      expect(del.deleted).toBe(true);

      // Link should be gone after skill deletion
      const after = await call('skills_find_linked', {
        targetGraph: 'knowledge',
        targetId: authGuideNoteId,
      });
      const text = after.content[0].text!;
      expect(text).toContain('No skills linked');
    });
  });
});

// ---------------------------------------------------------------------------
// Same-graph skill-to-skill links via skills_create_link / skills_delete_link
// ---------------------------------------------------------------------------

describe('Same-graph skill links via skills_create_link/skills_delete_link', () => {
  const sgFakeEmbed = createFakeEmbed([['skill', 10]]);
  let storeCtx: TestStoreContext;
  let sgCtx: McpTestContext;
  let sgCall: McpTestContext['call'];

  let skillAId: number;
  let skillBId: number;

  beforeAll(async () => {
    storeCtx = createTestStoreManager(sgFakeEmbed);
    sgCtx = await setupMcpClient({
      storeManager: storeCtx.storeManager,
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
    storeCtx.cleanup();
  });

  it('skills_create_link without targetGraph creates same-graph link', async () => {
    const res = json<{ skillId: number; targetId: number; kind: string; created: boolean }>(
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

  it('link is visible via skills_get dependsOn', async () => {
    const skill = json<any>(await sgCall('skills_get', { skillId: skillAId }));
    // skills_get now returns structured arrays instead of raw edges
    expect(skill.dependsOn).toBeDefined();
    expect(skill.dependsOn).toContain(skillBId);
  });

  it('skills_delete_link without targetGraph removes same-graph link', async () => {
    const res = json<{ skillId: number; targetId: number; deleted: boolean }>(
      await sgCall('skills_delete_link', {
        skillId: skillAId,
        targetId: skillBId,
        kind: 'depends_on',
      }),
    );
    expect(res.deleted).toBe(true);
  });

  it('after deletion, link no longer exists', async () => {
    const skill = json<any>(await sgCall('skills_get', { skillId: skillAId }));
    expect(skill.dependsOn ?? []).not.toContain(skillBId);
  });
});
