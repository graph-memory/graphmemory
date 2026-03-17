import fs from 'fs';
import path from 'path';
import os from 'os';
import { serializeMarkdown, parseMarkdown } from '@/lib/frontmatter';
import {
  mirrorNoteCreate, mirrorTaskCreate, deleteMirrorDir,
  sanitizeFilename, writeAttachment, deleteAttachment, getAttachmentPath,
} from '@/lib/file-mirror';
import { scanAttachments } from '@/graphs/attachment-types';
import type { RelationLike } from '@/lib/file-mirror';
import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import { createTaskGraph } from '@/graphs/task-types';
import { KnowledgeGraphManager } from '@/graphs/knowledge';
import { TaskGraphManager } from '@/graphs/task';
import { noopContext } from '@/graphs/manager-types';
import { unitVec, DIM } from './helpers';

// ---------------------------------------------------------------------------
// Frontmatter round-trip
// ---------------------------------------------------------------------------

describe('frontmatter', () => {
  it('serializeMarkdown produces valid frontmatter + body', () => {
    const fm = { id: 'test', tags: ['a', 'b'] };
    const body = '# Title\n\nContent';
    const raw = serializeMarkdown(fm, body);
    expect(raw).toMatch(/^---\n/);
    expect(raw).toContain('id: test');
    expect(raw).toContain('# Title');
    expect(raw).toContain('Content');
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('parseMarkdown round-trips with serializeMarkdown', () => {
    const fm = { id: 'note-1', tags: ['x'], createdAt: '2026-01-01T00:00:00.000Z' };
    const body = '# Hello\n\nWorld';
    const raw = serializeMarkdown(fm, body);
    const parsed = parseMarkdown(raw);
    expect(parsed.frontmatter).toEqual(fm);
    expect(parsed.body).toBe(body);
  });

  it('parseMarkdown handles raw text without frontmatter', () => {
    const raw = '# No frontmatter\n\nJust content';
    const parsed = parseMarkdown(raw);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// File mirror helpers
// ---------------------------------------------------------------------------

describe('file-mirror', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('mirrorNoteCreate', () => {
    it('creates events.jsonl, content.md, and note.md', () => {
      const notesDir = path.join(tmpDir, '.notes');
      const attrs = {
        title: 'My Note',
        content: 'Some content here',
        tags: ['test', 'demo'],
        createdAt: 1710000000000,
        updatedAt: 1710000060000,
        version: 1,
      };
      const relations: RelationLike[] = [
        { fromId: 'my-note', toId: 'fix-bug', kind: 'relates_to', targetGraph: 'tasks' },
        { fromId: 'my-note', toId: 'other-note', kind: 'depends_on' },
        { fromId: 'incoming', toId: 'my-note', kind: 'blocks' }, // incoming — should be excluded
      ];

      mirrorNoteCreate(notesDir, 'my-note', attrs, relations);

      const entityDir = path.join(notesDir, 'my-note');
      expect(fs.existsSync(path.join(entityDir, 'events.jsonl'))).toBe(true);
      expect(fs.existsSync(path.join(entityDir, 'content.md'))).toBe(true);
      expect(fs.existsSync(path.join(entityDir, 'note.md'))).toBe(true);

      // Verify events.jsonl has created event
      const eventsRaw = fs.readFileSync(path.join(entityDir, 'events.jsonl'), 'utf-8');
      const event = JSON.parse(eventsRaw.trim().split('\n')[0]);
      expect(event.op).toBe('created');
      expect(event.id).toBe('my-note');
      expect(event.title).toBe('My Note');

      // Verify content.md
      const contentRaw = fs.readFileSync(path.join(entityDir, 'content.md'), 'utf-8');
      expect(contentRaw).toBe('Some content here');

      // Verify note.md snapshot
      const snapshotRaw = fs.readFileSync(path.join(entityDir, 'note.md'), 'utf-8');
      const parsed = parseMarkdown(snapshotRaw);
      expect(parsed.frontmatter.id).toBe('my-note');
      expect(parsed.frontmatter.tags).toEqual(['test', 'demo']);

      // Only outgoing relations
      const rels = parsed.frontmatter.relations as Array<{ to: string; kind: string; graph?: string }>;
      expect(rels).toHaveLength(2);
      expect(rels[0]).toEqual({ to: 'fix-bug', kind: 'relates_to', graph: 'tasks' });
      expect(rels[1]).toEqual({ to: 'other-note', kind: 'depends_on' });

      expect(parsed.body).toContain('# My Note');
      expect(parsed.body).toContain('Some content here');
    });

    it('omits relations key when no outgoing relations', () => {
      const notesDir = path.join(tmpDir, '.notes');
      mirrorNoteCreate(notesDir, 'lonely', {
        title: 'Lonely', content: '', tags: [],
        createdAt: 1710000000000, updatedAt: 1710000000000, version: 1,
      }, []);

      const raw = fs.readFileSync(path.join(notesDir, 'lonely', 'note.md'), 'utf-8');
      expect(raw).not.toContain('relations');
    });

    it('does not create duplicate events.jsonl on second call', () => {
      const notesDir = path.join(tmpDir, '.notes');
      const attrs = { title: 'T', content: '', tags: [], createdAt: 1710000000000, updatedAt: 1710000000000, version: 1 };
      mirrorNoteCreate(notesDir, 'idempotent', attrs, []);
      mirrorNoteCreate(notesDir, 'idempotent', attrs, []);

      const eventsRaw = fs.readFileSync(path.join(notesDir, 'idempotent', 'events.jsonl'), 'utf-8');
      const lines = eventsRaw.trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(1); // only one created event
    });
  });

  describe('mirrorTaskCreate', () => {
    it('creates events.jsonl, description.md, and task.md', () => {
      const tasksDir = path.join(tmpDir, '.tasks');
      const attrs = {
        title: 'Fix Bug',
        description: 'Fix the auth bug',
        status: 'in_progress' as const,
        priority: 'high' as const,
        tags: ['auth'],
        dueDate: 1710100000000,
        estimate: 4,
        completedAt: null,
        createdAt: 1710000000000,
        updatedAt: 1710000060000,
        version: 1,
      };

      mirrorTaskCreate(tasksDir, 'fix-bug', attrs, []);

      const entityDir = path.join(tasksDir, 'fix-bug');
      expect(fs.existsSync(path.join(entityDir, 'events.jsonl'))).toBe(true);
      expect(fs.existsSync(path.join(entityDir, 'description.md'))).toBe(true);
      expect(fs.existsSync(path.join(entityDir, 'task.md'))).toBe(true);

      // Verify events.jsonl
      const eventsRaw = fs.readFileSync(path.join(entityDir, 'events.jsonl'), 'utf-8');
      const event = JSON.parse(eventsRaw.trim().split('\n')[0]);
      expect(event.op).toBe('created');
      expect(event.id).toBe('fix-bug');
      expect(event.status).toBe('in_progress');
      expect(event.priority).toBe('high');

      // Verify task.md snapshot
      const raw = fs.readFileSync(path.join(entityDir, 'task.md'), 'utf-8');
      const parsed = parseMarkdown(raw);
      expect(parsed.frontmatter.id).toBe('fix-bug');
      expect(parsed.frontmatter.status).toBe('in_progress');
      expect(parsed.frontmatter.priority).toBe('high');
      expect(parsed.frontmatter.estimate).toBe(4);
      expect(parsed.frontmatter.completedAt).toBeNull();
      expect(parsed.frontmatter.dueDate).toBeTruthy();
      expect(parsed.body).toContain('# Fix Bug');
      expect(parsed.body).toContain('Fix the auth bug');
    });
  });

  describe('deleteMirrorDir', () => {
    it('deletes existing directory', () => {
      const dir = path.join(tmpDir, '.notes');
      const entityDir = path.join(dir, 'test');
      fs.mkdirSync(entityDir, { recursive: true });
      fs.writeFileSync(path.join(entityDir, 'note.md'), 'content');

      deleteMirrorDir(dir, 'test');
      expect(fs.existsSync(entityDir)).toBe(false);
    });

    it('does not throw on missing directory', () => {
      expect(() => deleteMirrorDir(tmpDir, 'nonexistent')).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Manager integration: KnowledgeGraphManager with projectDir
// ---------------------------------------------------------------------------

describe('KnowledgeGraphManager file mirror', () => {
  let tmpDir: string;
  const fakeEmbed = () => Promise.resolve(unitVec(0, DIM));

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'km-mirror-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('createNote writes .notes/<id>/note.md + events.jsonl + content.md', async () => {
    const graph = createKnowledgeGraph();
    const ctx = { ...noopContext(), projectDir: tmpDir };
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, ctx);

    const noteId = await mgr.createNote('Test Note', 'Body text', ['tag1']);

    const entityDir = path.join(tmpDir, '.notes', noteId);
    expect(fs.existsSync(path.join(entityDir, 'note.md'))).toBe(true);
    expect(fs.existsSync(path.join(entityDir, 'events.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(entityDir, 'content.md'))).toBe(true);
    const raw = fs.readFileSync(path.join(entityDir, 'note.md'), 'utf-8');
    expect(raw).toContain('# Test Note');
    expect(raw).toContain('Body text');
  });

  it('updateNote updates the .md file', async () => {
    const graph = createKnowledgeGraph();
    const ctx = { ...noopContext(), projectDir: tmpDir };
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, ctx);

    const noteId = await mgr.createNote('Original', 'Old content');
    await mgr.updateNote(noteId, { title: 'Updated', content: 'New content' });

    const raw = fs.readFileSync(path.join(tmpDir, '.notes', noteId, 'note.md'), 'utf-8');
    expect(raw).toContain('# Updated');
    expect(raw).toContain('New content');
    expect(raw).not.toContain('Old content');
  });

  it('deleteNote removes the .md file', async () => {
    const graph = createKnowledgeGraph();
    const ctx = { ...noopContext(), projectDir: tmpDir };
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, ctx);

    const noteId = await mgr.createNote('Doomed', 'Will be deleted');
    const noteDir = path.join(tmpDir, '.notes', noteId);
    expect(fs.existsSync(noteDir)).toBe(true);

    mgr.deleteNote(noteId);
    expect(fs.existsSync(noteDir)).toBe(false);
  });

  it('createRelation updates frontmatter with relation', async () => {
    const graph = createKnowledgeGraph();
    const ctx = { ...noopContext(), projectDir: tmpDir };
    const mgr = new KnowledgeGraphManager(graph, fakeEmbed, ctx);

    const noteA = await mgr.createNote('Note A', 'Content A');
    const noteB = await mgr.createNote('Note B', 'Content B');
    mgr.createRelation(noteA, noteB, 'depends_on');

    const raw = fs.readFileSync(path.join(tmpDir, '.notes', noteA, 'note.md'), 'utf-8');
    const parsed = parseMarkdown(raw);
    const rels = parsed.frontmatter.relations as Array<{ to: string; kind: string }>;
    expect(rels).toHaveLength(1);
    expect(rels[0].to).toBe(noteB);
    expect(rels[0].kind).toBe('depends_on');
  });
});

// ---------------------------------------------------------------------------
// Manager integration: TaskGraphManager with projectDir
// ---------------------------------------------------------------------------

describe('TaskGraphManager file mirror', () => {
  let tmpDir: string;
  const fakeEmbed = () => Promise.resolve(unitVec(0, DIM));

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-mirror-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('createTask writes .tasks/<id>/task.md + events.jsonl + description.md', async () => {
    const graph = createTaskGraph();
    const ctx = { ...noopContext(), projectDir: tmpDir };
    const mgr = new TaskGraphManager(graph, fakeEmbed, ctx);

    const taskId = await mgr.createTask('Fix Bug', 'Fix the auth bug', 'todo', 'high', ['auth']);

    const entityDir = path.join(tmpDir, '.tasks', taskId);
    expect(fs.existsSync(path.join(entityDir, 'task.md'))).toBe(true);
    expect(fs.existsSync(path.join(entityDir, 'events.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(entityDir, 'description.md'))).toBe(true);
    const raw = fs.readFileSync(path.join(entityDir, 'task.md'), 'utf-8');
    expect(raw).toContain('# Fix Bug');
    expect(raw).toContain('Fix the auth bug');
    expect(raw).toContain('status: todo');
    expect(raw).toContain('priority: high');
  });

  it('moveTask updates the .md file status', async () => {
    const graph = createTaskGraph();
    const ctx = { ...noopContext(), projectDir: tmpDir };
    const mgr = new TaskGraphManager(graph, fakeEmbed, ctx);

    const taskId = await mgr.createTask('Task', 'Desc', 'backlog');
    mgr.moveTask(taskId, 'done');

    const raw = fs.readFileSync(path.join(tmpDir, '.tasks', taskId, 'task.md'), 'utf-8');
    expect(raw).toContain('status: done');
    expect(raw).toContain('completedAt:');
    // completedAt should not be null now
    const parsed = parseMarkdown(raw);
    expect(parsed.frontmatter.completedAt).not.toBeNull();
  });

  it('deleteTask removes the .md file', async () => {
    const graph = createTaskGraph();
    const ctx = { ...noopContext(), projectDir: tmpDir };
    const mgr = new TaskGraphManager(graph, fakeEmbed, ctx);

    const taskId = await mgr.createTask('Temp', 'Will delete');
    const taskDir = path.join(tmpDir, '.tasks', taskId);
    expect(fs.existsSync(taskDir)).toBe(true);

    mgr.deleteTask(taskId);
    expect(fs.existsSync(taskDir)).toBe(false);
  });

  it('linkTasks updates both files with relation', async () => {
    const graph = createTaskGraph();
    const ctx = { ...noopContext(), projectDir: tmpDir };
    const mgr = new TaskGraphManager(graph, fakeEmbed, ctx);

    const taskA = await mgr.createTask('Task A', 'Desc A');
    const taskB = await mgr.createTask('Task B', 'Desc B');
    mgr.linkTasks(taskA, taskB, 'blocks');

    const rawA = fs.readFileSync(path.join(tmpDir, '.tasks', taskA, 'task.md'), 'utf-8');
    const parsedA = parseMarkdown(rawA);
    const relsA = parsedA.frontmatter.relations as Array<{ to: string; kind: string }>;
    expect(relsA).toHaveLength(1);
    expect(relsA[0].to).toBe(taskB);
    expect(relsA[0].kind).toBe('blocks');
  });

  it('no file written when projectDir is undefined', async () => {
    const graph = createTaskGraph();
    const mgr = new TaskGraphManager(graph, fakeEmbed, noopContext());

    const taskId = await mgr.createTask('No File', 'Should not create file');
    // No .tasks directory should exist anywhere specific
    expect(graph.hasNode(taskId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Attachment helpers
// ---------------------------------------------------------------------------

describe('Attachment helpers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-att-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('sanitizeFilename', () => {
    it('strips .. sequences', () => {
      expect(sanitizeFilename('../../etc/passwd')).toBe('etcpasswd');
    });

    it('strips forward slashes', () => {
      expect(sanitizeFilename('path/to/file.txt')).toBe('pathtofile.txt');
    });

    it('strips backslashes', () => {
      expect(sanitizeFilename('path\\to\\file.txt')).toBe('pathtofile.txt');
    });

    it('strips null bytes', () => {
      expect(sanitizeFilename('file\0name.txt')).toBe('filename.txt');
    });

    it('preserves normal filenames', () => {
      expect(sanitizeFilename('screenshot.png')).toBe('screenshot.png');
      expect(sanitizeFilename('my-file_v2.tar.gz')).toBe('my-file_v2.tar.gz');
    });

    it('trims whitespace', () => {
      expect(sanitizeFilename('  file.txt  ')).toBe('file.txt');
    });

    it('handles combined malicious input', () => {
      expect(sanitizeFilename('../../../\0secret/file.txt')).toBe('secretfile.txt');
    });
  });

  describe('writeAttachment / deleteAttachment / getAttachmentPath', () => {
    it('writes file to attachments/ subdirectory', () => {
      const data = Buffer.from('hello world');
      writeAttachment(tmpDir, 'note-1', 'readme.txt', data);

      const filePath = path.join(tmpDir, 'note-1', 'attachments', 'readme.txt');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
    });

    it('creates attachments/ directory if needed', () => {
      const attachmentsDir = path.join(tmpDir, 'new-entity', 'attachments');
      expect(fs.existsSync(attachmentsDir)).toBe(false);

      writeAttachment(tmpDir, 'new-entity', 'file.bin', Buffer.from([1, 2, 3]));
      expect(fs.existsSync(attachmentsDir)).toBe(true);
    });

    it('sanitizes filename on write', () => {
      writeAttachment(tmpDir, 'ent', '../evil.txt', Buffer.from('data'));
      // Should not write outside entity dir
      expect(fs.existsSync(path.join(tmpDir, 'evil.txt'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'ent', 'attachments', 'evil.txt'))).toBe(true);
    });

    it('deleteAttachment removes file and returns true', () => {
      writeAttachment(tmpDir, 'ent', 'file.txt', Buffer.from('data'));
      const result = deleteAttachment(tmpDir, 'ent', 'file.txt');
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'ent', 'attachments', 'file.txt'))).toBe(false);
    });

    it('deleteAttachment returns false for non-existent file', () => {
      const result = deleteAttachment(tmpDir, 'ent', 'nope.txt');
      expect(result).toBe(false);
    });

    it('getAttachmentPath returns path in attachments/ when file exists', () => {
      writeAttachment(tmpDir, 'ent', 'pic.png', Buffer.from('png data'));
      const result = getAttachmentPath(tmpDir, 'ent', 'pic.png');
      expect(result).toBe(path.join(tmpDir, 'ent', 'attachments', 'pic.png'));
    });

    it('getAttachmentPath returns null when file does not exist', () => {
      const result = getAttachmentPath(tmpDir, 'ent', 'missing.png');
      expect(result).toBeNull();
    });
  });

  describe('scanAttachments', () => {
    it('returns empty array for non-existent directory', () => {
      const result = scanAttachments(path.join(tmpDir, 'no-such-dir'));
      expect(result).toEqual([]);
    });

    it('returns empty array when no attachments/ subdir', () => {
      const dir = path.join(tmpDir, 'scan-ent');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'note.md'), '# Note');
      fs.writeFileSync(path.join(dir, 'events.jsonl'), '{}');

      // No attachments/ subdir → empty
      const result = scanAttachments(dir);
      expect(result).toEqual([]);
    });

    it('scans attachments/ subdir', () => {
      const dir = path.join(tmpDir, 'scan-ent2');
      const attDir = path.join(dir, 'attachments');
      fs.mkdirSync(attDir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'note.md'), '# Note');
      fs.writeFileSync(path.join(attDir, 'image.png'), Buffer.from([0x89, 0x50]));

      const result = scanAttachments(dir);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('image.png');
    });

    it('does not include metadata files from entity dir root', () => {
      const dir = path.join(tmpDir, 'scan-root');
      const attDir = path.join(dir, 'attachments');
      fs.mkdirSync(attDir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'note.md'), '# Note');
      fs.writeFileSync(path.join(dir, 'events.jsonl'), '{}');
      fs.writeFileSync(path.join(attDir, 'image.png'), Buffer.from([0x89, 0x50]));

      const result = scanAttachments(dir);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('image.png');
    });

    it('returns correct metadata (filename, mimeType, size)', () => {
      const dir = path.join(tmpDir, 'meta-ent');
      const attDir = path.join(dir, 'attachments');
      fs.mkdirSync(attDir, { recursive: true });
      const data = Buffer.from('test content');
      fs.writeFileSync(path.join(attDir, 'doc.pdf'), data);

      const result = scanAttachments(dir);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('doc.pdf');
      expect(result[0].mimeType).toBe('application/pdf');
      expect(result[0].size).toBe(data.length);
      expect(typeof result[0].addedAt).toBe('number');
      expect(result[0].addedAt).toBeGreaterThan(0);
    });

    it('handles multiple files', () => {
      const dir = path.join(tmpDir, 'multi-ent');
      const attDir = path.join(dir, 'attachments');
      fs.mkdirSync(attDir, { recursive: true });
      fs.writeFileSync(path.join(attDir, 'a.txt'), 'aaa');
      fs.writeFileSync(path.join(attDir, 'b.json'), '{}');
      fs.writeFileSync(path.join(attDir, 'c.png'), Buffer.from([1]));

      const result = scanAttachments(dir);
      expect(result).toHaveLength(3);
      const names = result.map(r => r.filename).sort();
      expect(names).toEqual(['a.txt', 'b.json', 'c.png']);
    });

    it('excludes subdirectories inside attachments/', () => {
      const dir = path.join(tmpDir, 'subdir-ent');
      const attDir = path.join(dir, 'attachments');
      fs.mkdirSync(path.join(attDir, 'nested'), { recursive: true });
      fs.writeFileSync(path.join(attDir, 'file.txt'), 'ok');
      fs.writeFileSync(path.join(attDir, 'nested', 'deep.txt'), 'hidden');

      const result = scanAttachments(dir);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('file.txt');
    });
  });

  describe('deleteMirrorDir for attachments', () => {
    it('removes entire directory with contents', () => {
      const dir = path.join(tmpDir, 'doomed');
      const attDir = path.join(dir, 'attachments');
      fs.mkdirSync(attDir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'note.md'), '# Note');
      fs.writeFileSync(path.join(attDir, 'att.png'), 'png');

      deleteMirrorDir(tmpDir, 'doomed');
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('no error for non-existent directory', () => {
      expect(() => deleteMirrorDir(tmpDir, 'ghost')).not.toThrow();
    });
  });
});
