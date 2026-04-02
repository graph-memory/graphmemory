import * as fs from 'fs';
import * as path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { importMirrorDirs, resolveDeferredEdges } from '@/store/sqlite/lib/mirror-import';
import type { SqliteStore, ProjectScopedStore } from '@/store';

function embedStub(text: string): number[] {
  // Deterministic embedding based on text length
  return seedEmbedding(text.length);
}

function writeEntityDir(baseDir: string, entityId: string, eventsJsonl: string, contentFile: string, contentBody: string) {
  const dir = path.join(baseDir, entityId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'events.jsonl'), eventsJsonl, 'utf-8');
  fs.writeFileSync(path.join(dir, contentFile), contentBody, 'utf-8');
}

describe('importMirrorDirs', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let scoped: ProjectScopedStore;
  let projectDir: string;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/tmp/test' });
    scoped = store.project(project.id);
    projectDir = mkdtempSync(path.join(tmpdir(), 'mirror-test-'));
  });

  afterEach(() => {
    cleanup();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('imports notes from .notes/ directory', () => {
    const notesDir = path.join(projectDir, '.notes');
    writeEntityDir(notesDir, 'note-uuid-1',
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', op: 'created', id: 'note-uuid-1', title: 'Hello', tags: ['test'], createdAt: 1000000 }) + '\n',
      'content.md', 'Note content here',
    );

    const result = importMirrorDirs(scoped, projectDir, embedStub);

    expect(result.notes).toBe(1);
    expect(result.tasks).toBe(0);
    expect(result.skills).toBe(0);

    const note = scoped.knowledge.getBySlug('note-uuid-1');
    expect(note).not.toBeNull();
    expect(note!.title).toBe('Hello');
    expect(note!.content).toBe('Note content here');
    expect(note!.tags).toEqual(['test']);
  });

  it('imports tasks from .tasks/ directory', () => {
    const tasksDir = path.join(projectDir, '.tasks');
    writeEntityDir(tasksDir, 'task-uuid-1',
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', op: 'created', id: 'task-uuid-1', title: 'Fix bug', status: 'todo', priority: 'high', tags: ['bug'], dueDate: null, estimate: 4, completedAt: null, createdAt: 1000000 }) + '\n',
      'description.md', 'Bug description',
    );

    const result = importMirrorDirs(scoped, projectDir, embedStub);

    expect(result.tasks).toBe(1);

    const task = scoped.tasks.getBySlug('task-uuid-1');
    expect(task).not.toBeNull();
    expect(task!.title).toBe('Fix bug');
    expect(task!.status).toBe('todo');
    expect(task!.priority).toBe('high');
    expect(task!.description).toBe('Bug description');
  });

  it('imports skills from .skills/ directory', () => {
    const skillsDir = path.join(projectDir, '.skills');
    writeEntityDir(skillsDir, 'skill-uuid-1',
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', op: 'created', id: 'skill-uuid-1', title: 'Deploy', tags: [], steps: ['build', 'push'], triggers: ['on merge'], inputHints: [], filePatterns: [], source: 'user', confidence: 1, usageCount: 3, lastUsedAt: 2000000, createdAt: 1000000 }) + '\n',
      'description.md', 'Deploy to prod',
    );

    const result = importMirrorDirs(scoped, projectDir, embedStub);

    expect(result.skills).toBe(1);

    const skill = scoped.skills.getBySlug('skill-uuid-1');
    expect(skill).not.toBeNull();
    expect(skill!.title).toBe('Deploy');
    expect(skill!.steps).toEqual(['build', 'push']);
    expect(skill!.usageCount).toBe(3);
  });

  it('replays update events', () => {
    const notesDir = path.join(projectDir, '.notes');
    const events = [
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', op: 'created', id: 'evolving', title: 'First', tags: ['a'], createdAt: 1000000 }),
      JSON.stringify({ ts: '2026-01-02T00:00:00Z', op: 'update', title: 'Second', tags: ['b', 'c'] }),
      JSON.stringify({ ts: '2026-01-03T00:00:00Z', op: 'update', title: 'Third' }),
    ].join('\n') + '\n';
    writeEntityDir(notesDir, 'evolving', events, 'content.md', 'Final content');

    importMirrorDirs(scoped, projectDir, embedStub);

    const note = scoped.knowledge.getBySlug('evolving');
    expect(note!.title).toBe('Third');
    expect(note!.tags).toEqual(['b', 'c']);
    expect(note!.content).toBe('Final content');
    expect(note!.version).toBe(3); // event count
  });

  it('collects same-graph deferred edges and resolves them', () => {
    const notesDir = path.join(projectDir, '.notes');

    // Note A with relation to Note B
    const eventsA = [
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', op: 'created', id: 'note-a', title: 'Note A', tags: [], createdAt: 1000000 }),
      JSON.stringify({ ts: '2026-01-01T00:01:00Z', op: 'relation', action: 'add', kind: 'relates_to', to: 'note-b' }),
    ].join('\n') + '\n';
    writeEntityDir(notesDir, 'note-a', eventsA, 'content.md', 'A content');

    // Note B
    writeEntityDir(notesDir, 'note-b',
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', op: 'created', id: 'note-b', title: 'Note B', tags: [], createdAt: 1000000 }) + '\n',
      'content.md', 'B content',
    );

    const result = importMirrorDirs(scoped, projectDir, embedStub);

    expect(result.deferredEdges.length).toBe(1);
    expect(result.deferredEdges[0].toSlug).toBe('note-b');
    expect(result.deferredEdges[0].toGraph).toBe('knowledge');

    // Resolve
    const resolved = resolveDeferredEdges(scoped, result.deferredEdges);
    expect(resolved.resolved).toBe(1);
    expect(resolved.failed).toBe(0);

    // Verify edge exists
    const noteA = scoped.knowledge.getBySlug('note-a')!;
    const noteB = scoped.knowledge.getBySlug('note-b')!;
    const edges = scoped.listEdges({ fromGraph: 'knowledge', fromId: noteA.id });
    expect(edges.some(e => e.toId === noteB.id && e.kind === 'relates_to')).toBe(true);
  });

  it('collects cross-graph deferred edges', () => {
    const notesDir = path.join(projectDir, '.notes');

    const events = [
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', op: 'created', id: 'note-x', title: 'Note X', tags: [], createdAt: 1000000 }),
      JSON.stringify({ ts: '2026-01-01T00:01:00Z', op: 'relation', action: 'add', kind: 'documents', to: 'README.md', graph: 'docs' }),
    ].join('\n') + '\n';
    writeEntityDir(notesDir, 'note-x', events, 'content.md', '');

    const result = importMirrorDirs(scoped, projectDir, embedStub);

    expect(result.deferredEdges.length).toBe(1);
    expect(result.deferredEdges[0].toGraph).toBe('docs');
    expect(result.deferredEdges[0].toSlug).toBe('README.md');
  });

  it('imports epics from .epics/ directory', () => {
    const epicsDir = path.join(projectDir, '.epics');
    writeEntityDir(epicsDir, 'epic-uuid-1',
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', op: 'created', id: 'epic-uuid-1', title: 'Release v2', status: 'open', priority: 'high', tags: ['release'], createdAt: 1000000 }) + '\n',
      'description.md', 'Major release',
    );

    const result = importMirrorDirs(scoped, projectDir, embedStub);

    expect(result.epics).toBe(1);

    const epic = scoped.epics.getBySlug('epic-uuid-1');
    expect(epic).not.toBeNull();
    expect(epic!.title).toBe('Release v2');
    expect(epic!.status).toBe('open');
    expect(epic!.priority).toBe('high');
    expect(epic!.description).toBe('Major release');
  });

  it('handles empty project directory gracefully', () => {
    const result = importMirrorDirs(scoped, projectDir, embedStub);
    expect(result.notes).toBe(0);
    expect(result.tasks).toBe(0);
    expect(result.skills).toBe(0);
    expect(result.deferredEdges).toEqual([]);
  });

  it('is idempotent — re-import updates without duplicating', () => {
    const notesDir = path.join(projectDir, '.notes');
    writeEntityDir(notesDir, 'idem-note',
      JSON.stringify({ ts: '2026-01-01T00:00:00Z', op: 'created', id: 'idem-note', title: 'Stable', tags: [], createdAt: 1000000 }) + '\n',
      'content.md', 'Content',
    );

    importMirrorDirs(scoped, projectDir, embedStub);
    importMirrorDirs(scoped, projectDir, embedStub);

    const notes = scoped.knowledge.list();
    expect(notes.total).toBe(1);
  });
});
