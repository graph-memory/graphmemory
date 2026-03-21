/**
 * Tests for search coverage gaps across all search modules:
 * - Hybrid (RRF) mode for knowledge/tasks/skills/docs
 * - Keyword-only mode for knowledge/tasks/skills
 * - BM25-only fallback (vector returned empty)
 * - Proxy node filtering in knowledge/tasks/skills
 * - BFS decay for knowledge/tasks/skills
 * - BFS best-score update (overlapping seeds)
 * - Empty embedding skip
 * - File search: empty embedding, empty graph
 * - BM25: stop-words-only query
 */

import {
  createKnowledgeGraph, createNote, createRelation,
} from '@/graphs/knowledge';
import {
  createTaskGraph, createTask, createTaskRelation,
} from '@/graphs/task';
import {
  createSkillGraph, createSkill, createSkillRelation,
} from '@/graphs/skill';
import { createGraph, updateFile } from '@/graphs/docs';
import { search } from '@/lib/search/docs';
import { searchKnowledge } from '@/lib/search/knowledge';
import { searchTasks } from '@/lib/search/tasks';
import { searchSkills } from '@/lib/search/skills';
import { searchDocFiles, searchCodeFiles } from '@/lib/search/files';
import { searchFileIndex } from '@/lib/search/file-index';
import { BM25Index, tokenize } from '@/lib/search/bm25';
import { createCodeGraph } from '@/graphs/code';
import type { Chunk } from '@/lib/parsers/docs';
import type { KnowledgeNodeAttributes } from '@/graphs/knowledge-types';
import type { TaskNodeAttributes } from '@/graphs/task-types';
import type { SkillNodeAttributes } from '@/graphs/skill-types';
import type { NodeAttributes } from '@/graphs/docs';
import { unitVec } from '@/tests/helpers';

// ---------------------------------------------------------------------------
// Knowledge search — hybrid, keyword, proxy, decay, empty embedding
// ---------------------------------------------------------------------------

describe('searchKnowledge — advanced modes', () => {
  const g = createKnowledgeGraph();
  let n1: string, n2: string, n3: string;
  let bm25: BM25Index<KnowledgeNodeAttributes>;

  beforeAll(() => {
    n1 = createNote(g, 'JWT Authentication', 'How JWT tokens work for auth', ['auth'], unitVec(0));
    n2 = createNote(g, 'Database Setup', 'PostgreSQL configuration and migrations', ['db'], unitVec(1));
    n3 = createNote(g, 'API Rate Limiting', 'Rate limit configuration for REST API', ['api'], unitVec(2));
    createRelation(g, n1, n2, 'relates_to');
    createRelation(g, n2, n3, 'depends_on');

    bm25 = new BM25Index<KnowledgeNodeAttributes>((a) => `${a.title} ${a.content}`);
    g.forEachNode((id, attrs) => {
      if (!(attrs as KnowledgeNodeAttributes).proxyFor) bm25.addDocument(id, attrs as KnowledgeNodeAttributes);
    });
  });

  it('hybrid mode: vector + BM25 fused via RRF', () => {
    const hits = searchKnowledge(g, unitVec(0), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'JWT authentication tokens',
      bm25Index: bm25,
      searchMode: 'hybrid',
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(n1);
  });

  it('keyword-only mode: ignores vector similarity', () => {
    const hits = searchKnowledge(g, unitVec(5), { // axis 5 = no match
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'PostgreSQL migrations',
      bm25Index: bm25,
      searchMode: 'keyword',
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(n2);
  });

  it('BM25-only fallback: when all embeddings empty, falls back to BM25', () => {
    // Create separate graph with empty embeddings
    const gEmpty = createKnowledgeGraph();
    createNote(gEmpty, 'Fallback Note', 'unique-fallback-text', [], []);
    const bm25e = new BM25Index<KnowledgeNodeAttributes>((a) => `${a.title} ${a.content}`);
    gEmpty.forEachNode((id, attrs) => {
      if (!(attrs as KnowledgeNodeAttributes).proxyFor) bm25e.addDocument(id, attrs as KnowledgeNodeAttributes);
    });

    const hits = searchKnowledge(gEmpty, unitVec(0), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'unique-fallback-text',
      bm25Index: bm25e,
      searchMode: 'hybrid',
    });
    expect(hits.length).toBe(1);
    expect(hits[0].title).toBe('Fallback Note');
  });

  it('proxy nodes excluded from vector scoring and results', () => {
    const gProxy = createKnowledgeGraph();
    const realId = createNote(gProxy, 'Real Note', 'real content', [], unitVec(0));
    // Add proxy node manually
    const proxyId = '@code::test::auth.ts';
    gProxy.addNode(proxyId, {
      title: 'Proxy', content: '', tags: [], embedding: unitVec(0),
      version: 1, attachments: [], createdAt: 0, updatedAt: 0,
      proxyFor: { graph: 'code', nodeId: 'auth.ts' },
    } as any);

    const hits = searchKnowledge(gProxy, unitVec(0), { topK: 10, bfsDepth: 0, minScore: 0 });
    const ids = hits.map(h => h.id);
    expect(ids).toContain(realId);
    expect(ids).not.toContain(proxyId);
  });

  it('bfsDecay controls score attenuation per hop', () => {
    const hits = searchKnowledge(g, unitVec(0), {
      topK: 1, bfsDepth: 1, bfsDecay: 0.5, minScore: 0,
    });
    const seed = hits.find(h => h.id === n1);
    const neighbor = hits.find(h => h.id === n2);
    expect(seed).toBeDefined();
    expect(neighbor).toBeDefined();
    expect(neighbor!.score).toBeCloseTo(seed!.score * 0.5, 2);
  });

  it('empty embedding nodes are skipped in vector scoring', () => {
    const gMixed = createKnowledgeGraph();
    createNote(gMixed, 'Has Embedding', 'content', [], unitVec(0));
    createNote(gMixed, 'No Embedding', 'content', [], []); // empty embedding

    const hits = searchKnowledge(gMixed, unitVec(0), { topK: 10, bfsDepth: 0, minScore: 0 });
    // Only the note with embedding should appear
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('Has Embedding');
  });

  it('maxResults caps final output', () => {
    const hits = searchKnowledge(g, unitVec(0), {
      topK: 5, bfsDepth: 2, maxResults: 1, minScore: 0,
    });
    expect(hits).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Task search — hybrid, keyword, proxy, decay
// ---------------------------------------------------------------------------

describe('searchTasks — advanced modes', () => {
  const g = createTaskGraph();
  let t1: string, t2: string;
  let bm25: BM25Index<TaskNodeAttributes>;

  beforeAll(() => {
    t1 = createTask(g, 'Fix Login Bug', 'Login redirect broken after OAuth', 'todo', 'high', ['bug'], unitVec(0));
    t2 = createTask(g, 'Add Caching', 'Redis cache layer for API', 'backlog', 'medium', ['feature'], unitVec(1));
    createTaskRelation(g, t1, t2, 'related_to');

    bm25 = new BM25Index<TaskNodeAttributes>((a) => `${a.title} ${a.description}`);
    g.forEachNode((id, attrs) => {
      if (!(attrs as TaskNodeAttributes).proxyFor) bm25.addDocument(id, attrs as TaskNodeAttributes);
    });
  });

  it('hybrid mode', () => {
    const hits = searchTasks(g, unitVec(0), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'login OAuth redirect',
      bm25Index: bm25,
      searchMode: 'hybrid',
    });
    expect(hits[0].id).toBe(t1);
  });

  it('keyword-only mode', () => {
    const hits = searchTasks(g, unitVec(5), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'Redis cache',
      bm25Index: bm25,
      searchMode: 'keyword',
    });
    expect(hits[0].id).toBe(t2);
  });

  it('proxy nodes excluded', () => {
    const gP = createTaskGraph();
    const realId = createTask(gP, 'Real Task', '', 'todo', 'low', [], unitVec(0));
    gP.addNode('@docs::test::api.md', {
      title: 'Proxy', description: '', status: 'todo', priority: 'low',
      tags: [], dueDate: null, estimate: null, completedAt: null, assignee: null,
      version: 1, embedding: unitVec(0), attachments: [], createdAt: 0, updatedAt: 0,
      proxyFor: { graph: 'docs', nodeId: 'api.md' },
    } as any);

    const hits = searchTasks(gP, unitVec(0), { topK: 10, bfsDepth: 0, minScore: 0 });
    expect(hits.map(h => h.id)).not.toContain('@docs::test::api.md');
    expect(hits.some(h => h.id === realId)).toBe(true);
  });

  it('bfsDecay', () => {
    const hits = searchTasks(g, unitVec(0), {
      topK: 1, bfsDepth: 1, bfsDecay: 0.7, minScore: 0,
    });
    const seed = hits.find(h => h.id === t1)!;
    const neighbor = hits.find(h => h.id === t2);
    expect(neighbor).toBeDefined();
    expect(neighbor!.score).toBeCloseTo(seed.score * 0.7, 2);
  });
});

// ---------------------------------------------------------------------------
// Skill search — hybrid, keyword, proxy, decay
// ---------------------------------------------------------------------------

describe('searchSkills — advanced modes', () => {
  const g = createSkillGraph();
  let s1: string, s2: string;
  let bm25: BM25Index<SkillNodeAttributes>;

  beforeAll(() => {
    s1 = createSkill(g, 'Deploy to K8s', 'How to deploy with kubectl', [], ['deploy'], [], [], [], 'user', 1, unitVec(0));
    s2 = createSkill(g, 'Database Migration', 'Run Prisma migrations', [], ['migrate'], [], [], [], 'learned', 0.8, unitVec(1));
    createSkillRelation(g, s1, s2, 'related_to');

    bm25 = new BM25Index<SkillNodeAttributes>((a) => `${a.title} ${a.description}`);
    g.forEachNode((id, attrs) => {
      if (!(attrs as SkillNodeAttributes).proxyFor) bm25.addDocument(id, attrs as SkillNodeAttributes);
    });
  });

  it('hybrid mode', () => {
    const hits = searchSkills(g, unitVec(0), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'kubectl deploy kubernetes',
      bm25Index: bm25,
      searchMode: 'hybrid',
    });
    expect(hits[0].id).toBe(s1);
  });

  it('keyword-only mode', () => {
    const hits = searchSkills(g, unitVec(5), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'Prisma migration',
      bm25Index: bm25,
      searchMode: 'keyword',
    });
    expect(hits[0].id).toBe(s2);
  });

  it('proxy nodes excluded', () => {
    const gP = createSkillGraph();
    createSkill(gP, 'Real Skill', '', [], [], [], [], [], 'user', 1, unitVec(0));
    gP.addNode('@knowledge::test::note-1', {
      title: 'Proxy', description: '', steps: [], triggers: [], inputHints: [],
      filePatterns: [], tags: [], source: 'user', confidence: 1, usageCount: 0, lastUsedAt: null,
      version: 1, embedding: unitVec(0), attachments: [], createdAt: 0, updatedAt: 0,
      proxyFor: { graph: 'knowledge', nodeId: 'note-1' },
    } as any);

    const hits = searchSkills(gP, unitVec(0), { topK: 10, bfsDepth: 0, minScore: 0 });
    expect(hits.map(h => h.id)).not.toContain('@knowledge::test::note-1');
  });

  it('bfsDecay + depth=0 returns only seed', () => {
    const hits = searchSkills(g, unitVec(0), {
      topK: 1, bfsDepth: 0, minScore: 0,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(s1);
  });

  it('bfsDecay controls score', () => {
    const hits = searchSkills(g, unitVec(0), {
      topK: 1, bfsDepth: 1, bfsDecay: 0.6, minScore: 0,
    });
    const seed = hits.find(h => h.id === s1)!;
    const neighbor = hits.find(h => h.id === s2);
    expect(neighbor).toBeDefined();
    expect(neighbor!.score).toBeCloseTo(seed.score * 0.6, 2);
  });
});

// ---------------------------------------------------------------------------
// Doc search — hybrid, BFS best-score overlap
// ---------------------------------------------------------------------------

describe('search docs — hybrid and BFS best-score', () => {
  const graph = createGraph();
  let bm25: BM25Index<NodeAttributes>;

  beforeAll(() => {
    const chunks: Chunk[] = [
      { id: 'jwt.md', fileId: 'jwt.md', title: 'JWT Guide', content: 'JWT authentication tokens', level: 1, links: ['api.md'], embedding: unitVec(0), symbols: [] },
      { id: 'jwt.md::Flow', fileId: 'jwt.md', title: 'Flow', content: 'Token rotation refresh', level: 2, links: [], embedding: unitVec(1), symbols: [] },
      { id: 'api.md', fileId: 'api.md', title: 'API Docs', content: 'REST API endpoints', level: 1, links: ['jwt.md'], embedding: unitVec(2), symbols: [] },
      { id: 'api.md::Users', fileId: 'api.md', title: 'Users', content: 'User management endpoints', level: 2, links: [], embedding: unitVec(3), symbols: [] },
    ];
    updateFile(graph, chunks.filter(c => c.fileId === 'api.md'), 1000);
    updateFile(graph, chunks.filter(c => c.fileId === 'jwt.md'), 1000);

    bm25 = new BM25Index<NodeAttributes>((a) => `${a.title} ${a.content}`);
    graph.forEachNode((id, attrs) => bm25.addDocument(id, attrs));
  });

  it('hybrid mode: combines vector and BM25', () => {
    const hits = search(graph, unitVec(0), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'JWT authentication',
      bm25Index: bm25,
      searchMode: 'hybrid',
    });
    expect(hits[0].id).toBe('jwt.md');
  });

  it('keyword-only mode', () => {
    const hits = search(graph, unitVec(7), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'REST endpoints',
      bm25Index: bm25,
      searchMode: 'keyword',
    });
    expect(hits[0].id).toBe('api.md');
  });

  it('BFS best-score: overlapping seeds keep highest score', () => {
    // Both jwt.md and api.md are seeds (different axes)
    // They link to each other, so BFS from jwt.md reaches api.md and vice versa
    // api.md should keep its direct vector score, not the decayed BFS score
    const hits = search(graph, unitVec(2), {
      topK: 2, bfsDepth: 1, minScore: 0, bfsDecay: 0.5,
    });
    const apiHit = hits.find(h => h.id === 'api.md');
    expect(apiHit).toBeDefined();
    // api.md's direct score (1.0) should be kept, not BFS decayed score from jwt.md
    expect(apiHit!.score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// File search — empty embedding, empty graph
// ---------------------------------------------------------------------------

describe('searchDocFiles — edge cases', () => {
  it('empty graph returns []', () => {
    const graph = createGraph();
    const hits = searchDocFiles(graph, unitVec(0));
    expect(hits).toHaveLength(0);
  });

  it('nodes without fileEmbedding are skipped', () => {
    const graph = createGraph();
    const chunks: Chunk[] = [
      { id: 'no-embed.md', fileId: 'no-embed.md', title: 'No Embed', content: 'test', level: 1, links: [], embedding: unitVec(0), symbols: [] },
    ];
    updateFile(graph, chunks, 1000);
    // fileEmbedding is [] by default (not set by test)
    const hits = searchDocFiles(graph, unitVec(0));
    expect(hits).toHaveLength(0);
  });

  it('nodes with fileEmbedding are scored', () => {
    const graph = createGraph();
    const chunks: Chunk[] = [
      { id: 'has-embed.md', fileId: 'has-embed.md', title: 'Has Embed', content: 'test', level: 1, links: [], embedding: unitVec(0), symbols: [] },
    ];
    updateFile(graph, chunks, 1000);
    graph.setNodeAttribute('has-embed.md', 'fileEmbedding', unitVec(0));
    const hits = searchDocFiles(graph, unitVec(0));
    expect(hits).toHaveLength(1);
    expect(hits[0].score).toBe(1.0);
  });
});

describe('searchCodeFiles — edge cases', () => {
  it('empty graph returns []', () => {
    const graph = createCodeGraph();
    const hits = searchCodeFiles(graph, unitVec(0));
    expect(hits).toHaveLength(0);
  });

  it('file without fileEmbedding is skipped', () => {
    const { updateCodeFile } = require('@/graphs/code');
    const graph = createCodeGraph();
    updateCodeFile(graph, {
      fileId: 'x.ts', mtime: 1000,
      nodes: [{ id: 'x.ts', attrs: { kind: 'file', fileId: 'x.ts', name: 'x.ts', signature: '', docComment: '', body: '', startLine: 1, endLine: 1, isExported: false, embedding: [], fileEmbedding: [], mtime: 1000 } }],
      edges: [],
    });
    const hits = searchCodeFiles(graph, unitVec(0));
    expect(hits).toHaveLength(0);
  });
});

describe('searchFileIndex — edge cases', () => {
  it('empty graph returns []', () => {
    const { createFileIndexGraph } = require('@/graphs/file-index-types');
    const graph = createFileIndexGraph();
    const hits = searchFileIndex(graph, unitVec(0));
    expect(hits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// BM25 edge cases
// ---------------------------------------------------------------------------

describe('BM25 — stop-words-only query', () => {
  it('query with only stop words returns empty tokens', () => {
    const tokens = tokenize('the a an and or but');
    expect(tokens).toHaveLength(0);
  });

  it('stop-words-only query returns empty scores', () => {
    const idx = new BM25Index((d: { t: string }) => d.t);
    idx.addDocument('a', { t: 'the quick brown fox' });
    const scores = idx.score('the a an');
    expect(scores.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Score normalization after BM25/RRF
// ---------------------------------------------------------------------------

describe('score normalization', () => {
  it('BM25-only scores are normalized to 0-1 range', () => {
    const g = createKnowledgeGraph();
    const n1 = createNote(g, 'Target', 'unique-target-word repeated unique-target-word', ['x'], unitVec(0));
    createNote(g, 'Other', 'irrelevant content here', ['y'], unitVec(1));

    const bm25 = new BM25Index<KnowledgeNodeAttributes>((a) => `${a.title} ${a.content}`);
    g.forEachNode((id, attrs) => {
      if (!(attrs as KnowledgeNodeAttributes).proxyFor) bm25.addDocument(id, attrs as KnowledgeNodeAttributes);
    });

    const hits = searchKnowledge(g, unitVec(5), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'unique-target-word',
      bm25Index: bm25,
      searchMode: 'keyword',
    });

    // Top hit should have normalized score of 1.0 (it's the max)
    expect(hits[0].id).toBe(n1);
    expect(hits[0].score).toBe(1.0);
  });

  it('hybrid RRF scores are normalized to 0-1 range', () => {
    const g = createKnowledgeGraph();
    createNote(g, 'Both Match', 'keyword-match content', [], unitVec(0));
    createNote(g, 'Vector Only', 'other stuff', [], unitVec(1));

    const bm25 = new BM25Index<KnowledgeNodeAttributes>((a) => `${a.title} ${a.content}`);
    g.forEachNode((id, attrs) => {
      if (!(attrs as KnowledgeNodeAttributes).proxyFor) bm25.addDocument(id, attrs as KnowledgeNodeAttributes);
    });

    const hits = searchKnowledge(g, unitVec(0), {
      topK: 5, bfsDepth: 0, minScore: 0,
      queryText: 'keyword-match',
      bm25Index: bm25,
      searchMode: 'hybrid',
    });

    // All scores should be <= 1.0
    for (const h of hits) {
      expect(h.score).toBeLessThanOrEqual(1.0);
      expect(h.score).toBeGreaterThanOrEqual(0);
    }
  });
});
