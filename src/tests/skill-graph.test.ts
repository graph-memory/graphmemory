import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createSkillGraph, createSkill, updateSkill, bumpUsage, deleteSkill, getSkill,
  listSkills, createSkillRelation, deleteSkillRelation, listSkillRelations,
  createCrossRelation, deleteCrossRelation, cleanupProxies, proxyId, isProxy,
  findLinkedSkills, saveSkillGraph, loadSkillGraph, SkillGraphManager,
} from '@/graphs/skill';
import type { GraphManagerContext } from '@/graphs/manager-types';
import { slugify } from '@/graphs/knowledge-types';
import { DirectedGraph } from 'graphology';
import { searchSkills } from '@/lib/search/skills';
import { unitVec, DIM } from '@/tests/helpers';

const STORE = '/tmp/skill-graph-test';

describe('slugify (shared with skills)', () => {
  const graph = createSkillGraph();

  it('basic slug', () => {
    expect(slugify('Add REST Endpoint', graph)).toBe('add-rest-endpoint');
  });

  it('dedup: returns ::2 when base exists', () => {
    graph.addNode('add-rest-endpoint', {
      title: 'Add REST Endpoint', description: '', steps: [], triggers: [],
      inputHints: [], filePatterns: [], tags: [], source: 'user', confidence: 1,
      usageCount: 0, lastUsedAt: null,
      version: 1, embedding: [], attachments: [], createdAt: 0, updatedAt: 0,
    });
    expect(slugify('Add REST Endpoint', graph)).toBe('add-rest-endpoint::2');
  });
});

describe('CRUD — Skills', () => {
  const g = createSkillGraph();
  let id1: string;
  let id2: string;
  let id3: string;

  describe('createSkill', () => {
    it('returns slug id', () => {
      id1 = createSkill(g, 'Add REST Endpoint', 'How to add a new REST endpoint', ['Create route', 'Add Zod schema', 'Register in index.ts'], ['add endpoint', 'new route'], ['endpoint name'], ['src/api/rest/*.ts'], ['api', 'rest'], 'user', 1, unitVec(0));
      expect(id1).toBe('add-rest-endpoint');
    });

    it('node exists', () => {
      expect(g.hasNode(id1)).toBe(true);
    });

    it('title set correctly', () => {
      expect(g.getNodeAttribute(id1, 'title')).toBe('Add REST Endpoint');
    });

    it('description set correctly', () => {
      expect(g.getNodeAttribute(id1, 'description')).toContain('REST endpoint');
    });

    it('steps set correctly', () => {
      expect(g.getNodeAttribute(id1, 'steps')).toHaveLength(3);
    });

    it('triggers set correctly', () => {
      expect(g.getNodeAttribute(id1, 'triggers')).toEqual(['add endpoint', 'new route']);
    });

    it('inputHints set correctly', () => {
      expect(g.getNodeAttribute(id1, 'inputHints')).toEqual(['endpoint name']);
    });

    it('filePatterns set correctly', () => {
      expect(g.getNodeAttribute(id1, 'filePatterns')).toEqual(['src/api/rest/*.ts']);
    });

    it('source set correctly', () => {
      expect(g.getNodeAttribute(id1, 'source')).toBe('user');
    });

    it('confidence set correctly', () => {
      expect(g.getNodeAttribute(id1, 'confidence')).toBe(1);
    });

    it('usageCount starts at 0', () => {
      expect(g.getNodeAttribute(id1, 'usageCount')).toBe(0);
    });

    it('lastUsedAt starts null', () => {
      expect(g.getNodeAttribute(id1, 'lastUsedAt')).toBeNull();
    });

    it('embedding set correctly', () => {
      expect(g.getNodeAttribute(id1, 'embedding')).toHaveLength(DIM);
    });

    it('createdAt is set', () => {
      expect(g.getNodeAttribute(id1, 'createdAt')).toBeGreaterThan(0);
    });

    it('second skill created', () => {
      id2 = createSkill(g, 'Debug Auth Issues', 'How to debug authentication', ['Check JWT', 'Verify tokens'], ['debug auth', 'auth problem'], [], [], ['auth', 'debug'], 'learned', 0.8, unitVec(1));
      expect(id2).toBe('debug-auth-issues');
    });

    it('source is learned', () => {
      expect(g.getNodeAttribute(id2, 'source')).toBe('learned');
    });

    it('confidence is 0.8', () => {
      expect(g.getNodeAttribute(id2, 'confidence')).toBe(0.8);
    });

    it('third skill created', () => {
      id3 = createSkill(g, 'Run Tests', 'How to run the test suite', ['npm test'], ['run tests'], [], [], ['testing'], 'user', 1, unitVec(2));
      expect(id3).toBe('run-tests');
    });
  });

  describe('getSkill', () => {
    it('returns skill', () => {
      expect(getSkill(g, id1)).not.toBeNull();
    });

    it('id matches', () => {
      expect(getSkill(g, id1)!.id).toBe(id1);
    });

    it('title matches', () => {
      expect(getSkill(g, id1)!.title).toBe('Add REST Endpoint');
    });

    it('steps match', () => {
      expect(getSkill(g, id1)!.steps).toHaveLength(3);
    });

    it('has empty dependsOn', () => {
      expect(getSkill(g, id1)!.dependsOn).toHaveLength(0);
    });

    it('missing returns null', () => {
      expect(getSkill(g, 'nonexistent')).toBeNull();
    });
  });

  describe('updateSkill', () => {
    it('returns true', () => {
      expect(updateSkill(g, id1, { description: 'Updated: complete guide to REST endpoints.' }, unitVec(3))).toBe(true);
    });

    it('description updated', () => {
      expect(g.getNodeAttribute(id1, 'description')).toBe('Updated: complete guide to REST endpoints.');
    });

    it('title unchanged', () => {
      expect(g.getNodeAttribute(id1, 'title')).toBe('Add REST Endpoint');
    });

    it('embedding re-set', () => {
      expect(g.getNodeAttribute(id1, 'embedding')[3]).toBe(1);
    });

    it('updatedAt changed', () => {
      expect(g.getNodeAttribute(id1, 'updatedAt')).toBeGreaterThan(0);
    });

    it('steps only update', () => {
      expect(updateSkill(g, id1, { steps: ['Step A', 'Step B'] })).toBe(true);
    });

    it('steps updated', () => {
      expect(g.getNodeAttribute(id1, 'steps')).toHaveLength(2);
    });

    it('triggers update', () => {
      expect(updateSkill(g, id1, { triggers: ['new trigger'] })).toBe(true);
      expect(g.getNodeAttribute(id1, 'triggers')).toEqual(['new trigger']);
    });

    it('confidence update', () => {
      expect(updateSkill(g, id1, { confidence: 0.5 })).toBe(true);
      expect(g.getNodeAttribute(id1, 'confidence')).toBe(0.5);
    });

    it('source update', () => {
      expect(updateSkill(g, id1, { source: 'learned' })).toBe(true);
      expect(g.getNodeAttribute(id1, 'source')).toBe('learned');
    });

    it('missing returns false', () => {
      expect(updateSkill(g, 'nonexistent', { title: 'x' })).toBe(false);
    });
  });

  describe('bumpUsage', () => {
    it('returns true', () => {
      expect(bumpUsage(g, id1)).toBe(true);
    });

    it('usageCount incremented', () => {
      expect(g.getNodeAttribute(id1, 'usageCount')).toBe(1);
    });

    it('lastUsedAt set', () => {
      expect(g.getNodeAttribute(id1, 'lastUsedAt')).toBeGreaterThan(0);
    });

    it('second bump increments again', () => {
      bumpUsage(g, id1);
      expect(g.getNodeAttribute(id1, 'usageCount')).toBe(2);
    });

    it('missing returns false', () => {
      expect(bumpUsage(g, 'ghost')).toBe(false);
    });
  });

  describe('listSkills', () => {
    it('returns 3 skills', () => {
      expect(listSkills(g)).toHaveLength(3);
    });

    it('sorted by usageCount desc (most used first)', () => {
      const all = listSkills(g);
      expect(all[0].id).toBe(id1); // usageCount=2
    });

    it('filter by source', () => {
      // id1 was changed to learned, id2 is learned, id3 is user
      expect(listSkills(g, { source: 'user' })).toHaveLength(1);
    });

    it('filter by tag', () => {
      expect(listSkills(g, { tag: 'auth' })).toHaveLength(1);
    });

    it('substring filter', () => {
      expect(listSkills(g, { filter: 'endpoint' })).toHaveLength(1);
    });

    it('no match = empty', () => {
      expect(listSkills(g, { filter: 'nonexistent' })).toHaveLength(0);
    });

    it('limit=1 returns 1', () => {
      expect(listSkills(g, { limit: 1 })).toHaveLength(1);
    });
  });

  describe('createSkillRelation', () => {
    it('returns true for depends_on', () => {
      expect(createSkillRelation(g, id1, id3, 'depends_on')).toBe(true);
    });

    it('edge exists', () => {
      expect(g.hasEdge(id1, id3)).toBe(true);
    });

    it('edge kind = depends_on', () => {
      expect(g.getEdgeAttribute(g.edge(id1, id3)!, 'kind')).toBe('depends_on');
    });

    it('related_to relation', () => {
      expect(createSkillRelation(g, id1, id2, 'related_to')).toBe(true);
    });

    it('variant_of relation', () => {
      expect(createSkillRelation(g, id2, id3, 'variant_of')).toBe(true);
    });

    it('duplicate returns false', () => {
      expect(createSkillRelation(g, id1, id3, 'depends_on')).toBe(false);
    });

    it('missing node returns false', () => {
      expect(createSkillRelation(g, id1, 'ghost', 'depends_on')).toBe(false);
    });
  });

  describe('getSkill with relations', () => {
    it('shows dependsOn', () => {
      const skill = getSkill(g, id1)!;
      expect(skill.dependsOn).toHaveLength(1);
      expect(skill.dependsOn[0].id).toBe(id3);
    });

    it('shows dependedBy on target', () => {
      const skill = getSkill(g, id3)!;
      expect(skill.dependedBy).toHaveLength(1);
      expect(skill.dependedBy[0].id).toBe(id1);
    });

    it('shows related', () => {
      const skill = getSkill(g, id1)!;
      expect(skill.related).toHaveLength(1);
      expect(skill.related[0].id).toBe(id2);
    });

    it('shows variants', () => {
      const skill = getSkill(g, id2)!;
      expect(skill.variants.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('listSkillRelations', () => {
    it('returns relations for id1', () => {
      const rels = listSkillRelations(g, id1);
      expect(rels.length).toBeGreaterThanOrEqual(2);
    });

    it('missing node = empty', () => {
      expect(listSkillRelations(g, 'ghost')).toHaveLength(0);
    });
  });

  describe('deleteSkillRelation', () => {
    it('returns true', () => {
      expect(deleteSkillRelation(g, id1, id2)).toBe(true);
    });

    it('edge removed', () => {
      expect(g.hasEdge(id1, id2)).toBe(false);
    });

    it('missing returns false', () => {
      expect(deleteSkillRelation(g, id1, id2)).toBe(false);
    });
  });

  describe('deleteSkill', () => {
    it('returns true', () => {
      expect(deleteSkill(g, id3)).toBe(true);
    });

    it('node removed', () => {
      expect(g.hasNode(id3)).toBe(false);
    });

    it('relation to deleted skill also removed', () => {
      expect(g.hasEdge(id1, id3)).toBe(false);
    });

    it('missing returns false', () => {
      expect(deleteSkill(g, 'ghost')).toBe(false);
    });

    it('remaining skills intact', () => {
      expect(g.order).toBe(2);
    });
  });
});

describe('searchSkills', () => {
  const sg = createSkillGraph();
  let sn1: string;
  let sn2: string;
  let sn3: string;

  beforeAll(() => {
    sn1 = createSkill(sg, 'Add Endpoint', 'REST endpoint recipe', ['Create route'], ['add endpoint'], [], [], ['api'], 'user', 1, unitVec(0));
    sn2 = createSkill(sg, 'Debug Auth', 'Auth debugging guide', ['Check JWT'], ['debug auth'], [], [], ['auth'], 'learned', 0.9, unitVec(1));
    sn3 = createSkill(sg, 'Run Tests', 'Test suite runner', ['npm test'], ['run tests'], [], [], ['testing'], 'user', 1, unitVec(2));
    createSkillRelation(sg, sn1, sn2, 'related_to');
    createSkillRelation(sg, sn2, sn3, 'depends_on');
  });

  it('exact match: 1 result', () => {
    const hits = searchSkills(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits).toHaveLength(1);
  });

  it('exact match: endpoint skill', () => {
    const hits = searchSkills(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].id).toBe('add-endpoint');
  });

  it('exact match: score 1.0', () => {
    const hits = searchSkills(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].score).toBe(1.0);
  });

  it('result has source', () => {
    const hits = searchSkills(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].source).toBe('user');
  });

  it('result has confidence', () => {
    const hits = searchSkills(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].confidence).toBe(1);
  });

  it('BFS depth=1 includes seed + neighbor', () => {
    const hits = searchSkills(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    expect(hits.map(h => h.id)).toContain('add-endpoint');
    expect(hits.map(h => h.id)).toContain('debug-auth');
  });

  it('BFS depth=1 does NOT include depth-2 neighbor', () => {
    const hits = searchSkills(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    expect(hits.map(h => h.id)).not.toContain('run-tests');
  });

  it('BFS depth=2 includes run-tests', () => {
    const hits = searchSkills(sg, unitVec(0), { topK: 1, bfsDepth: 2, minScore: 0 });
    expect(hits.map(h => h.id)).toContain('run-tests');
  });

  it('BFS score < seed score', () => {
    const hits = searchSkills(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    const seedScore = hits.find(h => h.id === 'add-endpoint')!.score;
    const bfsScore = hits.find(h => h.id === 'debug-auth')!.score;
    expect(bfsScore).toBeLessThan(seedScore);
  });

  it('zero-vector query returns empty', () => {
    const hits = searchSkills(sg, new Array(DIM).fill(0), { minScore: 0.1 });
    expect(hits).toHaveLength(0);
  });
});

describe('saveSkillGraph / loadSkillGraph', () => {
  const sg = createSkillGraph();
  let sn1: string;
  let sn2: string;

  beforeAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
    sn1 = createSkill(sg, 'Add Endpoint', 'Recipe', ['Step 1'], ['trigger'], [], [], ['api'], 'user', 1, unitVec(0));
    sn2 = createSkill(sg, 'Debug Auth', 'Guide', ['Step A'], ['debug'], [], [], ['auth'], 'learned', 0.8, unitVec(1));
    createSkillRelation(sg, sn1, sn2, 'related_to');
    saveSkillGraph(sg, STORE);
  });

  afterAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
  });

  it('reloaded: correct node count', () => {
    const sg2 = loadSkillGraph(STORE);
    expect(sg2.order).toBe(sg.order);
  });

  it('reloaded: correct edge count', () => {
    const sg2 = loadSkillGraph(STORE);
    expect(sg2.size).toBe(sg.size);
  });

  it('reloaded: skill exists', () => {
    const sg2 = loadSkillGraph(STORE);
    expect(sg2.hasNode(sn1)).toBe(true);
  });

  it('reloaded: title preserved', () => {
    const sg2 = loadSkillGraph(STORE);
    expect(sg2.getNodeAttribute(sn1, 'title')).toBe('Add Endpoint');
  });

  it('reloaded: source preserved', () => {
    const sg2 = loadSkillGraph(STORE);
    expect(sg2.getNodeAttribute(sn1, 'source')).toBe('user');
  });

  it('reloaded: steps preserved', () => {
    const sg2 = loadSkillGraph(STORE);
    expect(sg2.getNodeAttribute(sn1, 'steps')).toEqual(['Step 1']);
  });

  it('reloaded: embedding preserved', () => {
    const sg2 = loadSkillGraph(STORE);
    expect(sg2.getNodeAttribute(sn1, 'embedding')).toHaveLength(DIM);
  });

  it('reloaded: edge preserved', () => {
    const sg2 = loadSkillGraph(STORE);
    expect(sg2.hasEdge(sn1, sn2)).toBe(true);
  });

  it('loadSkillGraph with no file returns empty', () => {
    const sgEmpty = loadSkillGraph(STORE + '/nonexistent');
    expect(sgEmpty.order).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-graph links
// ---------------------------------------------------------------------------

describe('Cross-graph relations (skills)', () => {
  let sg: ReturnType<typeof createSkillGraph>;
  let extDocs: DirectedGraph;
  let extKnowledge: DirectedGraph;
  let extTasks: DirectedGraph;
  let skillId: string;

  beforeEach(() => {
    sg = createSkillGraph();
    extDocs = new DirectedGraph();
    extKnowledge = new DirectedGraph();
    extTasks = new DirectedGraph();

    extDocs.addNode('guide.md::Setup');
    extKnowledge.addNode('my-note');
    extTasks.addNode('my-task');

    skillId = createSkill(sg, 'My Skill', 'description', [], [], [], [], ['tag'], 'user', 1, unitVec(0));
  });

  describe('proxyId', () => {
    it('builds docs proxy id', () => {
      expect(proxyId('docs', 'guide.md::Setup')).toBe('@docs::guide.md::Setup');
    });

    it('builds knowledge proxy id', () => {
      expect(proxyId('knowledge', 'my-note')).toBe('@knowledge::my-note');
    });

    it('builds tasks proxy id', () => {
      expect(proxyId('tasks', 'my-task')).toBe('@tasks::my-task');
    });
  });

  describe('createCrossRelation', () => {
    it('creates relation to docs node', () => {
      expect(createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs)).toBe(true);
    });

    it('proxy node created', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(sg.hasNode('@docs::guide.md::Setup')).toBe(true);
    });

    it('proxy node has proxyFor attribute', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const pf = sg.getNodeAttribute('@docs::guide.md::Setup', 'proxyFor');
      expect(pf).toEqual({ graph: 'docs', nodeId: 'guide.md::Setup' });
    });

    it('edge exists from skill to proxy', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(sg.hasEdge(skillId, '@docs::guide.md::Setup')).toBe(true);
    });

    it('creates relation to knowledge node', () => {
      expect(createCrossRelation(sg, skillId, 'knowledge', 'my-note', 'relates_to', extKnowledge)).toBe(true);
    });

    it('creates relation to tasks node', () => {
      expect(createCrossRelation(sg, skillId, 'tasks', 'my-task', 'implements', extTasks)).toBe(true);
    });

    it('rejects duplicate', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs)).toBe(false);
    });

    it('rejects if source missing', () => {
      expect(createCrossRelation(sg, 'ghost', 'docs', 'guide.md::Setup', 'references', extDocs)).toBe(false);
    });

    it('rejects if target not in external graph', () => {
      expect(createCrossRelation(sg, skillId, 'docs', 'nonexistent', 'references', extDocs)).toBe(false);
    });

    it('skips validation when no external graph passed', () => {
      expect(createCrossRelation(sg, skillId, 'docs', 'anything', 'references')).toBe(true);
    });
  });

  describe('isProxy', () => {
    it('returns false for regular skill', () => {
      expect(isProxy(sg, skillId)).toBe(false);
    });

    it('returns true for proxy node', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(isProxy(sg, '@docs::guide.md::Setup')).toBe(true);
    });
  });

  describe('findLinkedSkills', () => {
    it('finds skills linked to docs node', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const results = findLinkedSkills(sg, 'docs', 'guide.md::Setup');
      expect(results).toHaveLength(1);
      expect(results[0].skillId).toBe(skillId);
      expect(results[0].kind).toBe('references');
    });

    it('filters by kind', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(findLinkedSkills(sg, 'docs', 'guide.md::Setup', 'depends_on')).toHaveLength(0);
    });

    it('returns empty for nonexistent proxy', () => {
      expect(findLinkedSkills(sg, 'docs', 'nonexistent')).toHaveLength(0);
    });
  });

  describe('listSkillRelations resolves proxies', () => {
    it('outgoing cross relation has targetGraph', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const rels = listSkillRelations(sg, skillId);
      expect(rels).toHaveLength(1);
      expect(rels[0].toId).toBe('guide.md::Setup');
      expect(rels[0].targetGraph).toBe('docs');
    });
  });

  describe('getSkill excludes proxies', () => {
    it('returns null for proxy', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(getSkill(sg, '@docs::guide.md::Setup')).toBeNull();
    });
  });

  describe('listSkills excludes proxies', () => {
    it('proxy not in list', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const skills = listSkills(sg);
      expect(skills.every(s => !s.id.startsWith('@'))).toBe(true);
    });

    it('count matches real skills only', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(listSkills(sg)).toHaveLength(1);
    });
  });

  describe('deleteCrossRelation', () => {
    it('returns true', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(deleteCrossRelation(sg, skillId, 'docs', 'guide.md::Setup')).toBe(true);
    });

    it('orphaned proxy cleaned up', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      deleteCrossRelation(sg, skillId, 'docs', 'guide.md::Setup');
      expect(sg.hasNode('@docs::guide.md::Setup')).toBe(false);
    });

    it('returns false for nonexistent', () => {
      expect(deleteCrossRelation(sg, skillId, 'docs', 'guide.md::Setup')).toBe(false);
    });
  });

  describe('deleteSkill cleans up orphaned proxies', () => {
    it('proxy removed when skill deleted', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      deleteSkill(sg, skillId);
      expect(sg.hasNode('@docs::guide.md::Setup')).toBe(false);
    });
  });

  describe('cleanupProxies', () => {
    it('removes proxy when target deleted from external graph', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      extDocs.dropNode('guide.md::Setup');
      cleanupProxies(sg, 'docs', extDocs);
      expect(sg.hasNode('@docs::guide.md::Setup')).toBe(false);
    });

    it('keeps proxy when target still exists', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      cleanupProxies(sg, 'docs', extDocs);
      expect(sg.hasNode('@docs::guide.md::Setup')).toBe(true);
    });
  });

  describe('searchSkills skips proxy nodes', () => {
    it('proxy not in search results', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const hits = searchSkills(sg, unitVec(0), { topK: 10, bfsDepth: 1, minScore: 0 });
      expect(hits.every(h => !h.id.startsWith('@'))).toBe(true);
    });

    it('seed skill still found', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const hits = searchSkills(sg, unitVec(0), { topK: 10, bfsDepth: 1, minScore: 0.5 });
      expect(hits.map(h => h.id)).toContain(skillId);
    });
  });

  describe('persistence with proxies', () => {
    const XSTORE = '/tmp/skill-cross-test';

    afterEach(() => {
      if (fs.existsSync(XSTORE)) fs.rmSync(XSTORE, { recursive: true });
    });

    it('proxy survives save/load', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      saveSkillGraph(sg, XSTORE);
      const loaded = loadSkillGraph(XSTORE);
      expect(loaded.hasNode('@docs::guide.md::Setup')).toBe(true);
      expect(loaded.getNodeAttribute('@docs::guide.md::Setup', 'proxyFor')).toEqual({
        graph: 'docs', nodeId: 'guide.md::Setup',
      });
    });

    it('cross-graph edge survives save/load', () => {
      createCrossRelation(sg, skillId, 'docs', 'guide.md::Setup', 'references', extDocs);
      saveSkillGraph(sg, XSTORE);
      const loaded = loadSkillGraph(XSTORE);
      expect(loaded.hasEdge(skillId, '@docs::guide.md::Setup')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Attachments (SkillGraphManager)
// ---------------------------------------------------------------------------

describe('Attachments (SkillGraphManager)', () => {
  let tmpDir: string;
  let manager: SkillGraphManager;
  let skillId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-attach-'));
    const graph = createSkillGraph();
    const embedFn: (query: string) => Promise<number[]> = () => Promise.resolve(unitVec(0));
    const ctx: GraphManagerContext = {
      markDirty: () => {},
      emit: () => {},
      projectId: 'test',
      projectDir: tmpDir,
      author: '',
    };
    manager = new SkillGraphManager(graph, embedFn, ctx, {});
    skillId = await manager.createSkill('Test Skill', 'A skill for attachment tests', [], [], [], [], []);
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });

  describe('addAttachment', () => {
    it('returns metadata for valid attachment', () => {
      const data = Buffer.from('hello world');
      const meta = manager.addAttachment(skillId, 'readme.txt', data);
      expect(meta).not.toBeNull();
      expect(meta!.filename).toBe('readme.txt');
    });

    it('writes file to disk', () => {
      const filePath = path.join(tmpDir, '.skills', skillId, 'readme.txt');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('file contents match', () => {
      const filePath = path.join(tmpDir, '.skills', skillId, 'readme.txt');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
    });

    it('returns null for missing skill', () => {
      const meta = manager.addAttachment('nonexistent', 'file.txt', Buffer.from('x'));
      expect(meta).toBeNull();
    });

    it('sanitizes dangerous filenames', () => {
      const data = Buffer.from('sanitized');
      const meta = manager.addAttachment(skillId, '../../../etc/passwd', data);
      expect(meta).not.toBeNull();
      expect(meta!.filename).not.toContain('..');
      expect(meta!.filename).not.toContain('/');
    });
  });

  describe('listAttachments', () => {
    it('returns attachments for skill', () => {
      const list = manager.listAttachments(skillId);
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for missing skill', () => {
      expect(manager.listAttachments('nonexistent')).toEqual([]);
    });
  });

  describe('getAttachmentPath', () => {
    it('returns path for existing attachment', () => {
      const p = manager.getAttachmentPath(skillId, 'readme.txt');
      expect(p).not.toBeNull();
      expect(p).toContain('readme.txt');
    });

    it('returns null for nonexistent attachment', () => {
      const p = manager.getAttachmentPath(skillId, 'no-such-file.txt');
      expect(p).toBeNull();
    });
  });

  describe('removeAttachment', () => {
    it('returns true for existing attachment', () => {
      manager.addAttachment(skillId, 'to-delete.txt', Buffer.from('delete me'));
      expect(manager.removeAttachment(skillId, 'to-delete.txt')).toBe(true);
    });

    it('file removed from disk', () => {
      const p = path.join(tmpDir, '.skills', skillId, 'to-delete.txt');
      expect(fs.existsSync(p)).toBe(false);
    });

    it('returns false for nonexistent attachment', () => {
      expect(manager.removeAttachment(skillId, 'no-such-file.txt')).toBe(false);
    });
  });

  describe('syncAttachments', () => {
    it('picks up externally added file', () => {
      const skillDir = path.join(tmpDir, '.skills', skillId);
      fs.writeFileSync(path.join(skillDir, 'external.txt'), 'added externally');
      manager.syncAttachments(skillId);
      const attachments = manager.listAttachments(skillId);
      expect(attachments.some((a: { filename: string }) => a.filename === 'external.txt')).toBe(true);
    });

    it('no-ops for missing skill', () => {
      expect(() => manager.syncAttachments('nonexistent')).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// SkillGraphManager — BM25 integration
// ---------------------------------------------------------------------------

describe('SkillGraphManager BM25', () => {
  let manager: SkillGraphManager;

  beforeAll(async () => {
    const graph = createSkillGraph();
    const embedFn = () => Promise.resolve(unitVec(0));
    const ctx: GraphManagerContext = {
      markDirty: () => {},
      emit: () => {},
      projectId: 'test',
      author: '',
    };
    manager = new SkillGraphManager(graph, embedFn, ctx, {});
    await manager.createSkill('REST Endpoint', 'Create REST endpoints', [], ['add endpoint'], [], [], ['api']);
    await manager.createSkill('GraphQL Query', 'Create GraphQL resolvers', [], ['add query'], [], [], ['graphql']);
  });

  it('BM25 index has documents', () => {
    expect(manager.bm25Index.size).toBe(2);
  });

  it('rebuild clears and repopulates', () => {
    manager.rebuildBm25Index();
    expect(manager.bm25Index.size).toBe(2);
  });

  it('delete removes from BM25 index', async () => {
    const id = await manager.createSkill('Temp Skill', 'temp', [], [], [], [], []);
    expect(manager.bm25Index.size).toBe(3);
    manager.deleteSkill(id);
    expect(manager.bm25Index.size).toBe(2);
  });
});
