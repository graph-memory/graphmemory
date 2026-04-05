import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MirrorWriteTracker, scanMirrorDirs } from '@/lib/mirror-watcher';
import { PromiseQueue } from '@/lib/promise-queue';
import { createTestStoreManager, DIM, unitVec } from '@/tests/helpers';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gm-mirror-'));
}

const fakeEmbed = async () => unitVec(0, DIM);

describe('MirrorWriteTracker', () => {
  it('detects own writes', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'test.txt');
    fs.writeFileSync(file, 'hello');
    const tracker = new MirrorWriteTracker();
    tracker.recordWrite(file);
    expect(tracker.isOwnWrite(file)).toBe(true);
  });

  it('returns false for untracked files', () => {
    expect(new MirrorWriteTracker().isOwnWrite('/no/file')).toBe(false);
  });

  it('consumes entry on check', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'x.txt');
    fs.writeFileSync(file, 'data');
    const tracker = new MirrorWriteTracker();
    tracker.recordWrite(file);
    expect(tracker.isOwnWrite(file)).toBe(true);
    expect(tracker.isOwnWrite(file)).toBe(false);
  });

  it('handles non-existent file in recordWrite', () => {
    const tracker = new MirrorWriteTracker();
    tracker.recordWrite('/no/file.txt');
    expect(tracker.isOwnWrite('/no/file.txt')).toBe(false);
  });

  it('handles deleted file in isOwnWrite', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'tmp.txt');
    fs.writeFileSync(file, 'data');
    const tracker = new MirrorWriteTracker();
    tracker.recordWrite(file);
    fs.unlinkSync(file);
    expect(tracker.isOwnWrite(file)).toBe(false);
  });
});

describe('scanMirrorDirs', () => {
  it('imports notes from .notes/', async () => {
    const dir = tmpDir();
    const nd = path.join(dir, '.notes', 'n1');
    fs.mkdirSync(nd, { recursive: true });
    fs.writeFileSync(path.join(nd, 'events.jsonl'),
      '{"ts":"2026-01-01T00:00:00Z","op":"created","id":"n1","title":"Note","tags":[],"createdAt":1000}\n');
    fs.writeFileSync(path.join(nd, 'content.md'), 'Content');

    const { storeManager, cleanup } = createTestStoreManager(fakeEmbed, { projectDir: dir });
    try {
      await scanMirrorDirs({ projectDir: dir, storeManager, skillsEnabled: false, mutationQueue: new PromiseQueue(), tracker: new MirrorWriteTracker() });
      const note = storeManager.getNoteBySlug('n1');
      expect(note).not.toBeNull();
      expect(note!.title).toBe('Note');
    } finally {
      cleanup();
    }
  });

  it('imports tasks from .tasks/', async () => {
    const dir = tmpDir();
    const td = path.join(dir, '.tasks', 't1');
    fs.mkdirSync(td, { recursive: true });
    fs.writeFileSync(path.join(td, 'events.jsonl'),
      '{"ts":"2026-01-01T00:00:00Z","op":"created","id":"t1","title":"Task","status":"todo","priority":"high","tags":[],"dueDate":null,"estimate":null,"completedAt":null,"createdAt":2000}\n');

    const { storeManager, cleanup } = createTestStoreManager(fakeEmbed, { projectDir: dir });
    try {
      await scanMirrorDirs({ projectDir: dir, storeManager, skillsEnabled: false, mutationQueue: new PromiseQueue(), tracker: new MirrorWriteTracker() });
      const task = storeManager.getTaskBySlug('t1');
      expect(task).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('handles empty project dir', async () => {
    const dir = tmpDir();
    const { storeManager, cleanup } = createTestStoreManager(fakeEmbed, { projectDir: dir });
    try {
      await scanMirrorDirs({ projectDir: dir, storeManager, skillsEnabled: false, mutationQueue: new PromiseQueue(), tracker: new MirrorWriteTracker() });
    } finally {
      cleanup();
    }
  });

  it('skips dirs without events.jsonl', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.notes', 'empty'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.notes', 'empty', 'content.md'), 'no events');

    const { storeManager, cleanup } = createTestStoreManager(fakeEmbed, { projectDir: dir });
    try {
      await scanMirrorDirs({ projectDir: dir, storeManager, skillsEnabled: false, mutationQueue: new PromiseQueue(), tracker: new MirrorWriteTracker() });
      expect(storeManager.listNotes().total).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('skips non-directory entries in .notes/', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.notes'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.notes', '.gitignore'), 'note.md\n');

    const { storeManager, cleanup } = createTestStoreManager(fakeEmbed, { projectDir: dir });
    try {
      await scanMirrorDirs({ projectDir: dir, storeManager, skillsEnabled: false, mutationQueue: new PromiseQueue(), tracker: new MirrorWriteTracker() });
    } finally {
      cleanup();
    }
  });
});
