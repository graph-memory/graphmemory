import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  appendEvent, readEvents,
  replayNoteEvents, replayTaskEvents, replaySkillEvents,
  ensureGitignore, ensureGitattributes,
  type AnyEvent,
} from '@/lib/events-log';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gm-events-'));
}

// ---------------------------------------------------------------------------
// appendEvent + readEvents
// ---------------------------------------------------------------------------

describe('appendEvent / readEvents', () => {
  it('appends and reads events', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'events.jsonl');

    appendEvent(file, { op: 'created', id: 'n1', title: 'Test', tags: [], createdAt: 1000 } as any);
    appendEvent(file, { op: 'update', title: 'Updated' } as any);

    const events = readEvents(file);
    expect(events).toHaveLength(2);
    expect(events[0].op).toBe('created');
    expect(events[1].op).toBe('update');
    expect(events[0].ts).toBeDefined();
  });

  it('returns empty for non-existent file', () => {
    expect(readEvents('/nonexistent/events.jsonl')).toEqual([]);
  });

  it('skips invalid JSON lines', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'events.jsonl');
    fs.writeFileSync(file, '{"op":"created","ts":"2026-01-01"}\nINVALID LINE\n{"op":"update","ts":"2026-01-02"}\n');

    const events = readEvents(file);
    expect(events).toHaveLength(2);
  });

  it('handles empty file', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'events.jsonl');
    fs.writeFileSync(file, '');
    expect(readEvents(file)).toEqual([]);
  });

  it('handles file with only whitespace lines', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'events.jsonl');
    fs.writeFileSync(file, '\n\n  \n');
    expect(readEvents(file)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// replayNoteEvents
// ---------------------------------------------------------------------------

describe('replayNoteEvents', () => {
  it('reconstructs note from created event', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'created', id: 'n1', title: 'Hello', tags: ['a'], createdAt: 1000, createdBy: 'alice' },
    ];
    const result = replayNoteEvents(events, 'content here');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('n1');
    expect(result!.title).toBe('Hello');
    expect(result!.content).toBe('content here');
    expect(result!.tags).toEqual(['a']);
    expect(result!.createdBy).toBe('alice');
    expect(result!.version).toBe(1);
  });

  it('returns null without created event', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'update', title: 'x' },
    ];
    expect(replayNoteEvents(events, '')).toBeNull();
  });

  it('applies update events', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'created', id: 'n1', title: 'Old', tags: [], createdAt: 1000 },
      { ts: '2026-01-01T01:00:00Z', op: 'update', title: 'New', tags: ['b'], by: 'bob' },
    ];
    const result = replayNoteEvents(events, 'c');
    expect(result!.title).toBe('New');
    expect(result!.tags).toEqual(['b']);
    expect(result!.updatedBy).toBe('bob');
    expect(result!.version).toBe(2);
  });

  it('applies relation add/remove', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'created', id: 'n1', title: 'T', tags: [], createdAt: 1000 },
      { ts: '2026-01-01T01:00:00Z', op: 'relation', action: 'add', kind: 'depends_on', to: 'n2' },
      { ts: '2026-01-01T02:00:00Z', op: 'relation', action: 'add', kind: 'refs', to: 't1', graph: 'tasks' },
      { ts: '2026-01-01T03:00:00Z', op: 'relation', action: 'remove', kind: 'depends_on', to: 'n2' },
    ];
    const result = replayNoteEvents(events, '');
    expect(result!.relations).toHaveLength(1);
    expect(result!.relations[0].to).toBe('t1');
    expect(result!.relations[0].graph).toBe('tasks');
  });

  it('applies attachment add/remove', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'created', id: 'n1', title: 'T', tags: [], createdAt: 1000 },
      { ts: '2026-01-01T01:00:00Z', op: 'attachment', action: 'add', file: 'a.png' },
      { ts: '2026-01-01T02:00:00Z', op: 'attachment', action: 'add', file: 'b.pdf' },
      { ts: '2026-01-01T03:00:00Z', op: 'attachment', action: 'remove', file: 'a.png' },
    ];
    const result = replayNoteEvents(events, '');
    expect(result!.attachments).toHaveLength(1);
    expect(result!.attachments[0].filename).toBe('b.pdf');
  });

  it('deduplicates relation adds', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'created', id: 'n1', title: 'T', tags: [], createdAt: 1000 },
      { ts: '2026-01-01T01:00:00Z', op: 'relation', action: 'add', kind: 'refs', to: 'n2' },
      { ts: '2026-01-01T02:00:00Z', op: 'relation', action: 'add', kind: 'refs', to: 'n2' },
    ];
    const result = replayNoteEvents(events, '');
    expect(result!.relations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// replayTaskEvents
// ---------------------------------------------------------------------------

describe('replayTaskEvents', () => {
  it('reconstructs task from created event', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'created', id: 't1', title: 'Fix bug', status: 'todo' as any, priority: 'high' as any, tags: [], dueDate: null, estimate: null, completedAt: null, createdAt: 2000 },
    ];
    const result = replayTaskEvents(events, 'desc');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('t1');
    expect(result!.title).toBe('Fix bug');
    expect(result!.status).toBe('todo');
    expect(result!.priority).toBe('high');
    expect(result!.description).toBe('desc');
  });

  it('applies task-specific update fields', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'created', id: 't1', title: 'T', status: 'todo' as any, priority: 'low' as any, tags: [], dueDate: null, estimate: null, completedAt: null, createdAt: 2000 },
      { ts: '2026-01-01T01:00:00Z', op: 'update', status: 'done', priority: 'critical', dueDate: 3000, estimate: 8, completedAt: 4000 },
    ];
    const result = replayTaskEvents(events, '');
    expect(result!.status).toBe('done');
    expect(result!.priority).toBe('critical');
    expect(result!.dueDate).toBe(3000);
    expect(result!.estimate).toBe(8);
    expect(result!.completedAt).toBe(4000);
  });

  it('returns null without created event', () => {
    expect(replayTaskEvents([{ ts: '2026-01-01T00:00:00Z', op: 'update', title: 'x' }], '')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// replaySkillEvents
// ---------------------------------------------------------------------------

describe('replaySkillEvents', () => {
  it('reconstructs skill from created event', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'created', id: 's1', title: 'Deploy', tags: ['ops'], steps: ['step1'], triggers: ['deploy'], inputHints: [], filePatterns: ['*.yml'], source: 'user' as any, confidence: 0.9, usageCount: 0, lastUsedAt: null, createdAt: 3000 },
    ];
    const result = replaySkillEvents(events, 'how to deploy');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Deploy');
    expect(result!.steps).toEqual(['step1']);
    expect(result!.triggers).toEqual(['deploy']);
    expect(result!.source).toBe('user');
    expect(result!.confidence).toBe(0.9);
  });

  it('applies skill-specific update fields', () => {
    const events: AnyEvent[] = [
      { ts: '2026-01-01T00:00:00Z', op: 'created', id: 's1', title: 'S', tags: [], steps: [], triggers: [], inputHints: [], filePatterns: [], source: 'user' as any, confidence: 1, usageCount: 0, lastUsedAt: null, createdAt: 3000 },
      { ts: '2026-01-01T01:00:00Z', op: 'update', steps: ['a', 'b'], confidence: 0.5, usageCount: 3, lastUsedAt: 5000, source: 'learned' },
    ];
    const result = replaySkillEvents(events, '');
    expect(result!.steps).toEqual(['a', 'b']);
    expect(result!.confidence).toBe(0.5);
    expect(result!.usageCount).toBe(3);
    expect(result!.lastUsedAt).toBe(5000);
    expect(result!.source).toBe('learned');
  });

  it('returns null without created event', () => {
    expect(replaySkillEvents([{ ts: '2026-01-01T00:00:00Z', op: 'update', title: 'x' }], '')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ensureGitignore / ensureGitattributes
// ---------------------------------------------------------------------------

describe('ensureGitignore', () => {
  it('creates .gitignore with pattern', () => {
    const dir = tmpDir();
    ensureGitignore(dir, '*.md');
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain('*.md');
  });

  it('does not duplicate pattern', () => {
    const dir = tmpDir();
    ensureGitignore(dir, '*.md');
    ensureGitignore(dir, '*.md');
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    expect(content.split('*.md').length - 1).toBe(1);
  });

  it('appends to existing .gitignore', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
    ensureGitignore(dir, '*.md');
    const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('*.md');
  });
});

describe('ensureGitattributes', () => {
  it('creates .gitattributes with merge=union', () => {
    const dir = tmpDir();
    ensureGitattributes(dir);
    const content = fs.readFileSync(path.join(dir, '.gitattributes'), 'utf-8');
    expect(content).toContain('*/events.jsonl merge=union');
  });

  it('does not duplicate', () => {
    const dir = tmpDir();
    ensureGitattributes(dir);
    ensureGitattributes(dir);
    const content = fs.readFileSync(path.join(dir, '.gitattributes'), 'utf-8');
    expect(content.split('merge=union').length - 1).toBe(1);
  });
});
