import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import { SqliteStore } from '@/store';
import { StoreManager } from '@/lib/store-manager';
import { seedEmbedding } from './helpers';

async function fakeEmbed(text: string): Promise<number[]> {
  return seedEmbedding(text.length);
}

describe('StoreManager', () => {
  let store: SqliteStore;
  let manager: StoreManager;
  let emitter: EventEmitter;
  let projectDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'orch-test-'));
    const dbPath = join(dir, 'test.db');
    projectDir = mkdtempSync(join(tmpdir(), 'orch-project-'));

    store = new SqliteStore();
    store.open({ dbPath });

    const project = store.projects.create({ slug: 'test', name: 'Test', directory: projectDir });
    emitter = new EventEmitter();

    manager = new StoreManager({
      store,
      projectId: project.id,
      projectDir,
      embedFn: fakeEmbed,
      emitter,
    });

    cleanup = () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    };
  });

  afterEach(() => cleanup());

  // =========================================================================
  // Notes
  // =========================================================================

  describe('notes', () => {
    it('creates a note with embedding and mirror', async () => {
      const events: unknown[] = [];
      emitter.on('note:created', (d) => events.push(d));

      const record = await manager.createNote({ title: 'Hello', content: 'World', tags: ['test'] });

      expect(record.title).toBe('Hello');
      expect(record.content).toBe('World');
      expect(record.tags).toEqual(['test']);
      expect(events.length).toBe(1);

      // Mirror written
      expect(existsSync(join(projectDir, '.notes', record.slug, 'events.jsonl'))).toBe(true);
      expect(existsSync(join(projectDir, '.notes', record.slug, 'content.md'))).toBe(true);
    });

    it('updates a note with re-embedding on content change', async () => {
      const record = await manager.createNote({ title: 'Original', content: 'Content' });
      const updated = await manager.updateNote(record.id, { content: 'New content' });

      expect(updated.content).toBe('New content');
      expect(updated.version).toBe(record.version + 1);
    });

    it('deletes a note and removes mirror dir', async () => {
      const record = await manager.createNote({ title: 'ToDelete', content: '' });
      const mirrorDir = join(projectDir, '.notes', record.slug);
      expect(existsSync(mirrorDir)).toBe(true);

      manager.deleteNote(record.id);

      expect(manager.getNote(record.id)).toBeNull();
      expect(existsSync(mirrorDir)).toBe(false);
    });

    it('searches notes', async () => {
      await manager.createNote({ title: 'Alpha', content: 'First note' });
      await manager.createNote({ title: 'Beta', content: 'Second note' });

      const results = await manager.searchNotes({ text: 'alpha', searchMode: 'keyword' });
      expect(results.length).toBe(1);
    });
  });

  // =========================================================================
  // Tasks
  // =========================================================================

  describe('tasks', () => {
    it('creates a task with mirror', async () => {
      const record = await manager.createTask({
        title: 'Fix bug', description: 'Urgent', status: 'todo', priority: 'high',
      });

      expect(record.status).toBe('todo');
      expect(record.priority).toBe('high');
      expect(existsSync(join(projectDir, '.tasks', record.slug, 'events.jsonl'))).toBe(true);
    });

    it('moves a task', async () => {
      const record = await manager.createTask({
        title: 'Task', description: '', status: 'backlog', priority: 'medium',
      });
      const moved = manager.moveTask(record.id, 'done');

      expect(moved.status).toBe('done');
      expect(moved.completedAt).not.toBeNull();
    });

    it('reorders a task with mirror update', async () => {
      const record = await manager.createTask({
        title: 'Reorder me', description: '', status: 'todo', priority: 'medium',
      });
      const events: unknown[] = [];
      emitter.on('task:updated', (d) => events.push(d));

      const reordered = manager.reorderTask(record.id, 5000);

      expect(reordered.order).toBe(5000);
      expect(events.length).toBe(1);
    });

    it('bulk deletes tasks and removes mirror dirs', async () => {
      const t1 = await manager.createTask({ title: 'A', description: '' });
      const t2 = await manager.createTask({ title: 'B', description: '' });

      expect(existsSync(join(projectDir, '.tasks', t1.slug))).toBe(true);
      expect(existsSync(join(projectDir, '.tasks', t2.slug))).toBe(true);

      const events: unknown[] = [];
      emitter.on('task:bulk_deleted', (d) => events.push(d));

      const count = manager.bulkDeleteTasks([t1.id, t2.id]);
      expect(count).toBe(2);
      expect(existsSync(join(projectDir, '.tasks', t1.slug))).toBe(false);
      expect(existsSync(join(projectDir, '.tasks', t2.slug))).toBe(false);
      expect(events.length).toBe(1);
    });

    it('bulk moves tasks with mirror updates', async () => {
      const t1 = await manager.createTask({ title: 'A', description: '', status: 'todo' });
      const t2 = await manager.createTask({ title: 'B', description: '', status: 'todo' });

      const events: unknown[] = [];
      emitter.on('task:bulk_moved', (d) => events.push(d));

      const count = manager.bulkMoveTasks([t1.id, t2.id], 'done');
      expect(count).toBe(2);
      expect(events.length).toBe(1);

      // Verify tasks actually moved
      expect(manager.getTask(t1.id)!.status).toBe('done');
      expect(manager.getTask(t2.id)!.status).toBe('done');
    });

    it('bulk updates priority with mirror updates', async () => {
      const t1 = await manager.createTask({ title: 'A', description: '', priority: 'low' });
      const t2 = await manager.createTask({ title: 'B', description: '', priority: 'low' });

      const events: unknown[] = [];
      emitter.on('task:bulk_priority', (d) => events.push(d));

      const count = manager.bulkPriorityTasks([t1.id, t2.id], 'critical');
      expect(count).toBe(2);
      expect(events.length).toBe(1);

      expect(manager.getTask(t1.id)!.priority).toBe('critical');
      expect(manager.getTask(t2.id)!.priority).toBe('critical');
    });
  });

  // =========================================================================
  // Epics
  // =========================================================================

  describe('epics', () => {
    it('creates an epic with mirror', async () => {
      const record = await manager.createEpic({
        title: 'Release v2', description: 'Major release',
      });

      expect(record.title).toBe('Release v2');
      expect(record.status).toBe('open');
      expect(existsSync(join(projectDir, '.epics', record.slug, 'events.jsonl'))).toBe(true);
    });

    it('links and unlinks a task to an epic', async () => {
      const epic = await manager.createEpic({ title: 'Epic', description: '' });
      const task = await manager.createTask({ title: 'Task', description: '' });

      manager.linkTaskToEpic(epic.id, task.id);

      const epicDetail = manager.getEpic(epic.id)!;
      expect(epicDetail.progress.total).toBe(1);

      manager.unlinkTaskFromEpic(epic.id, task.id);
      const epicAfter = manager.getEpic(epic.id)!;
      expect(epicAfter.progress.total).toBe(0);
    });
  });

  // =========================================================================
  // Skills
  // =========================================================================

  describe('skills', () => {
    it('creates a skill with mirror', async () => {
      const record = await manager.createSkill({
        title: 'Deploy', description: 'Deploy to prod',
        steps: ['build', 'push'], triggers: ['on merge'],
      });

      expect(record.steps).toEqual(['build', 'push']);
      expect(existsSync(join(projectDir, '.skills', record.slug, 'events.jsonl'))).toBe(true);
    });

    it('bumps skill usage', async () => {
      const record = await manager.createSkill({ title: 'Skill', description: '' });
      expect(record.usageCount).toBe(0);

      manager.bumpSkillUsage(record.id);

      const updated = manager.getSkill(record.id)!;
      expect(updated.usageCount).toBe(1);
      expect(updated.lastUsedAt).not.toBeNull();
    });
  });

  // =========================================================================
  // Edges
  // =========================================================================

  describe('edges', () => {
    it('creates and lists edges', async () => {
      const note = await manager.createNote({ title: 'Note', content: '' });
      const task = await manager.createTask({ title: 'Task', description: '' });

      manager.createEdge({
        fromGraph: 'knowledge', fromId: note.id,
        toGraph: 'tasks', toId: task.id,
        kind: 'relates_to',
      });

      const edges = manager.listEdges({ fromGraph: 'knowledge', fromId: note.id });
      expect(edges.length).toBe(1);
      expect(edges[0].toId).toBe(task.id);
    });
  });

  // =========================================================================
  // Attachments
  // =========================================================================

  describe('attachments', () => {
    it('adds and removes an attachment', async () => {
      const note = await manager.createNote({ title: 'Note', content: '' });
      const data = Buffer.from('hello');

      const meta = manager.addAttachment('knowledge', note.id, note.slug, 'test.txt', data);
      expect(meta.filename).toBe('test.txt');
      expect(meta.size).toBe(5);

      const list = manager.listAttachments('knowledge', note.id);
      expect(list.length).toBe(1);

      manager.removeAttachment('knowledge', note.id, note.slug, 'test.txt');
      expect(manager.listAttachments('knowledge', note.id).length).toBe(0);
    });
  });
});
