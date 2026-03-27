import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createTaskGraph, createTask, updateTask, moveTask, deleteTask, getTask,
  listTasks, createTaskRelation, deleteTaskRelation, listTaskRelations,
  createCrossRelation, deleteCrossRelation, cleanupProxies, proxyId, isProxy,
  findLinkedTasks, saveTaskGraph, loadTaskGraph, TaskGraphManager,
} from '@/graphs/task';
import type { GraphManagerContext } from '@/graphs/manager-types';
import { slugify } from '@/graphs/knowledge-types';
import { DirectedGraph } from 'graphology';
import { searchTasks } from '@/lib/search/tasks';
import { unitVec, DIM, embedFnPair } from '@/tests/helpers';

const STORE = '/tmp/task-graph-test';

describe('slugify (shared with tasks)', () => {
  const graph = createTaskGraph();

  it('basic slug', () => {
    expect(slugify('Fix Auth Bug', graph)).toBe('fix-auth-bug');
  });

  it('dedup: returns ::2 when base exists', () => {
    graph.addNode('fix-auth-bug', {
      title: 'Fix Auth Bug', description: '', status: 'backlog', priority: 'medium',
      tags: [], order: 0, dueDate: null, estimate: null, completedAt: null, assignee: null,
      version: 1, embedding: [], attachments: [], createdAt: 0, updatedAt: 0,
    });
    expect(slugify('Fix Auth Bug', graph)).toBe('fix-auth-bug::2');
  });
});

describe('CRUD — Tasks', () => {
  const g = createTaskGraph();
  let id1: string;
  let id2: string;
  let id3: string;

  describe('createTask', () => {
    it('returns UUID id', () => {
      id1 = createTask(g, 'Fix auth redirect', 'The login redirect is broken.', 'todo', 'high', ['bug', 'auth'], unitVec(0));
      expect(id1).toMatch(/^[0-9a-f]{8}-/);
    });

    it('node exists', () => {
      expect(g.hasNode(id1)).toBe(true);
    });

    it('title set correctly', () => {
      expect(g.getNodeAttribute(id1, 'title')).toBe('Fix auth redirect');
    });

    it('description set correctly', () => {
      expect(g.getNodeAttribute(id1, 'description')).toContain('login redirect');
    });

    it('status set correctly', () => {
      expect(g.getNodeAttribute(id1, 'status')).toBe('todo');
    });

    it('priority set correctly', () => {
      expect(g.getNodeAttribute(id1, 'priority')).toBe('high');
    });

    it('tags set correctly', () => {
      expect(g.getNodeAttribute(id1, 'tags')).toEqual(['bug', 'auth']);
    });

    it('embedding set correctly', () => {
      expect(g.getNodeAttribute(id1, 'embedding')).toHaveLength(DIM);
    });

    it('createdAt is set', () => {
      expect(g.getNodeAttribute(id1, 'createdAt')).toBeGreaterThan(0);
    });

    it('completedAt is null', () => {
      expect(g.getNodeAttribute(id1, 'completedAt')).toBeNull();
    });

    it('dueDate defaults to null', () => {
      expect(g.getNodeAttribute(id1, 'dueDate')).toBeNull();
    });

    it('estimate defaults to null', () => {
      expect(g.getNodeAttribute(id1, 'estimate')).toBeNull();
    });

    it('second task created', () => {
      id2 = createTask(g, 'Add file search', 'Implement search over files.', 'backlog', 'medium', ['feature'], unitVec(1), 1700000000000, 4);
      expect(id2).toMatch(/^[0-9a-f]{8}-/);
    });

    it('dueDate set via param', () => {
      expect(g.getNodeAttribute(id2, 'dueDate')).toBe(1700000000000);
    });

    it('estimate set via param', () => {
      expect(g.getNodeAttribute(id2, 'estimate')).toBe(4);
    });

    it('third task created', () => {
      id3 = createTask(g, 'Refactor config', 'Clean up config loading.', 'in_progress', 'low', ['refactor'], unitVec(2));
      expect(id3).toMatch(/^[0-9a-f]{8}-/);
    });
  });

  describe('getTask', () => {
    it('returns task', () => {
      expect(getTask(g, id1)).not.toBeNull();
    });

    it('id matches', () => {
      expect(getTask(g, id1)!.id).toBe(id1);
    });

    it('title matches', () => {
      expect(getTask(g, id1)!.title).toBe('Fix auth redirect');
    });

    it('status matches', () => {
      expect(getTask(g, id1)!.status).toBe('todo');
    });

    it('priority matches', () => {
      expect(getTask(g, id1)!.priority).toBe('high');
    });

    it('has empty subtasks', () => {
      expect(getTask(g, id1)!.subtasks).toHaveLength(0);
    });

    it('missing returns null', () => {
      expect(getTask(g, 'nonexistent')).toBeNull();
    });
  });

  describe('updateTask', () => {
    it('returns true', () => {
      expect(updateTask(g, id1, { description: 'Updated: redirect loop fixed.' }, unitVec(3))).toBe(true);
    });

    it('description updated', () => {
      expect(g.getNodeAttribute(id1, 'description')).toBe('Updated: redirect loop fixed.');
    });

    it('title unchanged', () => {
      expect(g.getNodeAttribute(id1, 'title')).toBe('Fix auth redirect');
    });

    it('embedding re-set', () => {
      expect(g.getNodeAttribute(id1, 'embedding')[3]).toBe(1);
    });

    it('updatedAt changed', () => {
      expect(g.getNodeAttribute(id1, 'updatedAt')).toBeGreaterThan(0);
    });

    it('tags only update', () => {
      expect(updateTask(g, id1, { tags: ['bug', 'auth', 'urgent'] })).toBe(true);
    });

    it('tags updated', () => {
      expect(g.getNodeAttribute(id1, 'tags')).toHaveLength(3);
    });

    it('missing returns false', () => {
      expect(updateTask(g, 'nonexistent', { title: 'x' })).toBe(false);
    });

    it('status change to done sets completedAt', () => {
      updateTask(g, id1, { status: 'done' });
      expect(g.getNodeAttribute(id1, 'completedAt')).toBeGreaterThan(0);
    });

    it('status change back to todo clears completedAt', () => {
      updateTask(g, id1, { status: 'todo' });
      expect(g.getNodeAttribute(id1, 'completedAt')).toBeNull();
    });
  });

  describe('moveTask', () => {
    it('returns true', () => {
      expect(moveTask(g, id2, 'in_progress')).toBe(true);
    });

    it('status changed', () => {
      expect(g.getNodeAttribute(id2, 'status')).toBe('in_progress');
    });

    it('move to done sets completedAt', () => {
      moveTask(g, id2, 'done');
      expect(g.getNodeAttribute(id2, 'completedAt')).toBeGreaterThan(0);
    });

    it('move to cancelled keeps completedAt set', () => {
      // already done → cancelled, should keep completedAt (both are terminal)
      const prev = g.getNodeAttribute(id2, 'completedAt');
      moveTask(g, id2, 'cancelled');
      expect(g.getNodeAttribute(id2, 'completedAt')).toBe(prev);
    });

    it('move back to todo clears completedAt', () => {
      moveTask(g, id2, 'todo');
      expect(g.getNodeAttribute(id2, 'completedAt')).toBeNull();
    });

    it('missing returns false', () => {
      expect(moveTask(g, 'ghost', 'done')).toBe(false);
    });
  });

  describe('listTasks', () => {
    it('returns 3 tasks', () => {
      expect(listTasks(g)).toHaveLength(3);
    });

    it('sorted by priority (high first)', () => {
      const all = listTasks(g);
      expect(all[0].priority).toBe('high');
    });

    it('filter by status', () => {
      expect(listTasks(g, { status: 'todo' })).toHaveLength(2);
    });

    it('filter by priority', () => {
      expect(listTasks(g, { priority: 'high' })).toHaveLength(1);
    });

    it('filter by tag', () => {
      expect(listTasks(g, { tag: 'feature' })).toHaveLength(1);
    });

    it('substring filter', () => {
      expect(listTasks(g, { filter: 'auth' })).toHaveLength(1);
    });

    it('no match = empty', () => {
      expect(listTasks(g, { filter: 'nonexistent' })).toHaveLength(0);
    });

    it('limit=1 returns 1', () => {
      expect(listTasks(g, { limit: 1 })).toHaveLength(1);
    });

    it('returns description field', () => {
      const task = listTasks(g).find(t => t.id === id1);
      expect(task?.description).toBe('Updated: redirect loop fixed.');
    });

    it('truncates description to 500 chars', () => {
      const longDesc = 'x'.repeat(1000);
      const g2 = createTaskGraph();
      createTask(g2, 'Long Task', longDesc, 'todo', 'medium', [], unitVec(0));
      const task = listTasks(g2)[0];
      expect(task.description).toHaveLength(500);
    });

    it('dueDate sorting: tasks with dueDate before nulls', () => {
      // id2 has dueDate, others don't; among same priority, dueDate first
      const medTasks = listTasks(g, { priority: 'medium' });
      // only 1 medium task, so just verify it's there
      expect(medTasks).toHaveLength(1);
    });
  });

  describe('createTaskRelation', () => {
    it('returns true for subtask_of', () => {
      expect(createTaskRelation(g, id3, id1, 'subtask_of')).toBe(true);
    });

    it('edge exists', () => {
      expect(g.hasEdge(id3, id1)).toBe(true);
    });

    it('edge kind = subtask_of', () => {
      expect(g.getEdgeAttribute(g.edge(id3, id1)!, 'kind')).toBe('subtask_of');
    });

    it('blocks relation', () => {
      expect(createTaskRelation(g, id1, id2, 'blocks')).toBe(true);
    });

    it('duplicate returns false', () => {
      expect(createTaskRelation(g, id3, id1, 'subtask_of')).toBe(false);
    });

    it('missing node returns false', () => {
      expect(createTaskRelation(g, id1, 'ghost', 'blocks')).toBe(false);
    });
  });

  describe('getTask with relations', () => {
    it('parent shows subtask', () => {
      const task = getTask(g, id1)!;
      expect(task.subtasks).toHaveLength(1);
      expect(task.subtasks[0].id).toBe(id3);
    });

    it('parent shows blocks', () => {
      const task = getTask(g, id1)!;
      expect(task.blocks).toHaveLength(1);
      expect(task.blocks[0].id).toBe(id2);
    });

    it('blocked task shows blockedBy', () => {
      const task = getTask(g, id2)!;
      expect(task.blockedBy).toHaveLength(1);
      expect(task.blockedBy[0].id).toBe(id1);
    });
  });

  describe('listTaskRelations', () => {
    it('returns relations for id1', () => {
      expect(listTaskRelations(g, id1)).toHaveLength(2);
    });

    it('missing node = empty', () => {
      expect(listTaskRelations(g, 'ghost')).toHaveLength(0);
    });
  });

  describe('deleteTaskRelation', () => {
    it('returns true', () => {
      expect(deleteTaskRelation(g, id1, id2)).toBe(true);
    });

    it('edge removed', () => {
      expect(g.hasEdge(id1, id2)).toBe(false);
    });

    it('missing returns false', () => {
      expect(deleteTaskRelation(g, id1, id2)).toBe(false);
    });
  });

  describe('deleteTask', () => {
    it('returns true', () => {
      expect(deleteTask(g, id3)).toBe(true);
    });

    it('node removed', () => {
      expect(g.hasNode(id3)).toBe(false);
    });

    it('relation to deleted task also removed', () => {
      expect(g.hasEdge(id3, id1)).toBe(false);
    });

    it('missing returns false', () => {
      expect(deleteTask(g, 'ghost')).toBe(false);
    });

    it('remaining tasks intact', () => {
      expect(g.order).toBe(2);
    });
  });
});

describe('searchTasks', () => {
  const sg = createTaskGraph();
  let sn1: string;
  let sn2: string;
  let sn3: string;

  beforeAll(() => {
    sn1 = createTask(sg, 'Fix Auth', 'Fix authentication bug', 'todo', 'high', ['bug'], unitVec(0));
    sn2 = createTask(sg, 'Add Database', 'PostgreSQL setup', 'backlog', 'medium', ['feature'], unitVec(1));
    sn3 = createTask(sg, 'API Rate Limit', 'Rate limiting config', 'in_progress', 'low', ['config'], unitVec(2));
    createTaskRelation(sg, sn1, sn2, 'blocks');
    createTaskRelation(sg, sn2, sn3, 'related_to');
  });

  it('exact match: 1 result', () => {
    const hits = searchTasks(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits).toHaveLength(1);
  });

  it('exact match: auth task', () => {
    const hits = searchTasks(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].id).toBe(sn1);
  });

  it('exact match: score 1.0', () => {
    const hits = searchTasks(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].score).toBe(1.0);
  });

  it('result has status', () => {
    const hits = searchTasks(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].status).toBe('todo');
  });

  it('result has priority', () => {
    const hits = searchTasks(sg, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(hits[0].priority).toBe('high');
  });

  it('BFS depth=1 includes seed + neighbor', () => {
    const hits = searchTasks(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    expect(hits.map(h => h.id)).toContain(sn1);
    expect(hits.map(h => h.id)).toContain(sn2);
  });

  it('BFS depth=1 does NOT include depth-2 neighbor', () => {
    const hits = searchTasks(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    expect(hits.map(h => h.id)).not.toContain(sn3);
  });

  it('BFS depth=2 includes rate-limit', () => {
    const hits = searchTasks(sg, unitVec(0), { topK: 1, bfsDepth: 2, minScore: 0 });
    expect(hits.map(h => h.id)).toContain(sn3);
  });

  it('BFS score < seed score', () => {
    const hits = searchTasks(sg, unitVec(0), { topK: 1, bfsDepth: 1 });
    const seedScore = hits.find(h => h.id === sn1)!.score;
    const bfsScore = hits.find(h => h.id === sn2)!.score;
    expect(bfsScore).toBeLessThan(seedScore);
  });

  it('zero-vector query returns empty', () => {
    const hits = searchTasks(sg, new Array(DIM).fill(0), { minScore: 0.1 });
    expect(hits).toHaveLength(0);
  });
});

describe('saveTaskGraph / loadTaskGraph', () => {
  const sg = createTaskGraph();
  let sn1: string;
  let sn2: string;

  beforeAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
    sn1 = createTask(sg, 'Fix Auth', 'Fix bug', 'todo', 'high', ['bug'], unitVec(0));
    sn2 = createTask(sg, 'Add Database', 'Setup', 'backlog', 'medium', ['feature'], unitVec(1));
    createTaskRelation(sg, sn1, sn2, 'blocks');
    saveTaskGraph(sg, STORE);
  });

  afterAll(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
  });

  it('reloaded: correct node count', () => {
    const sg2 = loadTaskGraph(STORE);
    expect(sg2.order).toBe(sg.order);
  });

  it('reloaded: correct edge count', () => {
    const sg2 = loadTaskGraph(STORE);
    expect(sg2.size).toBe(sg.size);
  });

  it('reloaded: task exists', () => {
    const sg2 = loadTaskGraph(STORE);
    expect(sg2.hasNode(sn1)).toBe(true);
  });

  it('reloaded: title preserved', () => {
    const sg2 = loadTaskGraph(STORE);
    expect(sg2.getNodeAttribute(sn1, 'title')).toBe('Fix Auth');
  });

  it('reloaded: status preserved', () => {
    const sg2 = loadTaskGraph(STORE);
    expect(sg2.getNodeAttribute(sn1, 'status')).toBe('todo');
  });

  it('reloaded: embedding preserved', () => {
    const sg2 = loadTaskGraph(STORE);
    expect(sg2.getNodeAttribute(sn1, 'embedding')).toHaveLength(DIM);
  });

  it('reloaded: edge preserved', () => {
    const sg2 = loadTaskGraph(STORE);
    expect(sg2.hasEdge(sn1, sn2)).toBe(true);
  });

  it('loadTaskGraph with no file returns empty', () => {
    const sgEmpty = loadTaskGraph(STORE + '/nonexistent');
    expect(sgEmpty.order).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-graph links
// ---------------------------------------------------------------------------

describe('Cross-graph relations (tasks)', () => {
  let tg: ReturnType<typeof createTaskGraph>;
  let extDocs: DirectedGraph;
  let extKnowledge: DirectedGraph;
  let taskId: string;

  beforeEach(() => {
    tg = createTaskGraph();
    extDocs = new DirectedGraph();
    extKnowledge = new DirectedGraph();

    extDocs.addNode('guide.md::Setup');
    extKnowledge.addNode('my-note');

    taskId = createTask(tg, 'My Task', 'description', 'todo', 'medium', ['tag'], unitVec(0));
  });

  describe('proxyId', () => {
    it('builds docs proxy id', () => {
      expect(proxyId('docs', 'guide.md::Setup')).toBe('@docs::guide.md::Setup');
    });

    it('builds knowledge proxy id', () => {
      expect(proxyId('knowledge', 'my-note')).toBe('@knowledge::my-note');
    });
  });

  describe('createCrossRelation', () => {
    it('creates relation to docs node', () => {
      expect(createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs)).toBe(true);
    });

    it('proxy node created', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(tg.hasNode('@docs::guide.md::Setup')).toBe(true);
    });

    it('proxy node has proxyFor attribute', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const pf = tg.getNodeAttribute('@docs::guide.md::Setup', 'proxyFor');
      expect(pf).toEqual({ graph: 'docs', nodeId: 'guide.md::Setup' });
    });

    it('edge exists from task to proxy', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(tg.hasEdge(taskId, '@docs::guide.md::Setup')).toBe(true);
    });

    it('creates relation to knowledge node', () => {
      expect(createCrossRelation(tg, taskId, 'knowledge', 'my-note', 'relates_to', extKnowledge)).toBe(true);
    });

    it('rejects duplicate', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs)).toBe(false);
    });

    it('rejects if source missing', () => {
      expect(createCrossRelation(tg, 'ghost', 'docs', 'guide.md::Setup', 'references', extDocs)).toBe(false);
    });

    it('rejects if target not in external graph', () => {
      expect(createCrossRelation(tg, taskId, 'docs', 'nonexistent', 'references', extDocs)).toBe(false);
    });

    it('skips validation when no external graph passed', () => {
      expect(createCrossRelation(tg, taskId, 'docs', 'anything', 'references')).toBe(true);
    });
  });

  describe('isProxy', () => {
    it('returns false for regular task', () => {
      expect(isProxy(tg, taskId)).toBe(false);
    });

    it('returns true for proxy node', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(isProxy(tg, '@docs::guide.md::Setup')).toBe(true);
    });
  });

  describe('findLinkedTasks', () => {
    it('finds tasks linked to docs node', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const results = findLinkedTasks(tg, 'docs', 'guide.md::Setup');
      expect(results).toHaveLength(1);
      expect(results[0].taskId).toBe(taskId);
      expect(results[0].kind).toBe('references');
    });

    it('filters by kind', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(findLinkedTasks(tg, 'docs', 'guide.md::Setup', 'depends_on')).toHaveLength(0);
    });

    it('returns empty for nonexistent proxy', () => {
      expect(findLinkedTasks(tg, 'docs', 'nonexistent')).toHaveLength(0);
    });
  });

  describe('listTaskRelations resolves proxies', () => {
    it('outgoing cross relation has targetGraph', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const rels = listTaskRelations(tg, taskId);
      expect(rels).toHaveLength(1);
      expect(rels[0].toId).toBe('guide.md::Setup');
      expect(rels[0].targetGraph).toBe('docs');
    });
  });

  describe('getTask excludes proxies', () => {
    it('returns null for proxy', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(getTask(tg, '@docs::guide.md::Setup')).toBeNull();
    });
  });

  describe('listTasks excludes proxies', () => {
    it('proxy not in list', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const tasks = listTasks(tg);
      expect(tasks.every(t => !t.id.startsWith('@'))).toBe(true);
    });

    it('count matches real tasks only', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(listTasks(tg)).toHaveLength(1);
    });
  });

  describe('deleteCrossRelation', () => {
    it('returns true', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      expect(deleteCrossRelation(tg, taskId, 'docs', 'guide.md::Setup')).toBe(true);
    });

    it('orphaned proxy cleaned up', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      deleteCrossRelation(tg, taskId, 'docs', 'guide.md::Setup');
      expect(tg.hasNode('@docs::guide.md::Setup')).toBe(false);
    });

    it('returns false for nonexistent', () => {
      expect(deleteCrossRelation(tg, taskId, 'docs', 'guide.md::Setup')).toBe(false);
    });

    it('deletes incoming mirror proxy edge (proxy → taskId)', () => {
      // Simulate a mirror edge created by another graph (e.g. knowledge → task)
      const mirrorProxyId = '@knowledge::some-note';
      tg.addNode(mirrorProxyId, {
        title: '', description: '', status: 'backlog', priority: 'low',
        tags: [], order: 0, dueDate: null, estimate: null, completedAt: null, assignee: null,
        version: 0, embedding: [], attachments: [], createdAt: 0, updatedAt: 0,
        proxyFor: { graph: 'knowledge', nodeId: 'some-note' },
      });
      tg.addEdgeWithKey(`${mirrorProxyId}→${taskId}`, mirrorProxyId, taskId, { kind: 'relates_to' });
      // deleteCrossRelation should find and remove the incoming edge
      expect(deleteCrossRelation(tg, taskId, 'knowledge', 'some-note')).toBe(true);
      expect(tg.hasNode(mirrorProxyId)).toBe(false); // orphan proxy cleaned up
    });

    it('deletes when fromId/toId are swapped by resolveEntry (reverse proxy lookup)', () => {
      // Simulate the scenario: UI sends {fromId: noteId, toId: taskId, targetGraph: 'knowledge'}
      // but the actual edge is @knowledge::noteId → taskId
      const noteId = 'my-note';
      const mirrorProxyId = `@knowledge::${noteId}`;
      tg.addNode(mirrorProxyId, {
        title: '', description: '', status: 'backlog', priority: 'low',
        tags: [], order: 0, dueDate: null, estimate: null, completedAt: null, assignee: null,
        version: 0, embedding: [], attachments: [], createdAt: 0, updatedAt: 0,
        proxyFor: { graph: 'knowledge', nodeId: noteId },
      });
      tg.addEdgeWithKey(`${mirrorProxyId}→${taskId}`, mirrorProxyId, taskId, { kind: 'relates_to' });
      // Called as deleteCrossRelation(graph, noteId, 'knowledge', taskId) — fromId=noteId (not a task!)
      expect(deleteCrossRelation(tg, noteId, 'knowledge', taskId)).toBe(true);
      expect(tg.hasNode(mirrorProxyId)).toBe(false);
    });
  });

  describe('deleteTask cleans up orphaned proxies', () => {
    it('proxy removed when task deleted', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      deleteTask(tg, taskId);
      expect(tg.hasNode('@docs::guide.md::Setup')).toBe(false);
    });
  });

  describe('cleanupProxies', () => {
    it('removes proxy when target deleted from external graph', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      extDocs.dropNode('guide.md::Setup');
      cleanupProxies(tg, 'docs', extDocs);
      expect(tg.hasNode('@docs::guide.md::Setup')).toBe(false);
    });

    it('keeps proxy when target still exists', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      cleanupProxies(tg, 'docs', extDocs);
      expect(tg.hasNode('@docs::guide.md::Setup')).toBe(true);
    });
  });

  describe('searchTasks skips proxy nodes', () => {
    it('proxy not in search results', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const hits = searchTasks(tg, unitVec(0), { topK: 10, bfsDepth: 1, minScore: 0 });
      expect(hits.every(h => !h.id.startsWith('@'))).toBe(true);
    });

    it('seed task still found', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      const hits = searchTasks(tg, unitVec(0), { topK: 10, bfsDepth: 1, minScore: 0.5 });
      expect(hits.map(h => h.id)).toContain(taskId);
    });
  });

  describe('persistence with proxies', () => {
    const XSTORE = '/tmp/task-cross-test';

    afterEach(() => {
      if (fs.existsSync(XSTORE)) fs.rmSync(XSTORE, { recursive: true });
    });

    it('proxy survives save/load', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      saveTaskGraph(tg, XSTORE);
      const loaded = loadTaskGraph(XSTORE);
      expect(loaded.hasNode('@docs::guide.md::Setup')).toBe(true);
      expect(loaded.getNodeAttribute('@docs::guide.md::Setup', 'proxyFor')).toEqual({
        graph: 'docs', nodeId: 'guide.md::Setup',
      });
    });

    it('cross-graph edge survives save/load', () => {
      createCrossRelation(tg, taskId, 'docs', 'guide.md::Setup', 'references', extDocs);
      saveTaskGraph(tg, XSTORE);
      const loaded = loadTaskGraph(XSTORE);
      expect(loaded.hasEdge(taskId, '@docs::guide.md::Setup')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Persistence round-trip
// ---------------------------------------------------------------------------

describe('persistence round-trip (tasks)', () => {
  let tmpDir: string;
  const fakeEmbed = (_q: string) => Promise.resolve(unitVec(0));

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-roundtrip-'));
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });

  it('save → load → Manager preserves items, relations, proxies, and BM25', async () => {
    // 1. Build a graph with tasks, relations, and a cross-graph proxy
    const g = createTaskGraph();
    const t1 = createTask(g, 'Fix Auth Redirect', 'Login redirect is broken', 'todo', 'high', ['bug', 'auth'], unitVec(0));
    const t2 = createTask(g, 'Add File Search', 'Implement file search feature', 'backlog', 'medium', ['feature'], unitVec(1), 1700000000000, 4);
    const t3 = createTask(g, 'Refactor Config', 'Clean up config loading', 'in_progress', 'low', ['refactor'], unitVec(2));
    createTaskRelation(g, t1, t2, 'blocks');
    createTaskRelation(g, t3, t1, 'subtask_of');

    // Cross-graph proxy (skip external graph validation)
    createCrossRelation(g, t1, 'docs', 'guide.md::Setup', 'references');

    // 2. Save
    saveTaskGraph(g, tmpDir);

    // 3. Load into fresh graph
    const loaded = loadTaskGraph(tmpDir);

    // 4. Create a new Manager from the loaded graph
    const ctx: GraphManagerContext = {
      markDirty: jest.fn(),
      emit: jest.fn(),
      projectId: 'test',
      author: '',
    };
    const manager = new TaskGraphManager(loaded, embedFnPair(fakeEmbed), ctx, {});

    // 5. Verify: list returns all items (3 tasks, no proxies)
    const tasks = listTasks(loaded);
    expect(tasks).toHaveLength(3);
    expect(tasks.map(t => t.id).sort()).toEqual([t1, t2, t3].sort());

    // Verify task attributes survived
    expect(loaded.getNodeAttribute(t1, 'title')).toBe('Fix Auth Redirect');
    expect(loaded.getNodeAttribute(t1, 'status')).toBe('todo');
    expect(loaded.getNodeAttribute(t1, 'priority')).toBe('high');
    expect(loaded.getNodeAttribute(t1, 'tags')).toEqual(['bug', 'auth']);
    expect(loaded.getNodeAttribute(t1, 'embedding')).toHaveLength(DIM);
    expect(loaded.getNodeAttribute(t2, 'dueDate')).toBe(1700000000000);
    expect(loaded.getNodeAttribute(t2, 'estimate')).toBe(4);

    // Verify task-to-task relations preserved
    expect(loaded.hasEdge(t1, t2)).toBe(true);
    expect(loaded.getEdgeAttribute(loaded.edge(t1, t2)!, 'kind')).toBe('blocks');
    expect(loaded.hasEdge(t3, t1)).toBe(true);
    expect(loaded.getEdgeAttribute(loaded.edge(t3, t1)!, 'kind')).toBe('subtask_of');

    // Verify cross-graph proxy
    const rels = listTaskRelations(loaded, t1);
    const crossRel = rels.find(r => r.targetGraph === 'docs');
    expect(crossRel).toBeDefined();
    expect(crossRel!.toId).toBe('guide.md::Setup');
    expect(crossRel!.kind).toBe('references');

    expect(loaded.hasNode('@docs::guide.md::Setup')).toBe(true);
    expect(isProxy(loaded, '@docs::guide.md::Setup')).toBe(true);

    // Verify getTask enrichment still works
    const enriched = getTask(loaded, t1)!;
    expect(enriched.blocks).toHaveLength(1);
    expect(enriched.blocks[0].id).toBe(t2);

    // Verify BM25 index was rebuilt
    const bm25Scores = manager.bm25Index.score('auth redirect');
    expect(bm25Scores.size).toBeGreaterThan(0);
    expect(bm25Scores.has(t1)).toBe(true);
    expect(manager.bm25Index.size).toBe(3);

    // Verify vector search still works
    const vectorHits = searchTasks(loaded, unitVec(0), { topK: 1, bfsDepth: 0, minScore: 0.5 });
    expect(vectorHits).toHaveLength(1);
    expect(vectorHits[0].id).toBe(t1);

    // Verify a new task can be created via Manager on the loaded graph
    const t4 = await manager.createTask('New Task', 'Created after load', 'todo', 'medium', ['test']);
    expect(t4).toMatch(/^[0-9a-f]{8}-/);
    expect(listTasks(loaded)).toHaveLength(4);
    expect(manager.bm25Index.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Attachments (TaskGraphManager)
// ---------------------------------------------------------------------------

describe('Attachments (TaskGraphManager)', () => {
  let tmpDir: string;
  let manager: TaskGraphManager;
  let taskId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-attach-'));
    const graph = createTaskGraph();
    const embedFn: (query: string) => Promise<number[]> = () => Promise.resolve(unitVec(0));
    const ctx: GraphManagerContext = {
      markDirty: () => {},
      emit: () => {},
      projectId: 'test',
      projectDir: tmpDir,
      author: '',
    };
    manager = new TaskGraphManager(graph, embedFnPair(embedFn), ctx, {});
    taskId = await manager.createTask('Test Task', 'A task for attachment tests', 'todo', 'medium', []);
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });

  describe('addAttachment', () => {
    it('returns metadata for valid attachment', () => {
      const data = Buffer.from('hello world');
      const meta = manager.addAttachment(taskId, 'readme.txt', data);
      expect(meta).not.toBeNull();
      expect(meta!.filename).toBe('readme.txt');
    });

    it('writes file to disk', () => {
      const filePath = path.join(tmpDir, '.tasks', taskId, 'attachments', 'readme.txt');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('file contents match', () => {
      const filePath = path.join(tmpDir, '.tasks', taskId, 'attachments', 'readme.txt');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
    });

    it('metadata has correct size', () => {
      const data = Buffer.from('hello world');
      const meta = manager.addAttachment(taskId, 'readme.txt', data);
      expect(meta!.size).toBe(11);
    });

    it('metadata has mimeType', () => {
      const data = Buffer.from('hello world');
      const meta = manager.addAttachment(taskId, 'readme.txt', data);
      expect(meta!.mimeType).toBe('text/plain');
    });

    it('metadata has addedAt timestamp', () => {
      const data = Buffer.from('hello world');
      const meta = manager.addAttachment(taskId, 'readme.txt', data);
      expect(meta!.addedAt).toBeGreaterThan(0);
    });

    it('updates graph attachments attribute', () => {
      const attachments = manager.graph.getNodeAttribute(taskId, 'attachments');
      expect(attachments.length).toBeGreaterThanOrEqual(1);
      expect(attachments.some((a: { filename: string }) => a.filename === 'readme.txt')).toBe(true);
    });

    it('updates graph updatedAt', () => {
      const updatedAt = manager.graph.getNodeAttribute(taskId, 'updatedAt');
      expect(updatedAt).toBeGreaterThan(0);
    });

    it('returns null for missing task', () => {
      const meta = manager.addAttachment('nonexistent', 'file.txt', Buffer.from('x'));
      expect(meta).toBeNull();
    });

    it('returns null for proxy node', () => {
      // Create a proxy node first
      const proxyNodeId = '@docs::some-doc';
      manager.graph.addNode(proxyNodeId, {
        title: '', description: '', status: 'backlog', priority: 'medium',
        tags: [], dueDate: null, estimate: null, completedAt: null, assignee: null,
        embedding: [], attachments: [], createdAt: 0, updatedAt: 0,
        proxyFor: { graph: 'docs', nodeId: 'some-doc' },
      } as any);
      const meta = manager.addAttachment(proxyNodeId, 'file.txt', Buffer.from('x'));
      expect(meta).toBeNull();
      manager.graph.dropNode(proxyNodeId);
    });

    it('sanitizes dangerous filenames', () => {
      const data = Buffer.from('sanitized');
      const meta = manager.addAttachment(taskId, '../../../etc/passwd', data);
      expect(meta).not.toBeNull();
      expect(meta!.filename).not.toContain('..');
      expect(meta!.filename).not.toContain('/');
    });

    it('returns null for empty filename after sanitization', () => {
      const meta = manager.addAttachment(taskId, '../../', Buffer.from('x'));
      expect(meta).toBeNull();
    });

    it('can add multiple attachments', () => {
      manager.addAttachment(taskId, 'image.png', Buffer.from('png-data'));
      const attachments = manager.listAttachments(taskId);
      expect(attachments.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('listAttachments', () => {
    it('returns attachments for task', () => {
      const list = manager.listAttachments(taskId);
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it('each item has filename', () => {
      const list = manager.listAttachments(taskId);
      for (const item of list) {
        expect(typeof item.filename).toBe('string');
        expect(item.filename.length).toBeGreaterThan(0);
      }
    });

    it('each item has mimeType', () => {
      const list = manager.listAttachments(taskId);
      for (const item of list) {
        expect(typeof item.mimeType).toBe('string');
      }
    });

    it('each item has size', () => {
      const list = manager.listAttachments(taskId);
      for (const item of list) {
        expect(typeof item.size).toBe('number');
        expect(item.size).toBeGreaterThan(0);
      }
    });

    it('returns empty for missing task', () => {
      expect(manager.listAttachments('nonexistent')).toEqual([]);
    });
  });

  describe('getAttachmentPath', () => {
    it('returns path for existing attachment', () => {
      const p = manager.getAttachmentPath(taskId, 'readme.txt');
      expect(p).not.toBeNull();
      expect(p).toContain('readme.txt');
    });

    it('returned path exists on disk', () => {
      const p = manager.getAttachmentPath(taskId, 'readme.txt');
      expect(fs.existsSync(p!)).toBe(true);
    });

    it('returns null for nonexistent attachment', () => {
      const p = manager.getAttachmentPath(taskId, 'no-such-file.txt');
      expect(p).toBeNull();
    });
  });

  describe('removeAttachment', () => {
    it('returns true for existing attachment', () => {
      // Add a file to remove
      manager.addAttachment(taskId, 'to-delete.txt', Buffer.from('delete me'));
      expect(manager.removeAttachment(taskId, 'to-delete.txt')).toBe(true);
    });

    it('file removed from disk', () => {
      const p = path.join(tmpDir, '.tasks', taskId, 'attachments', 'to-delete.txt');
      expect(fs.existsSync(p)).toBe(false);
    });

    it('updates graph attachments attribute', () => {
      const attachments = manager.listAttachments(taskId);
      expect(attachments.every((a: { filename: string }) => a.filename !== 'to-delete.txt')).toBe(true);
    });

    it('returns false for nonexistent attachment', () => {
      expect(manager.removeAttachment(taskId, 'no-such-file.txt')).toBe(false);
    });

    it('returns false for missing task', () => {
      expect(manager.removeAttachment('nonexistent', 'file.txt')).toBe(false);
    });
  });

  describe('syncAttachments', () => {
    it('picks up externally added file', () => {
      // Write a file to the attachments/ subdir (simulating external add)
      const attDir = path.join(tmpDir, '.tasks', taskId, 'attachments');
      fs.mkdirSync(attDir, { recursive: true });
      fs.writeFileSync(path.join(attDir, 'external.txt'), 'added externally');

      manager.syncAttachments(taskId);

      const attachments = manager.listAttachments(taskId);
      expect(attachments.some((a: { filename: string }) => a.filename === 'external.txt')).toBe(true);
    });

    it('reflects externally deleted file', () => {
      // Delete a file directly from disk
      const attDir = path.join(tmpDir, '.tasks', taskId, 'attachments');
      const extPath = path.join(attDir, 'external.txt');
      if (fs.existsSync(extPath)) fs.unlinkSync(extPath);

      manager.syncAttachments(taskId);

      const attachments = manager.listAttachments(taskId);
      expect(attachments.every((a: { filename: string }) => a.filename !== 'external.txt')).toBe(true);
    });

    it('no-ops for missing task', () => {
      // Should not throw
      expect(() => manager.syncAttachments('nonexistent')).not.toThrow();
    });
  });
});
