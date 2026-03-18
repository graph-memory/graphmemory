import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseNoteFile, parseTaskFile, diffRelations } from '../lib/file-import';
import { serializeMarkdown } from '../lib/frontmatter';
import type { RelationFrontmatter } from '../lib/file-mirror';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'file-import-test-'));
}

function writeFile(dir: string, name: string, content: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, content);
  return fp;
}

// ---------------------------------------------------------------------------
// parseNoteFile
// ---------------------------------------------------------------------------

describe('parseNoteFile', () => {
  it('parses note with full frontmatter', () => {
    const dir = tmpDir();
    const fp = writeFile(dir, 'my-note.md', serializeMarkdown({
      id: 'my-note',
      tags: ['auth', 'security'],
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
      relations: [
        { to: 'other-note', kind: 'depends_on' },
        { to: 'my-task', kind: 'relates_to', graph: 'tasks' },
      ],
    }, '# My Note Title\n\nSome content here.'));

    const parsed = parseNoteFile(fp);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('my-note');
    expect(parsed!.title).toBe('My Note Title');
    expect(parsed!.content).toBe('Some content here.');
    expect(parsed!.tags).toEqual(['auth', 'security']);
    expect(parsed!.createdAt).toBe(new Date('2026-01-15T10:00:00.000Z').getTime());
    expect(parsed!.updatedAt).toBe(new Date('2026-01-15T12:00:00.000Z').getTime());
    expect(parsed!.relations).toHaveLength(2);
    expect(parsed!.relations[0]).toEqual({ to: 'other-note', kind: 'depends_on' });
    expect(parsed!.relations[1]).toEqual({ to: 'my-task', kind: 'relates_to', graph: 'tasks' });
  });

  it('uses filename as id (ignores frontmatter id)', () => {
    const dir = tmpDir();
    const fp = writeFile(dir, 'filename-id.md', serializeMarkdown({
      id: 'different-id',
      tags: [],
    }, '# Title\n\nContent'));

    const parsed = parseNoteFile(fp);
    expect(parsed!.id).toBe('filename-id');
  });

  it('handles minimal file (no frontmatter)', () => {
    const dir = tmpDir();
    const fp = writeFile(dir, 'bare-note.md', '# Simple Note\n\nJust content.');

    const parsed = parseNoteFile(fp);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('bare-note');
    expect(parsed!.title).toBe('Simple Note');
    expect(parsed!.content).toBe('Just content.');
    expect(parsed!.tags).toEqual([]);
    expect(parsed!.relations).toEqual([]);
    expect(parsed!.createdAt).toBeNull();
  });

  it('handles file with no heading (uses id as title)', () => {
    const dir = tmpDir();
    const fp = writeFile(dir, 'no-heading.md', serializeMarkdown({ tags: ['x'] }, 'Just some text.'));

    const parsed = parseNoteFile(fp);
    expect(parsed!.title).toBe('no-heading');
    expect(parsed!.content).toBe('Just some text.');
  });

  it('returns null for non-existent file', () => {
    const result = parseNoteFile('/nonexistent/file.md');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseTaskFile
// ---------------------------------------------------------------------------

describe('parseTaskFile', () => {
  it('parses task with all fields', () => {
    const dir = tmpDir();
    const fp = writeFile(dir, 'fix-bug.md', serializeMarkdown({
      id: 'fix-bug',
      status: 'in_progress',
      priority: 'high',
      tags: ['bug', 'auth'],
      dueDate: '2026-03-20T00:00:00.000Z',
      estimate: 4,
      completedAt: null,
      assignee: null,
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
      relations: [{ to: 'parent-task', kind: 'subtask_of' }],
    }, '# Fix Auth Bug\n\nDescription of the bug.'));

    const parsed = parseTaskFile(fp);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('fix-bug');
    expect(parsed!.title).toBe('Fix Auth Bug');
    expect(parsed!.description).toBe('Description of the bug.');
    expect(parsed!.status).toBe('in_progress');
    expect(parsed!.priority).toBe('high');
    expect(parsed!.tags).toEqual(['bug', 'auth']);
    expect(parsed!.dueDate).toBe(new Date('2026-03-20T00:00:00.000Z').getTime());
    expect(parsed!.estimate).toBe(4);
    expect(parsed!.completedAt).toBeNull();
    expect(parsed!.relations).toEqual([{ to: 'parent-task', kind: 'subtask_of' }]);
  });

  it('defaults status to backlog and priority to medium', () => {
    const dir = tmpDir();
    const fp = writeFile(dir, 'minimal-task.md', serializeMarkdown({
      tags: [],
    }, '# Minimal Task\n\nNo status or priority.'));

    const parsed = parseTaskFile(fp);
    expect(parsed!.status).toBe('backlog');
    expect(parsed!.priority).toBe('medium');
  });

  it('rejects invalid status/priority with defaults', () => {
    const dir = tmpDir();
    const fp = writeFile(dir, 'bad-fields.md', serializeMarkdown({
      status: 'invalid_status',
      priority: 'super_high',
    }, '# Bad Fields\n\nContent'));

    const parsed = parseTaskFile(fp);
    expect(parsed!.status).toBe('backlog');
    expect(parsed!.priority).toBe('medium');
  });

  it('returns null for non-existent file', () => {
    expect(parseTaskFile('/nonexistent/task.md')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// diffRelations
// ---------------------------------------------------------------------------

describe('diffRelations', () => {
  it('detects additions', () => {
    const current: RelationFrontmatter[] = [];
    const desired: RelationFrontmatter[] = [
      { to: 'note-a', kind: 'relates_to' },
    ];
    const diff = diffRelations(current, desired);
    expect(diff.toAdd).toEqual([{ to: 'note-a', kind: 'relates_to' }]);
    expect(diff.toRemove).toEqual([]);
  });

  it('detects removals', () => {
    const current: RelationFrontmatter[] = [
      { to: 'note-a', kind: 'relates_to' },
    ];
    const desired: RelationFrontmatter[] = [];
    const diff = diffRelations(current, desired);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([{ to: 'note-a', kind: 'relates_to' }]);
  });

  it('detects no change', () => {
    const rels: RelationFrontmatter[] = [
      { to: 'note-a', kind: 'relates_to' },
      { to: 'task-b', kind: 'depends_on', graph: 'tasks' },
    ];
    const diff = diffRelations(rels, rels);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual([]);
  });

  it('handles mixed add/remove with cross-graph', () => {
    const current: RelationFrontmatter[] = [
      { to: 'note-a', kind: 'relates_to' },
      { to: 'old-task', kind: 'blocks', graph: 'tasks' },
    ];
    const desired: RelationFrontmatter[] = [
      { to: 'note-a', kind: 'relates_to' },
      { to: 'new-doc', kind: 'documents', graph: 'docs' },
    ];
    const diff = diffRelations(current, desired);
    expect(diff.toAdd).toEqual([{ to: 'new-doc', kind: 'documents', graph: 'docs' }]);
    expect(diff.toRemove).toEqual([{ to: 'old-task', kind: 'blocks', graph: 'tasks' }]);
  });
});
