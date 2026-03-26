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

/** Directory basenames that are always excluded from watching and scanning at any nesting level. */
export const ALWAYS_IGNORED = new Set([
  'node_modules', '.git', '.hg', '.svn',
  '.next', '.nuxt', '.turbo',
  'dist', 'build',
  '.graph-memory', '.notes', '.tasks', '.skills',
]);

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

  const ignored = (filePath: string): boolean => {
    const basename = path.basename(filePath);
    // Skip dotfiles and dotdirs (hidden) at any level — except the watched root itself
    if (basename.startsWith('.') && filePath !== dir) return true;
    // Always-ignored directories by basename at any nesting level
    if (ALWAYS_IGNORED.has(basename)) return true;
    // User-defined exclude patterns (glob-based) — only prune directories, not individual files.
    // File-level filtering is handled by matches() + dispatchAdd per-graph excludes.
    if (excludePatterns && excludePatterns.length > 0) {
      const rel = path.relative(dir, filePath);
      if (micromatch.isMatch(rel + '/x', excludePatterns)) return true;
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
    // Silently ignore symlink loops — nothing useful to watch there
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ELOOP') return;
    process.stderr.write(`[watcher] Watch error: ${err}\n`);
  });

  return {
    whenReady,
    close: () => watcher.close(),
  };
}
