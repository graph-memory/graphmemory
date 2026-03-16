import chokidar from 'chokidar';
import micromatch from 'micromatch';
import path from 'path';

export interface WatcherHandle {
  /** Resolves when chokidar has finished the initial directory scan. */
  whenReady: Promise<void>;
  close: () => Promise<void>;
}

export interface WatcherHandlers {
  onAdd(filePath: string): void;
  onChange(filePath: string): void;
  onUnlink(filePath: string): void;
}

/** Directories that are always excluded from watching (heavy, never useful). */
const ALWAYS_IGNORED = ['.git', 'node_modules', '.next', '.nuxt', '.turbo', 'dist', 'build', '.graph-memory', '.notes', '.tasks'];

// chokidar 5: watch the directory directly — glob patterns don't fire 'add' for existing files
export function startWatcher(
  dir: string,
  handlers: WatcherHandlers,
  pattern = '**/*.md',
  excludePatterns?: string[],
): WatcherHandle {
  const matches = (filePath: string): boolean => {
    const rel = path.relative(dir, filePath);
    if (excludePatterns && excludePatterns.length > 0 && micromatch.isMatch(rel, excludePatterns)) return false;
    return micromatch.isMatch(rel, pattern);
  };

  // chokidar 5 `ignored` accepts a function — use micromatch for glob exclude patterns
  // plus always skip heavy directories (.git, node_modules, etc.)
  const alwaysIgnoredSet = new Set(ALWAYS_IGNORED.map(d => path.join(dir, d)));

  const ignored = (filePath: string): boolean => {
    // Always ignore heavy directories by exact basename match
    if (alwaysIgnoredSet.has(filePath)) return true;
    // User-defined exclude patterns (glob-based)
    if (excludePatterns && excludePatterns.length > 0) {
      const rel = path.relative(dir, filePath);
      if (micromatch.isMatch(rel, excludePatterns)) return true;
    }
    return false;
  };

  let resolveReady!: () => void;
  const whenReady = new Promise<void>(resolve => {
    resolveReady = resolve;
  });

  const watcher = chokidar.watch(dir, {
    ignoreInitial: false,
    persistent: true,
    ignored,
  });

  watcher.on('add', (filePath: string) => {
    if (matches(filePath)) handlers.onAdd(filePath);
  });

  watcher.on('change', (filePath: string) => {
    if (matches(filePath)) handlers.onChange(filePath);
  });

  watcher.on('unlink', (filePath: string) => {
    if (matches(filePath)) handlers.onUnlink(filePath);
  });

  watcher.on('ready', () => {
    process.stderr.write(`[watcher] Ready. Watching ${dir}\n`);
    resolveReady();
  });

  watcher.on('error', (err: unknown) => {
    process.stderr.write(`[watcher] Watch error: ${err}\n`);
  });

  return {
    whenReady,
    close: () => watcher.close(),
  };
}
