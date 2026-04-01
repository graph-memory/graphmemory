import { createSqliteStoreFactory } from '../helpers';
import { SqliteStore } from '@/store';
import { SqliteAttachmentsStore } from '@/store/sqlite/stores/attachments';

describe('AttachmentsStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let attachments: SqliteAttachmentsStore;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    projectId = project.id;
    attachments = new SqliteAttachmentsStore(store.getDb(), projectId);
  });

  afterEach(() => {
    cleanup();
  });

  it('adds and lists an attachment', () => {
    attachments.add('knowledge', 1, {
      filename: 'screenshot.png',
      mimeType: 'image/png',
      size: 1024,
      addedAt: Date.now(),
    });

    const list = attachments.list('knowledge', 1);
    expect(list.length).toBe(1);
    expect(list[0].filename).toBe('screenshot.png');
    expect(list[0].mimeType).toBe('image/png');
    expect(list[0].size).toBe(1024);
  });

  it('adds with optional url', () => {
    attachments.add('tasks', 1, {
      filename: 'doc.pdf',
      mimeType: 'application/pdf',
      size: 5000,
      url: 'https://cdn.example.com/doc.pdf',
      addedAt: Date.now(),
    });

    const list = attachments.list('tasks', 1);
    expect(list[0].url).toBe('https://cdn.example.com/doc.pdf');
  });

  it('url is undefined when not set', () => {
    attachments.add('knowledge', 1, {
      filename: 'file.txt',
      mimeType: 'text/plain',
      size: 100,
      addedAt: Date.now(),
    });

    const list = attachments.list('knowledge', 1);
    expect(list[0].url).toBeUndefined();
  });

  it('removes a single attachment', () => {
    attachments.add('knowledge', 1, { filename: 'a.png', mimeType: 'image/png', size: 100, addedAt: Date.now() });
    attachments.add('knowledge', 1, { filename: 'b.png', mimeType: 'image/png', size: 200, addedAt: Date.now() });

    attachments.remove('knowledge', 1, 'a.png');

    const list = attachments.list('knowledge', 1);
    expect(list.length).toBe(1);
    expect(list[0].filename).toBe('b.png');
  });

  it('removes all attachments for an entity', () => {
    attachments.add('knowledge', 1, { filename: 'a.png', mimeType: 'image/png', size: 100, addedAt: Date.now() });
    attachments.add('knowledge', 1, { filename: 'b.png', mimeType: 'image/png', size: 200, addedAt: Date.now() });

    attachments.removeAll('knowledge', 1);

    const list = attachments.list('knowledge', 1);
    expect(list.length).toBe(0);
  });

  it('isolates by graph', () => {
    attachments.add('knowledge', 1, { filename: 'note.txt', mimeType: 'text/plain', size: 50, addedAt: Date.now() });
    attachments.add('tasks', 1, { filename: 'task.txt', mimeType: 'text/plain', size: 60, addedAt: Date.now() });

    expect(attachments.list('knowledge', 1).length).toBe(1);
    expect(attachments.list('tasks', 1).length).toBe(1);
    expect(attachments.list('knowledge', 1)[0].filename).toBe('note.txt');
  });

  it('isolates by entity id', () => {
    attachments.add('knowledge', 1, { filename: 'a.txt', mimeType: 'text/plain', size: 50, addedAt: Date.now() });
    attachments.add('knowledge', 2, { filename: 'b.txt', mimeType: 'text/plain', size: 60, addedAt: Date.now() });

    expect(attachments.list('knowledge', 1).length).toBe(1);
    expect(attachments.list('knowledge', 2).length).toBe(1);
  });

  it('enforces filename uniqueness per entity', () => {
    attachments.add('knowledge', 1, { filename: 'dup.txt', mimeType: 'text/plain', size: 50, addedAt: Date.now() });
    expect(() => {
      attachments.add('knowledge', 1, { filename: 'dup.txt', mimeType: 'text/plain', size: 100, addedAt: Date.now() });
    }).toThrow();
  });

  it('returns empty list for no attachments', () => {
    expect(attachments.list('knowledge', 999)).toEqual([]);
  });
});
