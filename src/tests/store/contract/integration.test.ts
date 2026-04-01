import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { SqliteStore, VersionConflictError } from '@/store';

describe('Store integration', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;

  beforeEach(() => {
    ({ store, cleanup } = factory());
  });

  afterEach(() => { cleanup(); });

  // --- Full workflow ---

  it('full workflow: project → team → entities → tags → edges → search → delete', () => {
    // Create project and team member
    const project = store.projects.create({ slug: 'demo', name: 'Demo', directory: '/demo' });
    const member = store.team.create({ slug: 'alice', name: 'Alice' });
    const scoped = store.project(project.id);

    // Create entities with tags
    const note = scoped.knowledge.create(
      { title: 'Architecture', content: 'System design notes', tags: ['design', 'important'], authorId: member.id },
      seedEmbedding(1),
    );
    const task = scoped.tasks.create(
      { title: 'Implement auth', description: 'OAuth integration', tags: ['auth'], authorId: member.id },
      seedEmbedding(2),
    );
    const skill = scoped.skills.create(
      { title: 'OAuth Setup', description: 'How to set up OAuth', authorId: member.id },
      seedEmbedding(3),
    );

    // Create edges
    scoped.createEdge({ fromGraph: 'knowledge', fromId: note.id, toGraph: 'tasks', toId: task.id, kind: 'related_to' });
    scoped.createEdge({ fromGraph: 'skills', fromId: skill.id, toGraph: 'tasks', toId: task.id, kind: 'helps_with' });

    // Verify entities
    expect(note.tags).toEqual(['design', 'important']);
    expect(note.createdById).toBe(member.id);
    expect(task.tags).toEqual(['auth']);

    // Verify edges (2 explicit + 1 tag edge from 'auth' tag)
    const taskEdges = scoped.findIncomingEdges('tasks', task.id);
    expect(taskEdges.filter(e => e.kind !== 'tagged').length).toBe(2);

    // Search
    const knowledgeResults = scoped.knowledge.search({ text: 'architecture', searchMode: 'keyword' });
    expect(knowledgeResults.length).toBeGreaterThan(0);

    const taskResults = scoped.tasks.search({ text: 'auth', searchMode: 'keyword' });
    expect(taskResults.length).toBeGreaterThan(0);

    // Index code
    scoped.code.updateFile('src/auth.ts', [{
      kind: 'function', fileId: 'src/auth.ts', language: 'typescript',
      name: 'authenticate', signature: 'function authenticate(): Promise<User>',
      docComment: 'Authenticate user', body: '...',
      startLine: 1, endLine: 10, isExported: true, mtime: 1000,
    }], [], 1000, new Map([['src/auth.ts', seedEmbedding(10)], ['authenticate', seedEmbedding(11)]]));

    // Cross-graph edge (knowledge → code)
    const authFns = scoped.code.findByName('authenticate');
    expect(authFns.length).toBe(1);
    scoped.createEdge({ fromGraph: 'knowledge', fromId: note.id, toGraph: 'code', toId: authFns[0].id, kind: 'references' });

    // Index file
    scoped.files.updateFile('src/auth.ts', 2048, 1000, seedEmbedding(20));

    // Delete project — CASCADE should clean everything
    store.projects.delete(project.id);

    // Verify empty
    const db = store.getDb();
    const knowledgeCount = Number((db.prepare('SELECT COUNT(*) AS c FROM knowledge').get() as { c: bigint }).c);
    const tasksCount = Number((db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: bigint }).c);
    const skillsCount = Number((db.prepare('SELECT COUNT(*) AS c FROM skills').get() as { c: bigint }).c);
    const codeCount = Number((db.prepare('SELECT COUNT(*) AS c FROM code').get() as { c: bigint }).c);
    const filesCount = Number((db.prepare('SELECT COUNT(*) AS c FROM files').get() as { c: bigint }).c);
    const edgesCount = Number((db.prepare('SELECT COUNT(*) AS c FROM edges').get() as { c: bigint }).c);
    const tagsCount = Number((db.prepare('SELECT COUNT(*) AS c FROM tags').get() as { c: bigint }).c);
    const attachCount = Number((db.prepare('SELECT COUNT(*) AS c FROM attachments').get() as { c: bigint }).c);

    expect(knowledgeCount).toBe(0);
    expect(tasksCount).toBe(0);
    expect(skillsCount).toBe(0);
    expect(codeCount).toBe(0);
    expect(filesCount).toBe(0);
    expect(edgesCount).toBe(0);
    expect(tagsCount).toBe(0);
    expect(attachCount).toBe(0);
  });

  // --- Transaction atomicity ---

  it('transaction commits all operations atomically', () => {
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(project.id);

    store.transaction(() => {
      scoped.knowledge.create({ title: 'A', content: '', tags: ['x'] }, seedEmbedding(1));
      scoped.knowledge.create({ title: 'B', content: '', tags: ['y'] }, seedEmbedding(2));
    });

    expect(scoped.knowledge.list().total).toBe(2);
  });

  it('transaction rolls back on error', () => {
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(project.id);

    expect(() => {
      store.transaction(() => {
        scoped.knowledge.create({ title: 'A', content: '' }, seedEmbedding(1));
        throw new Error('Boom');
      });
    }).toThrow('Boom');

    expect(scoped.knowledge.list().total).toBe(0);
  });

  // --- Version conflict end-to-end ---

  it('version conflict across store boundary', () => {
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(project.id);

    const note = scoped.knowledge.create({ title: 'V', content: '' }, seedEmbedding(1));
    expect(note.version).toBe(1);

    // Update bumps version
    const updated = scoped.knowledge.update(note.id, { title: 'V2' }, null, undefined, 1);
    expect(updated.version).toBe(2);

    // Stale version should fail
    expect(() => scoped.knowledge.update(note.id, { title: 'V3' }, null, undefined, 1))
      .toThrow(VersionConflictError);
  });

  // --- Store-level edge methods ---

  it('store-level edge methods work with projectId', () => {
    const p1 = store.projects.create({ slug: 'a', name: 'A', directory: '/a' });
    const p2 = store.projects.create({ slug: 'b', name: 'B', directory: '/b' });

    const n1 = store.project(p1.id).knowledge.create({ title: 'N1', content: '' }, seedEmbedding(1));
    store.project(p2.id).knowledge.create({ title: 'N2', content: '' }, seedEmbedding(2));
    const t1 = store.project(p1.id).tasks.create({ title: 'T1', description: '' }, seedEmbedding(3));

    store.createEdge(p1.id, { fromGraph: 'knowledge', fromId: n1.id, toGraph: 'tasks', toId: t1.id, kind: 'related_to' });

    // With projectId filter
    expect(store.listEdges({ projectId: p1.id }).length).toBe(1);
    expect(store.listEdges({ projectId: p2.id }).length).toBe(0);

    // findIncoming with projectId
    expect(store.findIncomingEdges('tasks', t1.id, p1.id).length).toBe(1);
    expect(store.findIncomingEdges('tasks', t1.id, p2.id).length).toBe(0);

    // findOutgoing with projectId
    expect(store.findOutgoingEdges('knowledge', n1.id, p1.id).length).toBe(1);

    // Delete edge
    store.deleteEdge(p1.id, { fromGraph: 'knowledge', fromId: n1.id, toGraph: 'tasks', toId: t1.id, kind: 'related_to' });
    expect(store.listEdges({ projectId: p1.id }).length).toBe(0);
  });

  // --- Store lifecycle ---

  it('operations fail after close', () => {
    store.close();
    expect(() => store.projects).toThrow('Store not open');
    // Prevent double-close in afterEach
    const { store: s2, cleanup: c2 } = factory();
    store = s2;
    cleanup = c2;
  });

  it('close is idempotent', () => {
    store.close();
    expect(() => store.close()).not.toThrow();
    const { store: s2, cleanup: c2 } = factory();
    store = s2;
    cleanup = c2;
  });

  it('cannot open twice', () => {
    // Store is already open from beforeEach
    expect(() => store.open({ dbPath: '/tmp/test.db' })).toThrow('Store already open');
  });

  // --- Meta at workspace level ---

  it('workspace meta is separate from graph meta', () => {
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(project.id);

    store.setMeta('version', '1');
    scoped.knowledge.setMeta('lastSync', '999');

    expect(store.getMeta('version')).toBe('1');
    expect(store.getMeta('lastSync')).toBeNull(); // knowledge:lastSync != lastSync
    expect(scoped.knowledge.getMeta('lastSync')).toBe('999');
  });

  // --- Epics via scoped store ---

  it('epics work through scoped store', () => {
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    const scoped = store.project(project.id);

    const epic = scoped.tasks.createEpic({ title: 'MVP', description: 'Minimum viable product' }, seedEmbedding(1));
    const task = scoped.tasks.create({ title: 'Auth', description: '' }, seedEmbedding(2));

    // Link task to epic
    scoped.createEdge({ fromGraph: 'epics', fromId: epic.id, toGraph: 'tasks', toId: task.id, kind: 'belongs_to' });
    scoped.tasks.move(task.id, 'done');

    const epicDetail = scoped.tasks.getEpic(epic.id)!;
    expect(epicDetail.progress).toEqual({ total: 1, done: 1 });
  });
});
