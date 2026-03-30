import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseSkillFile, parseNoteDir, parseTaskDir, parseSkillDir } from '@/lib/file-import';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gm-import-'));
}

// ---------------------------------------------------------------------------
// parseSkillFile
// ---------------------------------------------------------------------------

describe('parseSkillFile', () => {
  it('parses a skill markdown file', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'deploy.md');
    fs.writeFileSync(file, `---
tags: [ops, deploy]
triggers: [deploy, release]
source: user
confidence: 0.9
---

# Deploy to Production

Setup the deployment pipeline

## Steps

1. Build the Docker image
2. Push to registry
3. Deploy to Kubernetes
`);

    const result = parseSkillFile(file);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Deploy to Production');
    expect(result!.description).toBe('Setup the deployment pipeline');
    expect(result!.steps).toEqual(['Build the Docker image', 'Push to registry', 'Deploy to Kubernetes']);
    expect(result!.tags).toEqual(['ops', 'deploy']);
    expect(result!.triggers).toEqual(['deploy', 'release']);
    expect(result!.source).toBe('user');
    expect(result!.confidence).toBe(0.9);
  });

  it('returns null for non-existent file', () => {
    expect(parseSkillFile('/nonexistent/skill.md')).toBeNull();
  });

  it('handles skill without steps section', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'simple.md');
    fs.writeFileSync(file, `---
tags: [test]
---

# Simple Skill

Just a description, no steps.
`);

    const result = parseSkillFile(file);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Simple Skill');
    expect(result!.steps).toEqual([]);
    expect(result!.description).toBe('Just a description, no steps.');
  });

  it('clamps confidence to 0-1', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'high.md');
    fs.writeFileSync(file, `---\nconfidence: 5\n---\n# High\nDesc\n`);
    const result = parseSkillFile(file);
    expect(result!.confidence).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// parseNoteDir (event-sourced)
// ---------------------------------------------------------------------------

describe('parseNoteDir', () => {
  it('parses note from events.jsonl + content.md', () => {
    const dir = tmpDir();
    const noteDir = path.join(dir, 'my-note');
    fs.mkdirSync(noteDir, { recursive: true });

    fs.writeFileSync(path.join(noteDir, 'events.jsonl'),
      '{"ts":"2026-01-01T00:00:00Z","op":"created","id":"my-note","title":"My Note","tags":["test"],"createdAt":1000}\n');
    fs.writeFileSync(path.join(noteDir, 'content.md'), 'Note content here');

    const result = parseNoteDir(noteDir);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('my-note');
    expect(result!.title).toBe('My Note');
    expect(result!.content).toBe('Note content here');
    expect(result!.tags).toEqual(['test']);
  });

  it('returns null for dir without events.jsonl', () => {
    const dir = tmpDir();
    expect(parseNoteDir(dir)).toBeNull();
  });

  it('returns null for events without created event', () => {
    const dir = tmpDir();
    const noteDir = path.join(dir, 'bad');
    fs.mkdirSync(noteDir, { recursive: true });
    fs.writeFileSync(path.join(noteDir, 'events.jsonl'),
      '{"ts":"2026-01-01T00:00:00Z","op":"update","title":"x"}\n');
    expect(parseNoteDir(noteDir)).toBeNull();
  });

  it('handles missing content.md', () => {
    const dir = tmpDir();
    const noteDir = path.join(dir, 'no-content');
    fs.mkdirSync(noteDir, { recursive: true });
    fs.writeFileSync(path.join(noteDir, 'events.jsonl'),
      '{"ts":"2026-01-01T00:00:00Z","op":"created","id":"nc","title":"No Content","tags":[],"createdAt":1000}\n');

    const result = parseNoteDir(noteDir);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseTaskDir (event-sourced)
// ---------------------------------------------------------------------------

describe('parseTaskDir', () => {
  it('parses task from events.jsonl + description.md', () => {
    const dir = tmpDir();
    const taskDir = path.join(dir, 'my-task');
    fs.mkdirSync(taskDir, { recursive: true });

    fs.writeFileSync(path.join(taskDir, 'events.jsonl'),
      '{"ts":"2026-01-01T00:00:00Z","op":"created","id":"my-task","title":"Fix Bug","status":"todo","priority":"high","tags":["bug"],"dueDate":null,"estimate":null,"completedAt":null,"createdAt":2000}\n');
    fs.writeFileSync(path.join(taskDir, 'description.md'), 'Fix the login bug');

    const result = parseTaskDir(taskDir);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('my-task');
    expect(result!.title).toBe('Fix Bug');
    expect(result!.status).toBe('todo');
    expect(result!.description).toBe('Fix the login bug');
  });

  it('returns null without events.jsonl', () => {
    expect(parseTaskDir(tmpDir())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseSkillDir (event-sourced)
// ---------------------------------------------------------------------------

describe('parseSkillDir', () => {
  it('parses skill from events.jsonl + description.md', () => {
    const dir = tmpDir();
    const skillDir = path.join(dir, 'deploy');
    fs.mkdirSync(skillDir, { recursive: true });

    fs.writeFileSync(path.join(skillDir, 'events.jsonl'),
      '{"ts":"2026-01-01T00:00:00Z","op":"created","id":"deploy","title":"Deploy","tags":["ops"],"steps":["build","push"],"triggers":["deploy"],"inputHints":[],"filePatterns":[],"source":"user","confidence":1,"usageCount":0,"lastUsedAt":null,"createdAt":3000}\n');
    fs.writeFileSync(path.join(skillDir, 'description.md'), 'How to deploy');

    const result = parseSkillDir(skillDir);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('deploy');
    expect(result!.title).toBe('Deploy');
    expect(result!.steps).toEqual(['build', 'push']);
  });

  it('returns null without events.jsonl', () => {
    expect(parseSkillDir(tmpDir())).toBeNull();
  });
});
