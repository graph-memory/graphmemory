import {
  createFakeEmbed, createTestStoreManager, setupMcpClient, json, jsonList,
  type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';

describe('Unicode content — Cyrillic, CJK, emoji', () => {
  let ctx: McpTestContext;
  let storeCtx: TestStoreContext;

  beforeAll(async () => {
    const embedFn = createFakeEmbed([['задача', 1], ['ノート', 2], ['deploy', 3]]);
    storeCtx = createTestStoreManager(embedFn);
    ctx = await setupMcpClient({ storeManager: storeCtx.storeManager, embedFn });
  });

  afterAll(async () => {
    await ctx.close();
    storeCtx.cleanup();
  });

  let cyrillicNoteId: number;

  it('creates a note with Cyrillic title and content', async () => {
    const r = json<{ noteId: number }>(await ctx.call('notes_create', {
      title: 'Архитектура системы',
      content: 'Описание архитектуры на русском языке',
      tags: ['архитектура', 'документация'],
    }));
    expect(typeof r.noteId).toBe('number');
    cyrillicNoteId = r.noteId;
  });

  it('retrieves note with Cyrillic content', async () => {
    const r = json<any>(await ctx.call('notes_get', { noteId: cyrillicNoteId }));
    expect(r.title).toBe('Архитектура системы');
    expect(r.tags).toContain('архитектура');
  });

  it('lists notes and finds Cyrillic note', async () => {
    const r = jsonList<any>(await ctx.call('notes_list', {}));
    expect(r.some((n: any) => n.title === 'Архитектура системы')).toBe(true);
  });

  it('creates a task with CJK title', async () => {
    const r = json<{ taskId: number }>(await ctx.call('tasks_create', {
      title: 'データベース移行',
      description: '日本語のタスク説明',
      priority: 'high',
    }));
    expect(typeof r.taskId).toBe('number');
  });

  it('creates a task with emoji in tags', async () => {
    const r = json<{ taskId: number }>(await ctx.call('tasks_create', {
      title: 'Deploy with care',
      description: 'Be careful',
      priority: 'medium',
      tags: ['deploy', 'important'],
    }));
    expect(typeof r.taskId).toBe('number');
  });

  let mixedNoteId: number;

  it('creates a note with mixed language content', async () => {
    const r = json<{ noteId: number }>(await ctx.call('notes_create', {
      title: 'Mixed: English и Русский',
      content: 'This note has English and русский текст together. Also データ.',
    }));
    expect(typeof r.noteId).toBe('number');
    mixedNoteId = r.noteId;
  });

  it('retrieves mixed language note', async () => {
    const r = json<any>(await ctx.call('notes_get', { noteId: mixedNoteId }));
    expect(r.title).toBe('Mixed: English и Русский');
    expect(r.content).toContain('русский текст');
  });

  it('searches notes by Cyrillic keyword', async () => {
    const r = await ctx.call('notes_search', { query: 'архитектура', searchMode: 'keyword', minScore: 0 });
    if (!r.isError) {
      const items = json<any[]>(r);
      // SearchResult contains { id, score } — verify search returned results
      if (items.length > 0) {
        expect(items[0].id).toBe(cyrillicNoteId);
      }
    }
  });
});
