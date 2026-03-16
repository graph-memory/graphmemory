import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createKnowledgeGraph, createNote, updateNote, deleteNote, getNote,
  listNotes, createRelation, deleteRelation, listRelations,
  createCrossRelation, deleteCrossRelation, cleanupProxies, proxyId, isProxy,
  saveKnowledgeGraph, loadKnowledgeGraph,
  KnowledgeGraphManager,
} from '@/graphs/knowledge';
import { slugify } from '@/graphs/knowledge-types';
import { DirectedGraph } from 'graphology';
import { searchKnowledge } from '@/lib/search/knowledge';
import { unitVec, DIM } from '@/tests/helpers';
import type { GraphManagerContext } from '@/graphs/manager-types';

const STORE = '/tmp/knowledge-graph-test';

describe('slugify', () => {
  const graph = createKnowledgeGraph();

  it('basic slug', () => {
    expect(slugify('Hello World', graph)).toBe('hello-world');
  });

  it('strips special chars', () => {
    expect(slugify('Auth: JWT & Tokens!', graph)).toBe('auth-jwt-tokens');
  });

  it('trims dashes', () => {
    expect(slugify('  --hello--  ', graph)).toBe('hello');
  });

  it('dedup: returns ::2 when base exists', () => {
    graph.addNode('hello-world', {
      title: 'Hello World', content: '', tags: [], embedding: [],
      attachments: [], createdAt: 0, updatedAt: 0,
    });
    expect(slugify('Hello World', graph)).toBe('hello-world::2');
  });

  it('dedup: returns ::3 when ::2 exists', () => {
    graph.addNode('hello-world::2', {
      title: 'Hello World', content: '', tags: [], embedding: [],
      attachments: [], createdAt: 0, updatedAt: 0,
    });
    expect(slugify('Hello World', graph)).toBe('hello-world::3');
  });

  it('empty title gets fallback', () => {
    expect(slugify('!!!', graph)).toMatch(/^note-/);
  });
});

describe('CRUD — Notes', () => {
  const g = createKnowledgeGraph();
  let id1: string;
  let id2: string;
  let id3: string;

  describe('createNote', () => {
    it('returns slug id', () => {
      id1 = createNote(g, 'Auth uses JWT', 'The system authenticates via JWT tokens.', ['auth', 'security'], unitVec(0));
      expect(id1).toBe('auth-uses-jwt');
    });

    it('node exists', () => {
      expect(g.hasNode(id1)).toBe(true);
    });

    it('title set correctly', () => {
      expect(g.getNodeAttribute(id1, 'title')).toBe('Auth uses JWT');
    });

    it('content set correctly', () => {
      expect(g.getNodeAttribute(id1, 'content')).toContain('JWT tokens');
    });

    it('tags set correctly', () => {
      expect(g.getNodeAttribute(id1, 'tags')).toEqual(['auth', 'security']);
    });

    it('embedding set correctly', () => {
      expect(g.getNodeAttribute(id1, 'embedding')).toHaveLength(DIM);
    });

    it('createdAt is set', () => {
      expect(g.getNodeAttribute(id1, 'createdAt')).toBeGreaterThan(0);
    });

    it('updatedAt is set', () => {
      expect(g.getNodeAttribute(id1, 'updatedAt')).toBeGreaterThan(0);
    });

    it('second note created', () => {
      id2 = createNote(g, 'Database is Postgres', 'We use PostgreSQL 15.', ['infra'], unitVec(1));
      expect(id2).toBe('database-is-postgres');
    });

    it('third note created', () => {
      id3 = createNote(g, 'Rate limiting', 'API has 100 req/min limit.', ['api'], unitVec(2));
      expect(id3).toBe('rate-limiting');
    });
  });

  describe('getNote', () => {
    it('returns note', () => {
      expect(getNote(g, id1)).not.toBeNull();
    });

    it('id matches', () => {
      expect(getNote(g, id1)!.id).toBe(id1);
    });

    it('title matches', () => {
      expect(getNote(g, id1)!.title).toBe('Auth uses JWT');
    });

    it('content matches', () => {
      expect(getNote(g, id1)!.content).toContain('JWT tokens');
    });

    it('tags match', () => {
      expect(getNote(g, id1)!.tags).toHaveLength(2);
    });

    it('missing returns null', () => {
      expect(getNote(g, 'nonexistent')).toBeNull();
    });
  });

  describe('updateNote', () => {
    it('returns true', () => {
      expect(updateNote(g, id1, { content: 'Updated: JWT with refresh tokens.' }, unitVec(3))).toBe(true);
    });

    it('content updated', () => {
      expect(g.getNodeAttribute(id1, 'content')).toBe('Updated: JWT with refresh tokens.');
    });

    it('title unchanged', () => {
      expect(g.getNodeAttribute(id1, 'title')).toBe('Auth uses JWT');
    });

    it('embedding re-set', () => {
      expect(g.getNodeAttribute(id1, 'embedding')[3]).toBe(1);
    });

    it('updatedAt changed', () => {
      expect(g.getNodeAttribute(id1, 'updatedAt')).toBeGreaterThan(0);
    });

    it('tags only update (no embedding)', () => {
      expect(updateNote(g, id1, { tags: ['auth', 'security', 'jwt'] })).toBe(true);
    });

    it('tags updated', () => {
      expect(g.getNodeAttribute(id1, 'tags')).toHaveLength(3);
    });

    it('missing returns false', () => {
      expect(updateNote(g, 'nonexistent', { title: 'x' })).toBe(false);
    });
  });

  describe('listNotes', () => {
    it('returns 3 notes', () => {
      expect(listNotes(g)).toHaveLength(3);
    });

    it('sorted by updatedAt desc', () => {
      const all = listNotes(g);
      expect(all[0].updatedAt).toBeGreaterThanOrEqual(all[1].updatedAt);
    });

    it('filter "auth" matches 1 note', () => {
      expect(listNotes(g, 'auth')).toHaveLength(1);
    });

    it('filter matches by id', () => {
      expect(listNotes(g, 'auth')[0].id).toBe(id1);
    });

    it('tag filter "infra" matches 1 note', () => {
      expect(listNotes(g, undefined, 'infra')).toHaveLength(1);
    });

    it('tag filter matches database note', () => {
      expect(listNotes(g, undefined, 'infra')[0].id).toBe(id2);
    });

    it('filter + tag combined', () => {
      expect(listNotes(g, 'auth', 'jwt')).toHaveLength(1);
    });

    it('filter no match = empty', () => {
      expect(listNotes(g, 'nonexistent')).toHaveLength(0);
    });

    it('limit=1 returns 1', () => {
      expect(listNotes(g, undefined, undefined, 1)).toHaveLength(1);
    });
  });

  describe('createRelation', () => {
    it('returns true', () => {
      expect(createRelation(g, id1, id2, 'depends_on')).toBe(true);
    });

    it('edge exists', () => {
      expect(g.hasEdge(id1, id2)).toBe(true);
    });

    it('edge kind = depends_on', () => {
      expect(g.getEdgeAttribute(g.edge(id1, id2)!, 'kind')).toBe('depends_on');
    });

    it('second relation created', () => {
      expect(createRelation(g, id1, id3, 'relates_to')).toBe(true);
    });

    it('duplicate relation returns false', () => {
      expect(createRelation(g, id1, id2, 'depends_on')).toBe(false);
    });

    it('relation with missing node returns false', () => {
      expect(createRelation(g, id1, 'ghost', 'x')).toBe(false);
    });
  });

  describe('listRelations', () => {
    it('returns 2 relations', () => {
      expect(listRelations(g, id1)).toHaveLength(2);
    });

    it('includes depends_on edge', () => {
      expect(listRelations(g, id1).some(r => r.toId === id2 && r.kind === 'depends_on')).toBe(true);
    });

    it('includes relates_to edge', () => {
      expect(listRelations(g, id1).some(r => r.toId === id3 && r.kind === 'relates_to')).toBe(true);
    });

    it('incoming relation visible', () => {
      expect(listRelations(g, id2)).toHaveLength(1);
    });

    it('incoming shows fromId correctly', () => {
      expect(listRelations(g, id2)[0].fromId).toBe(id1);
    });

    it('missing node = empty', () => {
      expect(listRelations(g, 'ghost')).toHaveLength(0);
    });
  });

  describe('deleteRelation', () => {
    it('returns true', () => {
      expect(deleteRelation(g, id1, id2)).toBe(true);
    });

    it('edge removed', () => {
      expect(g.hasEdge(id1, id2)).toBe(false);
    });

    it('missing returns false', () => {
      expect(deleteRelation(g, id1, id2)).toBe(false);
    });

    it('remaining relation still exists', () => {
      expect(g.hasEdge(id1, id3)).toBe(true);
    });
  });

  describe('deleteNote', () => {
    it('returns true', () => {
      expect(deleteNote(g, id3)).toBe(true);
    });

    it('node removed', () => {
      expect(g.hasNode(id3)).toBe(false);
    });

    it('relation to deleted node also removed', () => {
      expect(g.hasEdge(id1, id3)).toBe(false);
    });

    it('missing returns false', () => {
      expect(deleteNote(g, 'ghost')).toBe(false);
    });

    it('remaining notes intact', () => {
      expect(g.order).toBe(2);
    });
  });
});

describe('searchKnowledge', () => {
  const sg = createKnowledgeGraph();
  let sn1: string;
  let sn2: string;
  let sn3: string;

  beforeAll(() => {
    sn1 = createNote(sg, 'Auth JWT', 'JWT authentication', ['auth'], unitVec(0));
    sn2 = createNote(sg, 'Database', 'PostgreSQL setup', ['infra'], unitVec(1));
    sn3 = createNote(sg, 'API Rate Limit', 'Rate limiting rules', ['api'], unitVec(2));
    createRelation(sg, sn1, sn2, 'depends_on');
    createRelation(sg, sn2, sn3, 'relates_to');
  });

  it('exact match: 1 result', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits).toHaveLength(1);
  });

  it('exact match: auth note', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].id).toBe('auth-jwt');
  });

  it('exact match: score 1.0', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].score).toBe(1.0);
  });

  it('result has title', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].title).toBe('Auth JWT');
  });

  it('result has content', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].content).toBe('JWT authentication');
  });

  it('result has tags', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].tags).toHaveLength(1);
  });

  it('BFS depth=1 includes seed', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    expect(hits.map(h => h.id)).toContain('auth-jwt');
  });

  it('BFS depth=1 includes database via depends_on', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    expect(hits.map(h => h.id)).toContain('database');
  });

  it('BFS depth=1 does NOT include rate-limit (depth 2)', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    expect(hits.map(h => h.id)).not.toContain('api-rate-limit');
  });

  it('BFS depth=2 includes rate-limit', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 2, minScore: 0 });
    expect(hits.map(h => h.id)).toContain('api-rate-limit');
  });

  it('BFS score < seed score', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    const seedScore = hits.find(h => h.id === 'auth-jwt')!.score;
    const bfsScore = hits.find(h => h.id === 'database')!.score;
    expect(bfsScore).toBeLessThan(seedScore);
  });

  it('BFS score = seed * 0.8', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    const seedScore = hits.find(h => h.id === 'auth-jwt')!.score;
    const bfsScore = hits.find(h => h.id === 'database')!.score;
    expect(Math.abs(bfsScore - seedScore * 0.8)).toBeLessThan(0.001);
  });

  it('minScore=0.9 returns only seed', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 1, minScore: 0.9 });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('auth-jwt');
  });

  it('bfsDecay=1.0 keeps full score', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 1, bfsDecay: 1.0, minScore: 0.99 });
    expect(hits.some(h => h.id === 'database')).toBe(true);
  });

  it('bfsDecay=0.0 filters BFS nodes', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 1, bfsDepth: 1, bfsDecay: 0.0, minScore: 0.01 });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('auth-jwt');
  });

  it('maxResults=1 caps output', () => {
    const hits = searchKnowledge(sg, unitVec(0), { topK: 5, bfsDepth: 2, maxResults: 1, minScore: 0 });
    expect(hits).toHaveLength(1);
  });

  it('zero-vector query returns empty', () => {
    const hits = searchKnowledge(sg, new Array(DIM).fill(0), { minScore: 0.1 });
    expect(hits).toHaveLength(0);
  });
});

describe('saveKnowledgeGraph / loadKnowledgeGraph', () => {
  const sg = createKnowledgeGraph();
  let sn1: string;
  let sn2: string;

  beforeAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
    sn1 = createNote(sg, 'Auth JWT', 'JWT authentication', ['auth'], unitVec(0));
    sn2 = createNote(sg, 'Database', 'PostgreSQL setup', ['infra'], unitVec(1));
    createRelation(sg, sn1, sn2, 'depends_on');
    saveKnowledgeGraph(sg, STORE);
  });

  afterAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
  });

  it('reloaded: correct node count', () => {
    const sg2 = loadKnowledgeGraph(STORE);
    expect(sg2.order).toBe(sg.order);
  });

  it('reloaded: correct edge count', () => {
    const sg2 = loadKnowledgeGraph(STORE);
    expect(sg2.size).toBe(sg.size);
  });

  it('reloaded: auth note exists', () => {
    const sg2 = loadKnowledgeGraph(STORE);
    expect(sg2.hasNode(sn1)).toBe(true);
  });

  it('reloaded: title preserved', () => {
    const sg2 = loadKnowledgeGraph(STORE);
    expect(sg2.getNodeAttribute(sn1, 'title')).toBe('Auth JWT');
  });

  it('reloaded: embedding preserved', () => {
    const sg2 = loadKnowledgeGraph(STORE);
    expect(sg2.getNodeAttribute(sn1, 'embedding')).toHaveLength(DIM);
  });

  it('reloaded: edge preserved', () => {
    const sg2 = loadKnowledgeGraph(STORE);
    expect(sg2.hasEdge(sn1, sn2)).toBe(true);
  });

  it('reloaded: edge kind preserved', () => {
    const sg2 = loadKnowledgeGraph(STORE);
    expect(sg2.getEdgeAttribute(sg2.edge(sn1, sn2)!, 'kind')).toBe('depends_on');
  });

  it('loadKnowledgeGraph with no file returns empty', () => {
    const sgEmpty = loadKnowledgeGraph(STORE + '/nonexistent');
    expect(sgEmpty.order).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-graph links
// ---------------------------------------------------------------------------

describe('Cross-graph relations', () => {
  let kg: ReturnType<typeof createKnowledgeGraph>;
  let extDocs: DirectedGraph;
  let extCode: DirectedGraph;
  let noteId: string;

  beforeEach(() => {
    kg = createKnowledgeGraph();
    extDocs = new DirectedGraph();
    extCode = new DirectedGraph();

    // Simulate external graph nodes
    extDocs.addNode('guide.md::Setup');
    extCode.addNode('auth.ts::Foo');

    noteId = createNote(kg, 'My Note', 'content', ['tag'], unitVec(0));
  });

  describe('proxyId', () => {
    it('builds docs proxy id', () => {
      expect(proxyId('docs', 'guide.md::Setup')).toBe('@docs::guide.md::Setup');
    });

    it('builds code proxy id', () => {
      expect(proxyId('code', 'auth.ts::Foo')).toBe('@code::auth.ts::Foo');
    });
  });

  describe('createCrossRelation', () => {
    it('creates relation to docs node', () => {
      expect(createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs)).toBe(true);
    });

    it('proxy node created', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(kg.hasNode('@docs::guide.md::Setup')).toBe(true);
    });

    it('proxy node has proxyFor attribute', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const pf = kg.getNodeAttribute('@docs::guide.md::Setup', 'proxyFor');
      expect(pf).toEqual({ graph: 'docs', nodeId: 'guide.md::Setup' });
    });

    it('edge exists from note to proxy', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(kg.hasEdge(noteId, '@docs::guide.md::Setup')).toBe(true);
    });

    it('edge kind is correct', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const edgeKey = kg.edge(noteId, '@docs::guide.md::Setup')!;
      expect(kg.getEdgeAttribute(edgeKey, 'kind')).toBe('references');
    });

    it('creates relation to code node', () => {
      expect(createCrossRelation(kg, noteId, 'code', 'auth.ts::Foo', 'depends_on', extCode)).toBe(true);
    });

    it('rejects duplicate cross relation', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs)).toBe(false);
    });

    it('rejects if source note missing', () => {
      expect(createCrossRelation(kg, 'ghost', 'docs', 'guide.md::Setup', 'references', extDocs)).toBe(false);
    });

    it('rejects if target not in external graph', () => {
      expect(createCrossRelation(kg, noteId, 'docs', 'nonexistent', 'references', extDocs)).toBe(false);
    });

    it('skips validation when no external graph passed', () => {
      expect(createCrossRelation(kg, noteId, 'docs', 'anything', 'references')).toBe(true);
    });

    it('rejects if source is a proxy node', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const pId = proxyId('docs', 'guide.md::Setup');
      expect(createCrossRelation(kg, pId, 'code', 'auth.ts::Foo', 'x', extCode)).toBe(false);
    });
  });

  describe('isProxy', () => {
    it('returns false for regular note', () => {
      expect(isProxy(kg, noteId)).toBe(false);
    });

    it('returns true for proxy node', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(isProxy(kg, '@docs::guide.md::Setup')).toBe(true);
    });

    it('returns false for nonexistent node', () => {
      expect(isProxy(kg, 'ghost')).toBe(false);
    });
  });

  describe('listRelations resolves proxies', () => {
    it('outgoing cross relation has targetGraph', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const rels = listRelations(kg, noteId);
      expect(rels).toHaveLength(1);
      expect(rels[0].toId).toBe('guide.md::Setup');
      expect(rels[0].targetGraph).toBe('docs');
    });

    it('mixes note-to-note and cross-graph', () => {
      const note2 = createNote(kg, 'Note 2', 'content', [], unitVec(1));
      createRelation(kg, noteId, note2, 'relates_to');
      createCrossRelation(kg, noteId, 'code', 'auth.ts::Foo', 'references', extCode);
      const rels = listRelations(kg, noteId);
      expect(rels).toHaveLength(2);
      const crossRel = rels.find(r => r.targetGraph === 'code');
      const noteRel = rels.find(r => !r.targetGraph);
      expect(crossRel).toBeDefined();
      expect(crossRel!.toId).toBe('auth.ts::Foo');
      expect(noteRel).toBeDefined();
      expect(noteRel!.toId).toBe(note2);
    });
  });

  describe('getNote excludes proxies', () => {
    it('getNote returns null for proxy', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(getNote(kg, '@docs::guide.md::Setup')).toBeNull();
    });
  });

  describe('listNotes excludes proxies', () => {
    it('proxy not in list', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const notes = listNotes(kg);
      expect(notes.every(n => !n.id.startsWith('@'))).toBe(true);
    });

    it('count matches real notes only', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(listNotes(kg)).toHaveLength(1);
    });
  });

  describe('deleteCrossRelation', () => {
    it('returns true', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(deleteCrossRelation(kg, noteId, 'docs', 'guide.md::Setup')).toBe(true);
    });

    it('edge removed', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      deleteCrossRelation(kg, noteId, 'docs', 'guide.md::Setup');
      expect(kg.hasEdge(noteId, '@docs::guide.md::Setup')).toBe(false);
    });

    it('orphaned proxy cleaned up', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      deleteCrossRelation(kg, noteId, 'docs', 'guide.md::Setup');
      expect(kg.hasNode('@docs::guide.md::Setup')).toBe(false);
    });

    it('returns false for nonexistent', () => {
      expect(deleteCrossRelation(kg, noteId, 'docs', 'guide.md::Setup')).toBe(false);
    });

    it('proxy kept if still has other edges', () => {
      const note2 = createNote(kg, 'Note 2', 'c', [], unitVec(1));
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      createCrossRelation(kg, note2, 'docs', 'guide.md::Setup', 'mentions', extDocs);
      deleteCrossRelation(kg, noteId, 'docs', 'guide.md::Setup');
      expect(kg.hasNode('@docs::guide.md::Setup')).toBe(true);
    });
  });

  describe('deleteNote cleans up orphaned proxies', () => {
    it('proxy removed when note deleted', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      deleteNote(kg, noteId);
      expect(kg.hasNode('@docs::guide.md::Setup')).toBe(false);
    });

    it('proxy kept if other note references it', () => {
      const note2 = createNote(kg, 'Note 2', 'c', [], unitVec(1));
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      createCrossRelation(kg, note2, 'docs', 'guide.md::Setup', 'mentions', extDocs);
      deleteNote(kg, noteId);
      expect(kg.hasNode('@docs::guide.md::Setup')).toBe(true);
    });
  });

  describe('cleanupProxies', () => {
    it('removes proxy when target deleted from external graph', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      extDocs.dropNode('guide.md::Setup');
      cleanupProxies(kg, 'docs', extDocs);
      expect(kg.hasNode('@docs::guide.md::Setup')).toBe(false);
    });

    it('edge removed along with proxy', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      extDocs.dropNode('guide.md::Setup');
      cleanupProxies(kg, 'docs', extDocs);
      expect(kg.size).toBe(0);
    });

    it('keeps proxy when target still exists', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      cleanupProxies(kg, 'docs', extDocs);
      expect(kg.hasNode('@docs::guide.md::Setup')).toBe(true);
    });

    it('only cleans target graph type', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      createCrossRelation(kg, noteId, 'code', 'auth.ts::Foo', 'depends_on', extCode);
      extDocs.dropNode('guide.md::Setup');
      cleanupProxies(kg, 'docs', extDocs);
      expect(kg.hasNode('@docs::guide.md::Setup')).toBe(false);
      expect(kg.hasNode('@code::auth.ts::Foo')).toBe(true);
    });
  });

  describe('searchKnowledge skips proxy nodes', () => {
    it('proxy not in search results', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const hits = searchKnowledge(kg, unitVec(0), { topK: 10, bfsDepth: 1, minScore: 0 });
      expect(hits.every(h => !h.id.startsWith('@'))).toBe(true);
    });

    it('seed note still found', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const hits = searchKnowledge(kg, unitVec(0), { topK: 10, bfsDepth: 1, minScore: 0.5 });
      expect(hits.map(h => h.id)).toContain(noteId);
    });
  });

  describe('persistence with proxies', () => {
    const XSTORE = '/tmp/knowledge-cross-test';

    afterEach(() => {
      if (fs.existsSync(XSTORE)) fs.rmSync(XSTORE, { recursive: true });
    });

    it('proxy survives save/load', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      saveKnowledgeGraph(kg, XSTORE);
      const loaded = loadKnowledgeGraph(XSTORE);
      expect(loaded.hasNode('@docs::guide.md::Setup')).toBe(true);
      expect(loaded.getNodeAttribute('@docs::guide.md::Setup', 'proxyFor')).toEqual({
        graph: 'docs', nodeId: 'guide.md::Setup',
      });
    });

    it('cross-graph edge survives save/load', () => {
      createCrossRelation(kg, noteId, 'docs', 'guide.md::Setup', 'references', extDocs);
      saveKnowledgeGraph(kg, XSTORE);
      const loaded = loadKnowledgeGraph(XSTORE);
      expect(loaded.hasEdge(noteId, '@docs::guide.md::Setup')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

describe('Attachments (KnowledgeGraphManager)', () => {
  let tmpDir: string;
  let manager: KnowledgeGraphManager;
  let noteId: string;
  const fakeEmbed = (_q: string) => Promise.resolve(unitVec(0));

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-attach-'));
    const graph = createKnowledgeGraph();
    const ctx: GraphManagerContext = {
      markDirty: jest.fn(),
      emit: jest.fn(),
      projectId: 'test',
      projectDir: tmpDir,
    };
    manager = new KnowledgeGraphManager(graph, fakeEmbed, ctx, {});
    noteId = await manager.createNote('Test Note', 'Some content', ['tag']);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });

  describe('addAttachment', () => {
    it('returns metadata for valid attachment', () => {
      const data = Buffer.from('hello world');
      const meta = manager.addAttachment(noteId, 'file.txt', data);
      expect(meta).not.toBeNull();
      expect(meta!.filename).toBe('file.txt');
    });

    it('writes the file to disk', () => {
      const data = Buffer.from('hello world');
      manager.addAttachment(noteId, 'file.txt', data);
      const filePath = path.join(tmpDir, '.notes', noteId, 'file.txt');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
    });

    it('sets mimeType on the metadata', () => {
      const data = Buffer.from('PNG data');
      const meta = manager.addAttachment(noteId, 'image.png', data);
      expect(meta!.mimeType).toBe('image/png');
    });

    it('sets size on the metadata', () => {
      const data = Buffer.from('12345');
      const meta = manager.addAttachment(noteId, 'data.bin', data);
      expect(meta!.size).toBe(5);
    });

    it('updates attachments attribute on graph node', () => {
      const data = Buffer.from('content');
      manager.addAttachment(noteId, 'file.txt', data);
      const attachments = manager.listAttachments(noteId);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe('file.txt');
    });

    it('returns null for missing note', () => {
      const meta = manager.addAttachment('nonexistent', 'file.txt', Buffer.from('x'));
      expect(meta).toBeNull();
    });

    it('returns null for proxy node', () => {
      // Create a proxy by adding a cross relation without validation
      const graph = manager.graph;
      createCrossRelation(graph, noteId, 'docs', 'some-doc', 'references');
      const proxyNodeId = '@docs::some-doc';
      const meta = manager.addAttachment(proxyNodeId, 'file.txt', Buffer.from('x'));
      expect(meta).toBeNull();
    });

    it('sanitizes filename with path separators', () => {
      const data = Buffer.from('content');
      const meta = manager.addAttachment(noteId, '../../../etc/passwd', data);
      // sanitizeFilename strips ".." and "/" so the resulting name is "etcpasswd"
      expect(meta).not.toBeNull();
      expect(meta!.filename).toBe('etcpasswd');
    });

    it('returns null for empty filename after sanitization', () => {
      const meta = manager.addAttachment(noteId, '../../..', Buffer.from('x'));
      expect(meta).toBeNull();
    });

    it('adds multiple attachments', () => {
      manager.addAttachment(noteId, 'a.txt', Buffer.from('a'));
      manager.addAttachment(noteId, 'b.txt', Buffer.from('b'));
      const attachments = manager.listAttachments(noteId);
      expect(attachments).toHaveLength(2);
      const names = attachments.map(a => a.filename).sort();
      expect(names).toEqual(['a.txt', 'b.txt']);
    });
  });

  describe('listAttachments', () => {
    it('returns empty array for note with no attachments', () => {
      expect(manager.listAttachments(noteId)).toEqual([]);
    });

    it('returns empty array for nonexistent note', () => {
      expect(manager.listAttachments('ghost')).toEqual([]);
    });

    it('returns correct list after adding', () => {
      manager.addAttachment(noteId, 'doc.pdf', Buffer.from('pdf'));
      const list = manager.listAttachments(noteId);
      expect(list).toHaveLength(1);
      expect(list[0].filename).toBe('doc.pdf');
    });
  });

  describe('removeAttachment', () => {
    it('returns true when file exists', () => {
      manager.addAttachment(noteId, 'file.txt', Buffer.from('data'));
      expect(manager.removeAttachment(noteId, 'file.txt')).toBe(true);
    });

    it('deletes the file from disk', () => {
      manager.addAttachment(noteId, 'file.txt', Buffer.from('data'));
      manager.removeAttachment(noteId, 'file.txt');
      const filePath = path.join(tmpDir, '.notes', noteId, 'file.txt');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('updates attachments list on graph node', () => {
      manager.addAttachment(noteId, 'a.txt', Buffer.from('a'));
      manager.addAttachment(noteId, 'b.txt', Buffer.from('b'));
      manager.removeAttachment(noteId, 'a.txt');
      const attachments = manager.listAttachments(noteId);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe('b.txt');
    });

    it('returns false for nonexistent file', () => {
      expect(manager.removeAttachment(noteId, 'ghost.txt')).toBe(false);
    });

    it('returns false for missing note', () => {
      expect(manager.removeAttachment('nonexistent', 'file.txt')).toBe(false);
    });

    it('returns false when no projectDir', () => {
      const graph = createKnowledgeGraph();
      const ctx: GraphManagerContext = {
        markDirty: jest.fn(),
        emit: jest.fn(),
        projectId: 'test',
        // no projectDir
      };
      const mgr = new KnowledgeGraphManager(graph, fakeEmbed, ctx, {});
      expect(mgr.removeAttachment('any', 'file.txt')).toBe(false);
    });
  });

  describe('syncAttachments', () => {
    it('updates graph from disk state', () => {
      // Manually write a file to the note directory (bypassing manager)
      const noteDir = path.join(tmpDir, '.notes', noteId);
      fs.mkdirSync(noteDir, { recursive: true });
      fs.writeFileSync(path.join(noteDir, 'manual.txt'), 'external content');

      manager.syncAttachments(noteId);
      const attachments = manager.listAttachments(noteId);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe('manual.txt');
    });

    it('excludes note.md from attachment list', () => {
      // The note.md file (mirror file) should be excluded
      const noteDir = path.join(tmpDir, '.notes', noteId);
      fs.mkdirSync(noteDir, { recursive: true });
      fs.writeFileSync(path.join(noteDir, 'note.md'), '---\nid: test\n---\n# Test');
      fs.writeFileSync(path.join(noteDir, 'image.png'), 'PNG');

      manager.syncAttachments(noteId);
      const attachments = manager.listAttachments(noteId);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe('image.png');
    });

    it('does nothing for missing note', () => {
      // Should not throw
      expect(() => manager.syncAttachments('nonexistent')).not.toThrow();
    });

    it('does nothing for proxy node', () => {
      const graph = manager.graph;
      createCrossRelation(graph, noteId, 'docs', 'some-doc', 'references');
      expect(() => manager.syncAttachments('@docs::some-doc')).not.toThrow();
    });
  });

  describe('getAttachmentPath', () => {
    it('returns path for existing attachment', () => {
      manager.addAttachment(noteId, 'file.txt', Buffer.from('data'));
      const result = manager.getAttachmentPath(noteId, 'file.txt');
      expect(result).not.toBeNull();
      expect(result).toBe(path.join(tmpDir, '.notes', noteId, 'file.txt'));
    });

    it('returns null for nonexistent attachment', () => {
      const result = manager.getAttachmentPath(noteId, 'ghost.txt');
      expect(result).toBeNull();
    });

    it('returns null when no projectDir', () => {
      const graph = createKnowledgeGraph();
      const ctx: GraphManagerContext = {
        markDirty: jest.fn(),
        emit: jest.fn(),
        projectId: 'test',
        // no projectDir
      };
      const mgr = new KnowledgeGraphManager(graph, fakeEmbed, ctx, {});
      expect(mgr.getAttachmentPath('any', 'file.txt')).toBeNull();
    });
  });
});
