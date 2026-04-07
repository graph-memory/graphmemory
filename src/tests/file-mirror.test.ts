import fs from 'fs';
import path from 'path';
import os from 'os';
import { serializeMarkdown, parseMarkdown } from '@/lib/frontmatter';
import {
  mirrorNoteCreate, mirrorTaskCreate, mirrorSkillCreate,
  mirrorNoteRelation, mirrorTaskRelation, mirrorSkillRelation,
  deleteMirrorDir,
  sanitizeEntityId, sanitizeFilename, writeAttachment, deleteAttachment, getAttachmentPath,
} from '@/lib/file-mirror';
import { scanAttachments } from '@/lib/attachment-types';
import type { RelationLike } from '@/lib/file-mirror';

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
        order: 0,
        dueDate: 1710100000000,
        estimate: 4,
        completedAt: null,
        assignee: null,
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

  // -------------------------------------------------------------------------
  // Dedicated relation event mirror functions.
  //
  // These were deleted in commit c8997ee along with their call sites during
  // the SQLite Store migration; the functions themselves stayed in
  // file-mirror.ts but became unreachable. Restored as a guardrail so they
  // never silently rot again.
  // -------------------------------------------------------------------------

  function stubNoteAttrs() {
    return {
      title: 'My Note', content: 'body', tags: ['t'],
      createdAt: 1710000000000, updatedAt: 1710000060000, version: 2,
    };
  }
  function stubTaskAttrs() {
    return {
      title: 'My Task', description: 'desc', status: 'todo' as const, priority: 'medium' as const,
      tags: ['t'], order: 0, assignee: null,
      dueDate: null, estimate: null, completedAt: null,
      createdAt: 1710000000000, updatedAt: 1710000060000, version: 2,
    };
  }
  function stubSkillAttrs() {
    return {
      title: 'My Skill', description: 'desc',
      steps: ['step1'], triggers: [], inputHints: [], filePatterns: [],
      tags: ['t'], source: 'user' as const, confidence: 1.0,
      usageCount: 0, lastUsedAt: null,
      createdAt: 1710000000000, updatedAt: 1710000060000, version: 2,
    };
  }

  describe('mirrorNoteRelation', () => {
    it('appends a relation event to events.jsonl and rewrites note.md', () => {
      const notesDir = path.join(tmpDir, '.notes');
      // Pre-create entity dir + an existing event so we test append, not first-write.
      mirrorNoteCreate(notesDir, 'my-note', stubNoteAttrs(), []);

      const relations: RelationLike[] = [
        { fromId: 'my-note', toId: 'fix-bug', kind: 'relates_to', targetGraph: 'tasks' },
      ];
      mirrorNoteRelation(notesDir, 'my-note', 'add', 'relates_to', 'fix-bug', stubNoteAttrs(), relations, 'tasks', 'Bob <bob@test.com>');

      const eventsRaw = fs.readFileSync(path.join(notesDir, 'my-note', 'events.jsonl'), 'utf-8');
      const lines = eventsRaw.trim().split('\n').filter(Boolean);
      const last = JSON.parse(lines[lines.length - 1]);
      expect(last.op).toBe('relation');
      expect(last.action).toBe('add');
      expect(last.kind).toBe('relates_to');
      expect(last.to).toBe('fix-bug');
      expect(last.graph).toBe('tasks');
      expect(last.by).toBe('Bob <bob@test.com>');

      const md = fs.readFileSync(path.join(notesDir, 'my-note', 'note.md'), 'utf-8');
      const parsed = parseMarkdown(md);
      const rels = parsed.frontmatter.relations as Array<{ to: string; kind: string; graph?: string }>;
      expect(rels).toEqual([{ to: 'fix-bug', kind: 'relates_to', graph: 'tasks' }]);
    });

    it('removes a relation event and rewrites snapshot without it', () => {
      const notesDir = path.join(tmpDir, '.notes');
      const initial: RelationLike[] = [
        { fromId: 'my-note', toId: 'other', kind: 'relates_to' },
      ];
      mirrorNoteCreate(notesDir, 'my-note', stubNoteAttrs(), initial);

      mirrorNoteRelation(notesDir, 'my-note', 'remove', 'relates_to', 'other', stubNoteAttrs(), [], undefined);

      const md = fs.readFileSync(path.join(notesDir, 'my-note', 'note.md'), 'utf-8');
      expect(md).not.toContain('relations:');

      const eventsRaw = fs.readFileSync(path.join(notesDir, 'my-note', 'events.jsonl'), 'utf-8');
      const lines = eventsRaw.trim().split('\n').filter(Boolean);
      const last = JSON.parse(lines[lines.length - 1]);
      expect(last.op).toBe('relation');
      expect(last.action).toBe('remove');
    });
  });

  describe('mirrorTaskRelation', () => {
    it('appends an add event and rewrites task.md frontmatter', () => {
      const tasksDir = path.join(tmpDir, '.tasks');
      mirrorTaskCreate(tasksDir, 'fix-bug', stubTaskAttrs(), []);

      const relations: RelationLike[] = [
        { fromId: 'fix-bug', toId: 'my-note', kind: 'relates_to', targetGraph: 'knowledge' },
      ];
      mirrorTaskRelation(tasksDir, 'fix-bug', 'add', 'relates_to', 'my-note', stubTaskAttrs(), relations, 'knowledge');

      const md = fs.readFileSync(path.join(tasksDir, 'fix-bug', 'task.md'), 'utf-8');
      const parsed = parseMarkdown(md);
      const rels = parsed.frontmatter.relations as Array<{ to: string; kind: string; graph?: string }>;
      expect(rels).toEqual([{ to: 'my-note', kind: 'relates_to', graph: 'knowledge' }]);
    });
  });

  describe('mirrorSkillRelation', () => {
    it('appends an add event and rewrites skill.md frontmatter', () => {
      const skillsDir = path.join(tmpDir, '.skills');
      mirrorSkillCreate(skillsDir, 'add-endpoint', stubSkillAttrs(), []);

      const relations: RelationLike[] = [
        { fromId: 'add-endpoint', toId: 'auth-debug', kind: 'related_to' },
      ];
      mirrorSkillRelation(skillsDir, 'add-endpoint', 'add', 'related_to', 'auth-debug', stubSkillAttrs(), relations, undefined);

      const md = fs.readFileSync(path.join(skillsDir, 'add-endpoint', 'skill.md'), 'utf-8');
      const parsed = parseMarkdown(md);
      const rels = parsed.frontmatter.relations as Array<{ to: string; kind: string; graph?: string }>;
      expect(rels).toEqual([{ to: 'auth-debug', kind: 'related_to' }]);
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

  describe('sanitizeEntityId', () => {
    it('strips path traversal via basename', () => {
      expect(sanitizeEntityId('../../etc/passwd')).toBe('passwd');
    });

    it('extracts basename from forward slashes', () => {
      expect(sanitizeEntityId('path/to/entity')).toBe('entity');
    });

    it('extracts basename from backslashes', () => {
      expect(sanitizeEntityId('path\\to\\entity')).toBe('entity');
    });

    it('strips null bytes', () => {
      expect(sanitizeEntityId('entity\0id')).toBe('entityid');
    });

    it('returns empty for dot traversal names', () => {
      expect(sanitizeEntityId('.')).toBe('');
      expect(sanitizeEntityId('..')).toBe('');
    });

    it('preserves normal IDs', () => {
      expect(sanitizeEntityId('my-note-123')).toBe('my-note-123');
      expect(sanitizeEntityId('42')).toBe('42');
    });

    it('trims whitespace', () => {
      expect(sanitizeEntityId('  entity-1  ')).toBe('entity-1');
    });

    it('handles combined malicious input', () => {
      expect(sanitizeEntityId('../../../\0secret/entity')).toBe('entity');
    });
  });

  describe('sanitizeFilename', () => {
    it('strips path traversal via basename', () => {
      expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    });

    it('extracts basename from forward slashes', () => {
      expect(sanitizeFilename('path/to/file.txt')).toBe('file.txt');
    });

    it('extracts basename from backslashes', () => {
      expect(sanitizeFilename('path\\to\\file.txt')).toBe('file.txt');
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
      expect(sanitizeFilename('../../../\0secret/file.txt')).toBe('file.txt');
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

    it('sanitizes entity ID on write — path traversal blocked', () => {
      writeAttachment(tmpDir, '../../etc', 'payload.txt', Buffer.from('pwned'));
      // Should NOT write to ../../etc — entityId is sanitized to "etc"
      expect(fs.existsSync(path.join(tmpDir, 'etc', 'attachments', 'payload.txt'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '..', '..', 'etc', 'attachments', 'payload.txt'))).toBe(false);
    });

    it('throws on empty entity ID after sanitization', () => {
      expect(() => writeAttachment(tmpDir, '..', 'file.txt', Buffer.from('data'))).toThrow('Entity ID is empty');
    });

    it('throws on empty filename after sanitization', () => {
      expect(() => writeAttachment(tmpDir, 'ent', '..', Buffer.from('data'))).toThrow('Attachment filename is empty');
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
