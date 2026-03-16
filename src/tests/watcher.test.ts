import fs from 'fs';
import path from 'path';
import os from 'os';
import { startWatcher } from '@/lib/watcher';

type Event = { type: 'add' | 'change' | 'unlink'; rel: string };

describe('startWatcher', () => {
  let watchDir: string;
  let events: Event[];
  let handle: Awaited<ReturnType<typeof startWatcher>>;

  function write(name: string): void {
    fs.writeFileSync(path.join(watchDir, name), `# ${name}\n`, 'utf-8');
  }

  describe('default pattern', () => {
    beforeAll(async () => {
      watchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
      events = [];

      // Pre-create files
      write('doc.md');
      write('readme.txt');
      fs.mkdirSync(path.join(watchDir, 'sub'));
      write('sub/nested.md');

      handle = startWatcher(watchDir, {
        onAdd:    f => events.push({ type: 'add',    rel: path.relative(watchDir, f) }),
        onChange: f => events.push({ type: 'change', rel: path.relative(watchDir, f) }),
        onUnlink: f => events.push({ type: 'unlink', rel: path.relative(watchDir, f) }),
      });

      await handle.whenReady;
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterAll(async () => {
      await handle.close();
      fs.rmSync(watchDir, { recursive: true });
    });

    it('detects doc.md on startup', () => {
      const adds = events.filter(e => e.type === 'add').map(e => e.rel);
      expect(adds).toContain('doc.md');
    });

    it('detects sub/nested.md on startup', () => {
      const adds = events.filter(e => e.type === 'add').map(e => e.rel);
      expect(adds.some(r => r.endsWith('nested.md'))).toBe(true);
    });

    it('does NOT detect readme.txt (filtered)', () => {
      const adds = events.filter(e => e.type === 'add').map(e => e.rel);
      expect(adds.some(r => r.endsWith('.txt'))).toBe(false);
    });

    it('fires change event for doc.md', async () => {
      events.length = 0;
      fs.appendFileSync(path.join(watchDir, 'doc.md'), '\n## Section\n');
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(events.some(e => e.type === 'change' && e.rel === 'doc.md')).toBe(true);
    });

    it('fires unlink event for doc.md', async () => {
      events.length = 0;
      fs.unlinkSync(path.join(watchDir, 'doc.md'));
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(events.some(e => e.type === 'unlink' && e.rel === 'doc.md')).toBe(true);
    });
  });

  describe('pattern override (sub/**/*.md)', () => {
    let handle2: Awaited<ReturnType<typeof startWatcher>>;
    let events2: Event[];

    beforeAll(async () => {
      watchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test2-'));
      events2 = [];

      write('doc.md');
      fs.mkdirSync(path.join(watchDir, 'sub'));
      write('sub/nested.md');

      handle2 = startWatcher(watchDir, {
        onAdd:    f => events2.push({ type: 'add',    rel: path.relative(watchDir, f) }),
        onChange: f => events2.push({ type: 'change', rel: path.relative(watchDir, f) }),
        onUnlink: f => events2.push({ type: 'unlink', rel: path.relative(watchDir, f) }),
      }, 'sub/**/*.md');

      await handle2.whenReady;
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    afterAll(async () => {
      await handle2.close();
      fs.rmSync(watchDir, { recursive: true });
    });

    it('includes sub/nested.md', () => {
      const adds = events2.filter(e => e.type === 'add').map(e => e.rel);
      expect(adds.some(r => r.endsWith('nested.md'))).toBe(true);
    });

    it('excludes doc.md', () => {
      const adds = events2.filter(e => e.type === 'add').map(e => e.rel);
      expect(adds).not.toContain('doc.md');
    });
  });
});
