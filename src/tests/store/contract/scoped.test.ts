import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { SqliteStore } from '@/store';

describe('ProjectScopedStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;

  beforeEach(() => {
    ({ store, cleanup } = factory());
  });

  afterEach(() => { cleanup(); });

  // --- project() caching ---

  it('project() returns same instance for same id', () => {
    const p = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped1 = store.project(p.id);
    const scoped2 = store.project(p.id);
    expect(scoped1).toBe(scoped2);
  });

  it('project() returns different instances for different ids', () => {
    const p1 = store.projects.create({ slug: 'a', name: 'A', directory: '/a' });
    const p2 = store.projects.create({ slug: 'b', name: 'B', directory: '/b' });
    expect(store.project(p1.id)).not.toBe(store.project(p2.id));
  });

  // --- Data isolation between projects ---

  it('knowledge is isolated between projects', () => {
    const p1 = store.projects.create({ slug: 'a', name: 'A', directory: '/a' });
    const p2 = store.projects.create({ slug: 'b', name: 'B', directory: '/b' });

    const s1 = store.project(p1.id);
    const s2 = store.project(p2.id);

    s1.knowledge.create({ title: 'Note A', content: 'A content' }, seedEmbedding(1));
    s2.knowledge.create({ title: 'Note B', content: 'B content' }, seedEmbedding(2));

    expect(s1.knowledge.list().total).toBe(1);
    expect(s1.knowledge.list().results[0].title).toBe('Note A');
    expect(s2.knowledge.list().total).toBe(1);
    expect(s2.knowledge.list().results[0].title).toBe('Note B');
  });

  it('tasks are isolated between projects', () => {
    const p1 = store.projects.create({ slug: 'a', name: 'A', directory: '/a' });
    const p2 = store.projects.create({ slug: 'b', name: 'B', directory: '/b' });

    store.project(p1.id).tasks.create({ title: 'Task A', description: '' }, seedEmbedding(1));
    store.project(p2.id).tasks.create({ title: 'Task B', description: '' }, seedEmbedding(2));

    expect(store.project(p1.id).tasks.list().total).toBe(1);
    expect(store.project(p2.id).tasks.list().total).toBe(1);
  });

  it('skills are isolated between projects', () => {
    const p1 = store.projects.create({ slug: 'a', name: 'A', directory: '/a' });
    const p2 = store.projects.create({ slug: 'b', name: 'B', directory: '/b' });

    store.project(p1.id).skills.create({ title: 'Skill A', description: '' }, seedEmbedding(1));

    expect(store.project(p1.id).skills.list().total).toBe(1);
    expect(store.project(p2.id).skills.list().total).toBe(0);
  });

  it('code is isolated between projects', () => {
    const p1 = store.projects.create({ slug: 'a', name: 'A', directory: '/a' });
    const p2 = store.projects.create({ slug: 'b', name: 'B', directory: '/b' });

    store.project(p1.id).code.updateFile('src/a.ts', [{
      kind: 'function', fileId: 'src/a.ts', language: 'typescript',
      name: 'fn', signature: '', docComment: '', body: '',
      startLine: 1, endLine: 1, isExported: true, mtime: 1000,
    }], [], 1000, new Map([['src/a.ts', seedEmbedding(1)], ['fn', seedEmbedding(2)]]));

    expect(store.project(p1.id).code.listFiles().total).toBe(1);
    expect(store.project(p2.id).code.listFiles().total).toBe(0);
  });

  // --- Edge operations via scoped store ---

  it('createEdge and listEdges', () => {
    const p = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(p.id);

    const note = scoped.knowledge.create({ title: 'N', content: '' }, seedEmbedding(1));
    const task = scoped.tasks.create({ title: 'T', description: '' }, seedEmbedding(2));

    scoped.createEdge({
      fromGraph: 'knowledge', fromId: note.id,
      toGraph: 'tasks', toId: task.id,
      kind: 'related_to',
    });

    const edges = scoped.listEdges({ kind: 'related_to' });
    expect(edges.length).toBe(1);
    expect(edges[0].fromGraph).toBe('knowledge');
    expect(edges[0].toId).toBe(task.id);
  });

  it('deleteEdge removes edge', () => {
    const p = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(p.id);

    const note = scoped.knowledge.create({ title: 'N', content: '' }, seedEmbedding(1));
    const task = scoped.tasks.create({ title: 'T', description: '' }, seedEmbedding(2));

    const edge = {
      fromGraph: 'knowledge' as const, fromId: note.id,
      toGraph: 'tasks' as const, toId: task.id,
      kind: 'related_to',
    };

    scoped.createEdge(edge);
    expect(scoped.listEdges({ kind: 'related_to' }).length).toBe(1);

    scoped.deleteEdge(edge);
    expect(scoped.listEdges({ kind: 'related_to' }).length).toBe(0);
  });

  it('findIncomingEdges and findOutgoingEdges', () => {
    const p = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(p.id);

    const note = scoped.knowledge.create({ title: 'N', content: '' }, seedEmbedding(1));
    const task = scoped.tasks.create({ title: 'T', description: '' }, seedEmbedding(2));

    scoped.createEdge({
      fromGraph: 'knowledge', fromId: note.id,
      toGraph: 'tasks', toId: task.id,
      kind: 'related_to',
    });

    const incoming = scoped.findIncomingEdges('tasks', task.id);
    expect(incoming.length).toBe(1);
    expect(incoming[0].fromGraph).toBe('knowledge');

    const outgoing = scoped.findOutgoingEdges('knowledge', note.id);
    expect(outgoing.length).toBe(1);
    expect(outgoing[0].toGraph).toBe('tasks');
  });

  it('edges are isolated between projects', () => {
    const p1 = store.projects.create({ slug: 'a', name: 'A', directory: '/a' });
    const p2 = store.projects.create({ slug: 'b', name: 'B', directory: '/b' });

    const s1 = store.project(p1.id);
    const s2 = store.project(p2.id);

    const note1 = s1.knowledge.create({ title: 'N1', content: '' }, seedEmbedding(1));
    const task1 = s1.tasks.create({ title: 'T1', description: '' }, seedEmbedding(2));
    s1.createEdge({
      fromGraph: 'knowledge', fromId: note1.id,
      toGraph: 'tasks', toId: task1.id,
      kind: 'related_to',
    });

    // Project 2 should see no edges
    expect(s2.listEdges({}).length).toBe(0);
  });

  // --- Edge auto-cleanup on entity delete ---

  it('deleting entity cleans up edges via triggers', () => {
    const p = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(p.id);

    const note = scoped.knowledge.create({ title: 'N', content: '' }, seedEmbedding(1));
    const task = scoped.tasks.create({ title: 'T', description: '' }, seedEmbedding(2));

    scoped.createEdge({
      fromGraph: 'knowledge', fromId: note.id,
      toGraph: 'tasks', toId: task.id,
      kind: 'related_to',
    });

    expect(scoped.listEdges({ kind: 'related_to' }).length).toBe(1);

    // Delete the note — cleanup trigger should remove edge
    scoped.knowledge.delete(note.id);
    expect(scoped.listEdges({ kind: 'related_to' }).length).toBe(0);
  });

  // --- Duplicate edge is ignored (INSERT OR IGNORE) ---

  it('duplicate edge is silently ignored', () => {
    const p = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(p.id);

    const note = scoped.knowledge.create({ title: 'N', content: '' }, seedEmbedding(1));
    const task = scoped.tasks.create({ title: 'T', description: '' }, seedEmbedding(2));

    const edge = {
      fromGraph: 'knowledge' as const, fromId: note.id,
      toGraph: 'tasks' as const, toId: task.id,
      kind: 'related_to',
    };

    scoped.createEdge(edge);
    scoped.createEdge(edge); // duplicate
    expect(scoped.listEdges({ kind: 'related_to' }).length).toBe(1);
  });

  // --- Attachments via scoped store ---

  it('attachments work through scoped store', () => {
    const p = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(p.id);

    const note = scoped.knowledge.create({ title: 'N', content: '' }, seedEmbedding(1));
    scoped.attachments.add('knowledge', note.id, {
      filename: 'file.txt', mimeType: 'text/plain', size: 100, addedAt: Date.now(),
    });

    const list = scoped.attachments.list('knowledge', note.id);
    expect(list.length).toBe(1);
    expect(list[0].filename).toBe('file.txt');
  });
});
