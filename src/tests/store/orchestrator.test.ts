import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import { SqliteStore } from '@/store';
import { GraphOrchestrator } from '@/lib/orchestrator';
import { seedEmbedding } from './helpers';

async function fakeEmbed(text: string): Promise<number[]> {
  return seedEmbedding(text.length);
}

describe('GraphOrchestrator', () => {
  let store: SqliteStore;
  let orchestrator: GraphOrchestrator;
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

    orchestrator = new GraphOrchestrator({
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

      const record = await orchestrator.createNote({ title: 'Hello', content: 'World', tags: ['test'] });

      expect(record.title).toBe('Hello');
      expect(record.content).toBe('World');
      expect(record.tags).toEqual(['test']);
      expect(events.length).toBe(1);

      // Mirror written
      expect(existsSync(join(projectDir, '.notes', record.slug, 'events.jsonl'))).toBe(true);
      expect(existsSync(join(projectDir, '.notes', record.slug, 'content.md'))).toBe(true);
    });

    it('updates a note with re-embedding on content change', async () => {
      const record = await orchestrator.createNote({ title: 'Original', content: 'Content' });
      const updated = await orchestrator.updateNote(record.id, { content: 'New content' });

      expect(updated.content).toBe('New content');
      expect(updated.version).toBe(record.version + 1);
    });

    it('deletes a note and removes mirror dir', async () => {
      const record = await orchestrator.createNote({ title: 'ToDelete', content: '' });
      const mirrorDir = join(projectDir, '.notes', record.slug);
      expect(existsSync(mirrorDir)).toBe(true);

      orchestrator.deleteNote(record.id);

      expect(orchestrator.getNote(record.id)).toBeNull();
      expect(existsSync(mirrorDir)).toBe(false);
    });

    it('searches notes', async () => {
      await orchestrator.createNote({ title: 'Alpha', content: 'First note' });
      await orchestrator.createNote({ title: 'Beta', content: 'Second note' });

      const results = await orchestrator.searchNotes({ text: 'alpha', searchMode: 'keyword' });
      expect(results.length).toBe(1);
    });
  });

  // =========================================================================
  // Tasks
  // =========================================================================

  describe('tasks', () => {
    it('creates a task with mirror', async () => {
      const record = await orchestrator.createTask({
        title: 'Fix bug', description: 'Urgent', status: 'todo', priority: 'high',
      });

      expect(record.status).toBe('todo');
      expect(record.priority).toBe('high');
      expect(existsSync(join(projectDir, '.tasks', record.slug, 'events.jsonl'))).toBe(true);
    });

    it('moves a task', async () => {
      const record = await orchestrator.createTask({
        title: 'Task', description: '', status: 'backlog', priority: 'medium',
      });
      const moved = orchestrator.moveTask(record.id, 'done');

      expect(moved.status).toBe('done');
      expect(moved.completedAt).not.toBeNull();
    });

    it('bulk deletes tasks', async () => {
      const t1 = await orchestrator.createTask({ title: 'A', description: '' });
      const t2 = await orchestrator.createTask({ title: 'B', description: '' });

      const count = orchestrator.bulkDeleteTasks([t1.id, t2.id]);
      expect(count).toBe(2);
    });
  });

  // =========================================================================
  // Epics
  // =========================================================================

  describe('epics', () => {
    it('creates an epic with mirror', async () => {
      const record = await orchestrator.createEpic({
        title: 'Release v2', description: 'Major release',
      });

      expect(record.title).toBe('Release v2');
      expect(record.status).toBe('open');
      expect(existsSync(join(projectDir, '.epics', record.slug, 'events.jsonl'))).toBe(true);
    });

    it('links and unlinks a task to an epic', async () => {
      const epic = await orchestrator.createEpic({ title: 'Epic', description: '' });
      const task = await orchestrator.createTask({ title: 'Task', description: '' });

      orchestrator.linkTaskToEpic(epic.id, task.id);

      const epicDetail = orchestrator.getEpic(epic.id)!;
      expect(epicDetail.progress.total).toBe(1);

      orchestrator.unlinkTaskFromEpic(epic.id, task.id);
      const epicAfter = orchestrator.getEpic(epic.id)!;
      expect(epicAfter.progress.total).toBe(0);
    });
  });

  // =========================================================================
  // Skills
  // =========================================================================

  describe('skills', () => {
    it('creates a skill with mirror', async () => {
      const record = await orchestrator.createSkill({
        title: 'Deploy', description: 'Deploy to prod',
        steps: ['build', 'push'], triggers: ['on merge'],
      });

      expect(record.steps).toEqual(['build', 'push']);
      expect(existsSync(join(projectDir, '.skills', record.slug, 'events.jsonl'))).toBe(true);
    });

    it('bumps skill usage', async () => {
      const record = await orchestrator.createSkill({ title: 'Skill', description: '' });
      expect(record.usageCount).toBe(0);

      orchestrator.bumpSkillUsage(record.id);

      const updated = orchestrator.getSkill(record.id)!;
      expect(updated.usageCount).toBe(1);
      expect(updated.lastUsedAt).not.toBeNull();
    });
  });

  // =========================================================================
  // Edges
  // =========================================================================

  describe('edges', () => {
    it('creates and lists edges', async () => {
      const note = await orchestrator.createNote({ title: 'Note', content: '' });
      const task = await orchestrator.createTask({ title: 'Task', description: '' });

      orchestrator.createEdge({
        fromGraph: 'knowledge', fromId: note.id,
        toGraph: 'tasks', toId: task.id,
        kind: 'relates_to',
      });

      const edges = orchestrator.listEdges({ fromGraph: 'knowledge', fromId: note.id });
      expect(edges.length).toBe(1);
      expect(edges[0].toId).toBe(task.id);
    });
  });

  // =========================================================================
  // Attachments
  // =========================================================================

  describe('attachments', () => {
    it('adds and removes an attachment', async () => {
      const note = await orchestrator.createNote({ title: 'Note', content: '' });
      const data = Buffer.from('hello');

      const meta = orchestrator.addAttachment('knowledge', note.id, note.slug, 'test.txt', data);
      expect(meta.filename).toBe('test.txt');
      expect(meta.size).toBe(5);

      const list = orchestrator.listAttachments('knowledge', note.id);
      expect(list.length).toBe(1);

      orchestrator.removeAttachment('knowledge', note.id, note.slug, 'test.txt');
      expect(orchestrator.listAttachments('knowledge', note.id).length).toBe(0);
    });
  });
});
