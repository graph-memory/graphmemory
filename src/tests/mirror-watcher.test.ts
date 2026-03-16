import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MirrorWriteTracker } from '../lib/mirror-watcher';
import { KnowledgeGraphManager } from '../graphs/knowledge';
import { TaskGraphManager } from '../graphs/task';
import { createKnowledgeGraph } from '../graphs/knowledge-types';
import { createTaskGraph } from '../graphs/task-types';
import { noopContext } from '../graphs/manager-types';
import { writeNoteFile, writeTaskFile } from '../lib/file-mirror';
import { parseNoteFile, parseTaskFile } from '../lib/file-import';
import { unitVec, DIM } from './helpers';

const fakeEmbed = (_q: string) => Promise.resolve(unitVec(0, DIM));

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-watcher-test-'));
}

// ---------------------------------------------------------------------------
// MirrorWriteTracker
// ---------------------------------------------------------------------------

describe('MirrorWriteTracker', () => {
  it('detects own write', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'test.md');
    fs.writeFileSync(fp, 'hello');

    const tracker = new MirrorWriteTracker();
    tracker.recordWrite(fp);
    expect(tracker.isOwnWrite(fp)).toBe(true);
  });

  it('returns false for external write', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'test.md');
    fs.writeFileSync(fp, 'hello');

    const tracker = new MirrorWriteTracker();
    // don't record
    expect(tracker.isOwnWrite(fp)).toBe(false);
  });

  it('consumes record (second call returns false)', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'test.md');
    fs.writeFileSync(fp, 'hello');

    const tracker = new MirrorWriteTracker();
    tracker.recordWrite(fp);
    expect(tracker.isOwnWrite(fp)).toBe(true);
    expect(tracker.isOwnWrite(fp)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// KnowledgeGraphManager.importFromFile
// ---------------------------------------------------------------------------

describe('KnowledgeGraphManager.importFromFile', () => {
  it('creates a new note from file', async () => {
    const graph = createKnowledgeGraph();
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, noopContext());

    await mgr.importFromFile({
      id: 'imported-note',
      title: 'Imported Note',
      content: 'Content from file.',
      tags: ['test', 'import'],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      relations: [],
      attachments: [],
    });

    expect(graph.hasNode('imported-note')).toBe(true);
    const attrs = graph.getNodeAttributes('imported-note');
    expect(attrs.title).toBe('Imported Note');
    expect(attrs.content).toBe('Content from file.');
    expect(attrs.tags).toEqual(['test', 'import']);
    expect(attrs.embedding).toHaveLength(DIM);
  });

  it('updates an existing note from file', async () => {
    const graph = createKnowledgeGraph();
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, noopContext());

    // Create initial note
    await mgr.createNote('Existing Note', 'Old content', ['old']);
    const noteId = 'existing-note';
    expect(graph.hasNode(noteId)).toBe(true);
    const originalCreatedAt = graph.getNodeAttribute(noteId, 'createdAt');

    // Import updated version
    await mgr.importFromFile({
      id: noteId,
      title: 'Updated Title',
      content: 'New content from file.',
      tags: ['updated'],
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
      relations: [],
      attachments: [],
    });

    const attrs = graph.getNodeAttributes(noteId);
    expect(attrs.title).toBe('Updated Title');
    expect(attrs.content).toBe('New content from file.');
    expect(attrs.tags).toEqual(['updated']);
    // createdAt should be preserved from graph
    expect(attrs.createdAt).toBe(originalCreatedAt);
  });

  it('syncs relations from file', async () => {
    const graph = createKnowledgeGraph();
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, noopContext());

    // Create two notes
    await mgr.createNote('Note A', 'Content A', []);
    await mgr.createNote('Note B', 'Content B', []);

    // Import note-a with relation to note-b
    await mgr.importFromFile({
      id: 'note-a',
      title: 'Note A',
      content: 'Updated A',
      tags: [],
      createdAt: null,
      updatedAt: null,
      relations: [{ to: 'note-b', kind: 'depends_on' }],
      attachments: [],
    });

    expect(graph.hasEdge('note-a', 'note-b')).toBe(true);
    expect(graph.getEdgeAttribute('note-a', 'note-b', 'kind')).toBe('depends_on');
  });
});

describe('KnowledgeGraphManager.deleteFromFile', () => {
  it('deletes a note', async () => {
    const graph = createKnowledgeGraph();
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, noopContext());

    await mgr.createNote('To Delete', 'Content', []);
    expect(graph.hasNode('to-delete')).toBe(true);

    mgr.deleteFromFile('to-delete');
    expect(graph.hasNode('to-delete')).toBe(false);
  });

  it('ignores non-existent note', () => {
    const graph = createKnowledgeGraph();
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, noopContext());
    // Should not throw
    mgr.deleteFromFile('nonexistent');
  });
});

// ---------------------------------------------------------------------------
// TaskGraphManager.importFromFile
// ---------------------------------------------------------------------------

describe('TaskGraphManager.importFromFile', () => {
  it('creates a new task from file', async () => {
    const graph = createTaskGraph();
    const mgr = new TaskGraphManager(graph, fakeEmbed, noopContext());

    await mgr.importFromFile({
      id: 'imported-task',
      title: 'Imported Task',
      description: 'Description from file.',
      status: 'in_progress',
      priority: 'high',
      tags: ['import'],
      dueDate: 1700000000000,
      estimate: 4,
      completedAt: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      relations: [],
      attachments: [],
    });

    expect(graph.hasNode('imported-task')).toBe(true);
    const attrs = graph.getNodeAttributes('imported-task');
    expect(attrs.title).toBe('Imported Task');
    expect(attrs.status).toBe('in_progress');
    expect(attrs.priority).toBe('high');
    expect(attrs.dueDate).toBe(1700000000000);
    expect(attrs.estimate).toBe(4);
  });

  it('updates an existing task with file values (no auto completedAt)', async () => {
    const graph = createTaskGraph();
    const mgr = new TaskGraphManager(graph, fakeEmbed, noopContext());

    await mgr.createTask('My Task', 'Desc', 'todo', 'medium', []);

    // Import as done with explicit completedAt
    await mgr.importFromFile({
      id: 'my-task',
      title: 'My Task Updated',
      description: 'Updated desc',
      status: 'done',
      priority: 'low',
      tags: ['done'],
      dueDate: null,
      estimate: null,
      completedAt: 1700000005000,
      createdAt: null,
      updatedAt: null,
      relations: [],
      attachments: [],
    });

    const attrs = graph.getNodeAttributes('my-task');
    expect(attrs.title).toBe('My Task Updated');
    expect(attrs.status).toBe('done');
    expect(attrs.completedAt).toBe(1700000005000); // from file, not auto-set
  });
});

describe('TaskGraphManager.deleteFromFile', () => {
  it('deletes a task', async () => {
    const graph = createTaskGraph();
    const mgr = new TaskGraphManager(graph, fakeEmbed, noopContext());

    await mgr.createTask('Delete Me', 'Desc', 'todo', 'medium', []);
    expect(graph.hasNode('delete-me')).toBe(true);

    mgr.deleteFromFile('delete-me');
    expect(graph.hasNode('delete-me')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: writeNoteFile → parseNoteFile → importFromFile
// ---------------------------------------------------------------------------

describe('round-trip note write → parse → import', () => {
  it('produces identical graph state', async () => {
    const dir = tmpDir();
    const notesDir = path.join(dir, '.notes');
    fs.mkdirSync(notesDir, { recursive: true });

    // Write a note file
    writeNoteFile(notesDir, 'round-trip', {
      title: 'Round Trip Note',
      content: 'Test content for round trip.',
      tags: ['rt', 'test'],
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    }, []);

    // Parse it back
    const parsed = parseNoteFile(path.join(notesDir, 'round-trip', 'note.md'));
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe('Round Trip Note');
    expect(parsed!.content).toBe('Test content for round trip.');
    expect(parsed!.tags).toEqual(['rt', 'test']);

    // Import into graph
    const graph = createKnowledgeGraph();
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, noopContext());
    await mgr.importFromFile(parsed!);

    expect(graph.hasNode('round-trip')).toBe(true);
    const attrs = graph.getNodeAttributes('round-trip');
    expect(attrs.title).toBe('Round Trip Note');
    expect(attrs.content).toBe('Test content for round trip.');
  });
});

describe('round-trip task write → parse → import', () => {
  it('produces identical graph state', async () => {
    const dir = tmpDir();
    const tasksDir = path.join(dir, '.tasks');
    fs.mkdirSync(tasksDir, { recursive: true });

    writeTaskFile(tasksDir, 'rt-task', {
      title: 'Round Trip Task',
      description: 'Task description.',
      status: 'in_progress',
      priority: 'high',
      tags: ['rt'],
      dueDate: 1700000000000,
      estimate: 8,
      completedAt: null,
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    }, []);

    const parsed = parseTaskFile(path.join(tasksDir, 'rt-task', 'task.md'));
    expect(parsed).not.toBeNull();
    expect(parsed!.status).toBe('in_progress');
    expect(parsed!.priority).toBe('high');
    expect(parsed!.estimate).toBe(8);

    const graph = createTaskGraph();
    const mgr = new TaskGraphManager(graph, fakeEmbed, noopContext());
    await mgr.importFromFile(parsed!);

    const attrs = graph.getNodeAttributes('rt-task');
    expect(attrs.title).toBe('Round Trip Task');
    expect(attrs.status).toBe('in_progress');
    expect(attrs.estimate).toBe(8);
  });
});
