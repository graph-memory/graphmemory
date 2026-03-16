// Mock for chokidar — mimics the real watcher API for unit tests
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

class MockWatcher extends EventEmitter {
  private dir: string;
  private closed = false;

  constructor(dir: string, _opts?: Record<string, unknown>) {
    super();
    this.dir = typeof dir === 'string' ? dir : '';
    // Schedule initial scan + ready event
    setImmediate(() => this.scan(this.dir));
  }

  private scan(dir: string): void {
    if (this.closed) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.scan(full);
        } else {
          this.knownFiles.add(full);
          this.emit('add', full);
        }
      }
    } catch { /* ignore */ }
    // Emit ready after scan of root dir
    if (dir === this.dir) {
      setImmediate(() => this.emit('ready'));
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
  }

  private fsWatcher: fs.FSWatcher | null = null;

  private knownFiles = new Set<string>();

  trackFile(filePath: string): void {
    this.knownFiles.add(filePath);
  }

  // Start watching for real changes after ready
  startFsWatch(): void {
    try {
      this.fsWatcher = fs.watch(this.dir, { recursive: true }, (_eventType, filename) => {
        if (this.closed || !filename) return;
        const full = path.join(this.dir, filename);
        // On macOS, fs.watch may report 'rename' for modifications.
        // Use file existence + knownFiles to determine the actual event.
        if (fs.existsSync(full)) {
          if (this.knownFiles.has(full)) {
            this.emit('change', full);
          } else {
            this.knownFiles.add(full);
            this.emit('add', full);
          }
        } else {
          this.knownFiles.delete(full);
          this.emit('unlink', full);
        }
      });
    } catch { /* ignore */ }
  }
}

export default {
  watch(dir: string, opts?: Record<string, unknown>): MockWatcher {
    const w = new MockWatcher(dir, opts);
    // Start fs.watch after ready for change/unlink detection
    w.on('ready', () => w.startFsWatch());
    return w;
  },
};
