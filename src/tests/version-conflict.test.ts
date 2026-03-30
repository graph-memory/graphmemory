import { createTaskGraph } from '@/graphs/task-types';
import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import {
  setupMcpClient, createFakeEmbed, json, text,
  type McpTestContext,
} from '@/tests/helpers';

describe('Optimistic locking — version conflicts', () => {
  let ctx: McpTestContext;
  let noteId: string;
  let taskId: string;

  beforeAll(async () => {
    const embedFn = createFakeEmbed([['test', 1], ['conflict', 2]]);
    const taskGraph = createTaskGraph();
    const knowledgeGraph = createKnowledgeGraph();
    ctx = await setupMcpClient({ taskGraph, knowledgeGraph, embedFn });

    // Create test entities
    noteId = json<{ noteId: string }>(await ctx.call('notes_create', {
      title: 'Conflict test note', content: 'original',
    })).noteId;

    taskId = json<{ taskId: string }>(await ctx.call('tasks_create', {
      title: 'Conflict test task', description: 'original', priority: 'medium',
    })).taskId;
  });

  afterAll(async () => { await ctx.close(); });

  // -- Notes --

  it('note update with correct version succeeds', async () => {
    const r = json<any>(await ctx.call('notes_update', {
      noteId, title: 'Updated', expectedVersion: 1,
    }));
    expect(r.updated).toBe(true);
  });

  it('note update with stale version returns error', async () => {
    const r = await ctx.call('notes_update', {
      noteId, title: 'Stale', expectedVersion: 1,
    });
    expect(r.isError).toBe(true);
    expect(text(r).toLowerCase()).toContain('version');
  });

  it('note update without version always succeeds', async () => {
    const r = json<any>(await ctx.call('notes_update', {
      noteId, title: 'No lock',
    }));
    expect(r.updated).toBe(true);
  });

  // -- Tasks --

  it('task update with correct version succeeds', async () => {
    const r = json<any>(await ctx.call('tasks_update', {
      taskId, title: 'Updated task', expectedVersion: 1,
    }));
    expect(r.updated).toBe(true);
  });

  it('task update with stale version returns error', async () => {
    const r = await ctx.call('tasks_update', {
      taskId, title: 'Stale', expectedVersion: 1,
    });
    expect(r.isError).toBe(true);
    expect(text(r).toLowerCase()).toContain('version');
  });

  it('task move with stale version returns error', async () => {
    const r = await ctx.call('tasks_move', {
      taskId, status: 'done', expectedVersion: 1,
    });
    expect(r.isError).toBe(true);
    expect(text(r).toLowerCase()).toContain('version');
  });

  it('task move with correct version succeeds', async () => {
    const r = json<any>(await ctx.call('tasks_move', {
      taskId, status: 'done', expectedVersion: 2,
    }));
    expect(r.taskId).toBeTruthy();
  });
});
