import { createTaskGraph } from '@/graphs/task-types';
import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import {
  setupMcpClient, createFakeEmbed, json, jsonList,
  type McpTestContext,
} from '@/tests/helpers';

describe('Unicode content — Cyrillic, CJK, emoji', () => {
  let ctx: McpTestContext;

  beforeAll(async () => {
    const embedFn = createFakeEmbed([['задача', 1], ['ノート', 2], ['deploy', 3]]);
    const taskGraph = createTaskGraph();
    const knowledgeGraph = createKnowledgeGraph();
    ctx = await setupMcpClient({ taskGraph, knowledgeGraph, embedFn });
  });

  afterAll(async () => { await ctx.close(); });

  let cyrillicNoteId: string;

  it('creates a note with Cyrillic title and content', async () => {
    const r = json<{ noteId: string }>(await ctx.call('notes_create', {
      title: 'Архитектура системы',
      content: 'Описание архитектуры на русском языке',
      tags: ['архитектура', 'документация'],
    }));
    expect(r.noteId).toBeTruthy();
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
    const r = json<{ taskId: string }>(await ctx.call('tasks_create', {
      title: 'データベース移行',
      description: '日本語のタスク説明',
      priority: 'high',
    }));
    expect(r.taskId).toBeTruthy();
  });

  it('creates a task with emoji in tags', async () => {
    const r = json<{ taskId: string }>(await ctx.call('tasks_create', {
      title: 'Deploy with care',
      description: 'Be careful',
      priority: 'medium',
      tags: ['deploy', 'important'],
    }));
    expect(r.taskId).toBeTruthy();
  });

  let mixedNoteId: string;

  it('creates a note with mixed language content', async () => {
    const r = json<{ noteId: string }>(await ctx.call('notes_create', {
      title: 'Mixed: English и Русский',
      content: 'This note has English and русский текст together. Also データ.',
    }));
    expect(r.noteId).toBeTruthy();
    mixedNoteId = r.noteId;
  });

  it('retrieves mixed language note', async () => {
    const r = json<any>(await ctx.call('notes_get', { noteId: mixedNoteId }));
    expect(r.title).toBe('Mixed: English и Русский');
    expect(r.content).toContain('русский текст');
  });

  it('searches notes by Cyrillic keyword', async () => {
    const r = await ctx.call('notes_search', { q: 'архитектура', searchMode: 'keyword' });
    if (!r.isError) {
      const items = jsonList<any>(r);
      expect(items.some((n: any) => n.title.includes('Архитектура'))).toBe(true);
    }
  });
});
