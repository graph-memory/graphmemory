import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';
import type { KnowledgeGraphManager } from '../graphs/knowledge';
import type { TaskGraphManager } from '../graphs/task';
import type { SkillGraphManager } from '../graphs/skill';
import type { PromiseQueue } from './promise-queue';
import { parseNoteFile, parseTaskFile, parseSkillFile } from './file-import';
import type { WatcherHandle } from './watcher';

/**
 * Tracks recent mirror writes to suppress re-import (feedback loop prevention).
 * When mirrorNote/mirrorTask writes a file, the watcher will fire —
 * this tracker lets us detect our own writes and skip them.
 */
export class MirrorWriteTracker {
  private recentWrites = new Map<string, number>();

  /** Called by mirrorNote/mirrorTask after writing a file. */
  recordWrite(filePath: string): void {
    try {
      const stat = fs.statSync(filePath, { throwIfNoEntry: false } as fs.StatSyncOptions);
      if (stat) this.recentWrites.set(filePath, (stat as fs.Stats).mtimeMs);
    } catch { /* ignore */ }
  }

  /** Called by watcher before importing. Returns true if this was our own write. */
  isOwnWrite(filePath: string): boolean {
    const recorded = this.recentWrites.get(filePath);
    if (recorded == null) return false;
    try {
      const stat = fs.statSync(filePath, { throwIfNoEntry: false } as fs.StatSyncOptions);
      if (!stat) return false;
      if (Math.abs((stat as fs.Stats).mtimeMs - recorded) < 100) {
        this.recentWrites.delete(filePath);
        return true;
      }
    } catch { /* ignore */ }
    this.recentWrites.delete(filePath);
    return false;
  }
}

export interface MirrorWatcherConfig {
  projectDir: string;
  knowledgeManager: KnowledgeGraphManager;
  taskManager: TaskGraphManager;
  skillManager?: SkillGraphManager;
  mutationQueue: PromiseQueue;
  tracker: MirrorWriteTracker;
}

/**
 * Start watching .notes/ and .tasks/ for external file edits.
 * Watches for:
 * - note.md / task.md changes → importFromFile (content sync)
 * - other file add/remove → syncAttachments (attachment metadata sync)
 * - directory removal → deleteFromFile
 *
 * Returns a handle to close the watcher.
 */
export function startMirrorWatcher(config: MirrorWatcherConfig): WatcherHandle {
  const notesDir = path.join(config.projectDir, '.notes');
  const tasksDir = path.join(config.projectDir, '.tasks');
  const skillsDir = path.join(config.projectDir, '.skills');

  let resolveReady!: () => void;
  const whenReady = new Promise<void>(resolve => { resolveReady = resolve; });

  const watchPaths = [notesDir, tasksDir];
  if (config.skillManager) watchPaths.push(skillsDir);

  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    persistent: true,
    depth: 2,
  });

  /**
   * Determine if a file is the main markdown for a note or task.
   * Returns { type, id, mdPath } or null if not a main md file.
   */
  function classifyFile(filePath: string): { type: 'note' | 'task' | 'skill'; id: string; mdPath: string } | null {
    const rel = path.relative(config.projectDir, filePath);
    const parts = rel.split(path.sep);
    // Expected: .notes/{id}/note.md or .tasks/{id}/task.md or .skills/{id}/skill.md
    if (parts.length !== 3) return null;

    if (parts[0] === '.notes' && parts[2] === 'note.md') {
      return { type: 'note', id: parts[1], mdPath: filePath };
    }
    if (parts[0] === '.tasks' && parts[2] === 'task.md') {
      return { type: 'task', id: parts[1], mdPath: filePath };
    }
    if (parts[0] === '.skills' && parts[2] === 'skill.md') {
      return { type: 'skill', id: parts[1], mdPath: filePath };
    }
    return null;
  }

  /**
   * Determine if a file is an attachment (non-md file inside a note/task dir).
   * Returns { type, id } or null.
   */
  function classifyAttachment(filePath: string): { type: 'note' | 'task' | 'skill'; id: string } | null {
    const rel = path.relative(config.projectDir, filePath);
    const parts = rel.split(path.sep);
    if (parts.length !== 3) return null;

    const filename = parts[2];
    if (filename === 'note.md' || filename === 'task.md' || filename === 'skill.md') return null;

    if (parts[0] === '.notes') return { type: 'note', id: parts[1] };
    if (parts[0] === '.tasks') return { type: 'task', id: parts[1] };
    if (parts[0] === '.skills') return { type: 'skill', id: parts[1] };
    return null;
  }

  const handleAddOrChange = (filePath: string) => {
    if (config.tracker.isOwnWrite(filePath)) return;

    // Check if this is a main markdown file
    const md = classifyFile(filePath);
    if (md) {
      if (md.type === 'note') {
        const parsed = parseNoteFile(filePath);
        if (!parsed) return;
        config.mutationQueue.enqueue(async () => {
          await config.knowledgeManager.importFromFile(parsed);
        }).catch(err => process.stderr.write(`[mirror-watcher] note import error: ${err}\n`));
      } else if (md.type === 'task') {
        const parsed = parseTaskFile(filePath);
        if (!parsed) return;
        config.mutationQueue.enqueue(async () => {
          await config.taskManager.importFromFile(parsed);
        }).catch(err => process.stderr.write(`[mirror-watcher] task import error: ${err}\n`));
      } else if (md.type === 'skill' && config.skillManager) {
        const parsed = parseSkillFile(filePath);
        if (!parsed) return;
        const mgr = config.skillManager;
        config.mutationQueue.enqueue(async () => {
          await mgr.importFromFile(parsed);
        }).catch(err => process.stderr.write(`[mirror-watcher] skill import error: ${err}\n`));
      }
      return;
    }

    // Check if this is an attachment file
    const att = classifyAttachment(filePath);
    if (att) {
      config.mutationQueue.enqueue(async () => {
        if (att.type === 'note') {
          config.knowledgeManager.syncAttachments(att.id);
        } else if (att.type === 'task') {
          config.taskManager.syncAttachments(att.id);
        } else if (att.type === 'skill' && config.skillManager) {
          config.skillManager.syncAttachments(att.id);
        }
      }).catch(err => process.stderr.write(`[mirror-watcher] attachment sync error: ${err}\n`));
    }
  };

  const handleUnlink = (filePath: string) => {
    // Main md file deleted → delete entity from graph
    const md = classifyFile(filePath);
    if (md) {
      config.mutationQueue.enqueue(async () => {
        if (md.type === 'note') {
          config.knowledgeManager.deleteFromFile(md.id);
        } else if (md.type === 'task') {
          config.taskManager.deleteFromFile(md.id);
        } else if (md.type === 'skill' && config.skillManager) {
          config.skillManager.deleteFromFile(md.id);
        }
      }).catch(err => process.stderr.write(`[mirror-watcher] delete error: ${err}\n`));
      return;
    }

    // Attachment deleted → sync attachments metadata
    const att = classifyAttachment(filePath);
    if (att) {
      config.mutationQueue.enqueue(async () => {
        if (att.type === 'note') {
          config.knowledgeManager.syncAttachments(att.id);
        } else if (att.type === 'task') {
          config.taskManager.syncAttachments(att.id);
        } else if (att.type === 'skill' && config.skillManager) {
          config.skillManager.syncAttachments(att.id);
        }
      }).catch(err => process.stderr.write(`[mirror-watcher] attachment sync error: ${err}\n`));
    }
  };

  watcher.on('add', handleAddOrChange);
  watcher.on('change', handleAddOrChange);
  watcher.on('unlink', handleUnlink);
  watcher.on('ready', () => {
    const watched = ['.notes/', '.tasks/'];
    if (config.skillManager) watched.push('.skills/');
    process.stderr.write(`[mirror-watcher] Watching ${watched.join(', ')} in ${config.projectDir}\n`);
    resolveReady();
  });
  watcher.on('error', (err: unknown) => {
    process.stderr.write(`[mirror-watcher] Error: ${err}\n`);
  });

  return { whenReady, close: () => watcher.close() };
}

/**
 * Scan .notes/ and .tasks/ directories once on startup.
 * Imports any files that are newer than the graph's updatedAt.
 */
export async function scanMirrorDirs(config: MirrorWatcherConfig): Promise<void> {
  const notesDir = path.join(config.projectDir, '.notes');
  const tasksDir = path.join(config.projectDir, '.tasks');
  const skillsDir = path.join(config.projectDir, '.skills');
  let noteCount = 0;
  let taskCount = 0;
  let skillCount = 0;

  // Scan notes (directory-based: .notes/{id}/note.md)
  if (fs.existsSync(notesDir)) {
    const entries = fs.readdirSync(notesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const mdPath = path.join(notesDir, entry.name, 'note.md');
      if (!fs.existsSync(mdPath)) continue;

      noteCount++;
      const parsed = parseNoteFile(mdPath);
      if (!parsed) continue;

      const existingUpdatedAt = config.knowledgeManager.getNodeUpdatedAt(parsed.id);
      const fileMtime = fs.statSync(mdPath).mtimeMs;

      if (existingUpdatedAt == null || fileMtime > existingUpdatedAt) {
        await config.mutationQueue.enqueue(async () => {
          await config.knowledgeManager.importFromFile(parsed);
        });
      }
    }
  }

  // Scan tasks (directory-based: .tasks/{id}/task.md)
  if (fs.existsSync(tasksDir)) {
    const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const mdPath = path.join(tasksDir, entry.name, 'task.md');
      if (!fs.existsSync(mdPath)) continue;

      taskCount++;
      const parsed = parseTaskFile(mdPath);
      if (!parsed) continue;

      const existingUpdatedAt = config.taskManager.getNodeUpdatedAt(parsed.id);
      const fileMtime = fs.statSync(mdPath).mtimeMs;

      if (existingUpdatedAt == null || fileMtime > existingUpdatedAt) {
        await config.mutationQueue.enqueue(async () => {
          await config.taskManager.importFromFile(parsed);
        });
      }
    }
  }

  // Scan skills (directory-based: .skills/{id}/skill.md)
  if (config.skillManager && fs.existsSync(skillsDir)) {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const mdPath = path.join(skillsDir, entry.name, 'skill.md');
      if (!fs.existsSync(mdPath)) continue;

      skillCount++;
      const parsed = parseSkillFile(mdPath);
      if (!parsed) continue;

      const existingUpdatedAt = config.skillManager.getNodeUpdatedAt(parsed.id);
      const fileMtime = fs.statSync(mdPath).mtimeMs;

      if (existingUpdatedAt == null || fileMtime > existingUpdatedAt) {
        const mgr = config.skillManager;
        await config.mutationQueue.enqueue(async () => {
          await mgr.importFromFile(parsed);
        });
      }
    }
  }

  if (noteCount > 0 || taskCount > 0 || skillCount > 0) {
    process.stderr.write(`[mirror-watcher] Scanned ${noteCount} note(s), ${taskCount} task(s), ${skillCount} skill(s)\n`);
  }
}
