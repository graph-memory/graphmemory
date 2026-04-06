import { createSqliteStoreFactory, seedEmbedding, TEST_DIM } from '../helpers';
import type { SqliteStore } from '@/store';

describe('AttachmentsStore', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'attach-test', name: 'Attach Test', directory: '/tmp/attach' });
    projectId = project.id;
  });

  afterEach(() => cleanup());

  it('adds and lists attachments', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);
    const note = scoped.knowledge.create({ title: 'Note', content: 'c' }, emb);

    scoped.attachments.add('knowledge', note.id, {
      filename: 'test.txt',
      mimeType: 'text/plain',
      size: 100,
      addedAt: Date.now(),
    });

    const list = scoped.attachments.list('knowledge', note.id);
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe('test.txt');
    expect(list[0].mimeType).toBe('text/plain');
    expect(list[0].size).toBe(100);
  });

  it('removes a specific attachment', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);
    const note = scoped.knowledge.create({ title: 'Note', content: 'c' }, emb);

    scoped.attachments.add('knowledge', note.id, { filename: 'a.txt', mimeType: 'text/plain', size: 10, addedAt: Date.now() });
    scoped.attachments.add('knowledge', note.id, { filename: 'b.txt', mimeType: 'text/plain', size: 20, addedAt: Date.now() });

    scoped.attachments.remove('knowledge', note.id, 'a.txt');

    const list = scoped.attachments.list('knowledge', note.id);
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe('b.txt');
  });

  it('removeAll deletes all attachments for entity', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);
    const note = scoped.knowledge.create({ title: 'Note', content: 'c' }, emb);

    scoped.attachments.add('knowledge', note.id, { filename: 'a.txt', mimeType: 'text/plain', size: 10, addedAt: Date.now() });
    scoped.attachments.add('knowledge', note.id, { filename: 'b.txt', mimeType: 'text/plain', size: 20, addedAt: Date.now() });

    scoped.attachments.removeAll('knowledge', note.id);
    expect(scoped.attachments.list('knowledge', note.id)).toHaveLength(0);
  });

  it('lists returns empty for entity without attachments', () => {
    const scoped = store.project(projectId);
    expect(scoped.attachments.list('knowledge', 99999)).toHaveLength(0);
  });

  it('remove is no-op for non-existent attachment', () => {
    const scoped = store.project(projectId);
    // Should not throw
    scoped.attachments.remove('knowledge', 99999, 'nope.txt');
  });

  it('multiple entities have independent attachments', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);
    const note1 = scoped.knowledge.create({ title: 'Note 1', content: 'c1' }, emb);
    const note2 = scoped.knowledge.create({ title: 'Note 2', content: 'c2' }, emb);

    scoped.attachments.add('knowledge', note1.id, { filename: 'a.txt', mimeType: 'text/plain', size: 10, addedAt: Date.now() });
    scoped.attachments.add('knowledge', note2.id, { filename: 'b.txt', mimeType: 'text/plain', size: 20, addedAt: Date.now() });

    expect(scoped.attachments.list('knowledge', note1.id)).toHaveLength(1);
    expect(scoped.attachments.list('knowledge', note2.id)).toHaveLength(1);
    expect(scoped.attachments.list('knowledge', note1.id)[0].filename).toBe('a.txt');
    expect(scoped.attachments.list('knowledge', note2.id)[0].filename).toBe('b.txt');
  });

  it('attachments work across different graphs', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);
    const note = scoped.knowledge.create({ title: 'Note', content: 'c' }, emb);
    const task = scoped.tasks.create({ title: 'Task', description: 'd' }, emb);

    scoped.attachments.add('knowledge', note.id, { filename: 'note-file.txt', mimeType: 'text/plain', size: 10, addedAt: Date.now() });
    scoped.attachments.add('tasks', task.id, { filename: 'task-file.txt', mimeType: 'text/plain', size: 20, addedAt: Date.now() });

    expect(scoped.attachments.list('knowledge', note.id)[0].filename).toBe('note-file.txt');
    expect(scoped.attachments.list('tasks', task.id)[0].filename).toBe('task-file.txt');
  });

  it('attachments are included in entity records', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);
    const note = scoped.knowledge.create({ title: 'With attachment', content: 'c' }, emb);

    scoped.attachments.add('knowledge', note.id, { filename: 'photo.png', mimeType: 'image/png', size: 5000, addedAt: Date.now() });

    // When we get the note, attachments should be there
    const fetched = scoped.knowledge.get(note.id)!;
    expect(fetched.attachments).toHaveLength(1);
    expect(fetched.attachments[0].filename).toBe('photo.png');
  });
});
