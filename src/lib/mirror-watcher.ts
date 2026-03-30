import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';
import type { KnowledgeGraphManager } from '../graphs/knowledge';
import type { TaskGraphManager } from '../graphs/task';
import type { SkillGraphManager } from '../graphs/skill';
import type { PromiseQueue } from './promise-queue';
import { parseNoteDir, parseTaskDir, parseSkillDir } from './file-import';
import { appendEvent } from './events-log';
import { parseMarkdown } from './frontmatter';
import type { WatcherHandle } from './watcher';
import { MIRROR_STALE_MS, MIRROR_MAX_ENTRIES, MIRROR_MTIME_TOLERANCE_MS } from '@/lib/defaults';
import type { TaskStatus, TaskPriority } from '../graphs/task-types';
import type { SkillSource } from '../graphs/skill-types';
import { createLogger } from '@/lib/logger';

const log = createLogger('mirror-watcher');

/**
 * Tracks recent mirror writes to suppress re-import (feedback loop prevention).
 * When mirrorNote/mirrorTask writes a file, the watcher will fire —
 * this tracker lets us detect our own writes and skip them.
 */
export class MirrorWriteTracker {
  /** Map from filePath → { mtimeMs (for comparison), recordedAt (for eviction) } */
  private recentWrites = new Map<string, { mtimeMs: number; recordedAt: number }>();
  private static readonly STALE_MS = MIRROR_STALE_MS;
  private static readonly MAX_ENTRIES = MIRROR_MAX_ENTRIES;

  /** Called by mirrorNote/mirrorTask after writing a file. */
  recordWrite(filePath: string): void {
    try {
      const stat = fs.statSync(filePath, { throwIfNoEntry: false } as fs.StatSyncOptions);
      if (stat) this.recentWrites.set(filePath, { mtimeMs: (stat as fs.Stats).mtimeMs, recordedAt: Date.now() });
    } catch { /* ignore */ }
    // Prevent unbounded growth — evict stale entries periodically
    if (this.recentWrites.size > MirrorWriteTracker.MAX_ENTRIES) this.evictStale();
  }

  /** Called by watcher before importing. Returns true if this was our own write. */
  isOwnWrite(filePath: string): boolean {
    const recorded = this.recentWrites.get(filePath);
    if (recorded == null) return false;
    try {
      const stat = fs.statSync(filePath, { throwIfNoEntry: false } as fs.StatSyncOptions);
      if (!stat) return false;
      if (Math.abs((stat as fs.Stats).mtimeMs - recorded.mtimeMs) < MIRROR_MTIME_TOLERANCE_MS) {
        this.recentWrites.delete(filePath);
        return true;
      }
    } catch { /* ignore */ }
    this.recentWrites.delete(filePath);
    return false;
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [filePath, entry] of this.recentWrites) {
      if (now - entry.recordedAt > MirrorWriteTracker.STALE_MS) this.recentWrites.delete(filePath);
    }
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

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

type ClassifiedFile =
  | { type: 'note-events' | 'task-events' | 'skill-events'; id: string; entityDir: string }
  | { type: 'note-content' | 'task-content' | 'skill-content'; id: string; entityDir: string }
  | { type: 'note-snapshot' | 'task-snapshot' | 'skill-snapshot'; id: string; entityDir: string }
  | { type: 'note-attachment' | 'task-attachment' | 'skill-attachment'; id: string; entityDir: string }
  | null;

function classifyFile(projectDir: string, filePath: string): ClassifiedFile {
  const rel = path.relative(projectDir, filePath);
  const parts = rel.split(path.sep);

  if (parts.length === 3) {
    const [dir, id, file] = parts;

    // Snapshot files (gitignored, regenerated)
    if (dir === '.notes' && file === 'note.md')  return { type: 'note-snapshot',  id, entityDir: path.join(projectDir, dir, id) };
    if (dir === '.tasks' && file === 'task.md')  return { type: 'task-snapshot',  id, entityDir: path.join(projectDir, dir, id) };
    if (dir === '.skills' && file === 'skill.md') return { type: 'skill-snapshot', id, entityDir: path.join(projectDir, dir, id) };

    // Event log (source of truth)
    if (dir === '.notes' && file === 'events.jsonl')  return { type: 'note-events',  id, entityDir: path.join(projectDir, dir, id) };
    if (dir === '.tasks' && file === 'events.jsonl')  return { type: 'task-events',  id, entityDir: path.join(projectDir, dir, id) };
    if (dir === '.skills' && file === 'events.jsonl') return { type: 'skill-events', id, entityDir: path.join(projectDir, dir, id) };

    // Content files (git-tracked human-editable)
    if (dir === '.notes' && file === 'content.md')      return { type: 'note-content',  id, entityDir: path.join(projectDir, dir, id) };
    if (dir === '.tasks' && file === 'description.md')  return { type: 'task-content',  id, entityDir: path.join(projectDir, dir, id) };
    if (dir === '.skills' && file === 'description.md') return { type: 'skill-content', id, entityDir: path.join(projectDir, dir, id) };
  }

  if (parts.length === 4) {
    const [dir, id, sub] = parts;
    // Attachment files in {id}/attachments/
    if (sub === 'attachments') {
      if (dir === '.notes')  return { type: 'note-attachment',  id, entityDir: path.join(projectDir, dir, id) };
      if (dir === '.tasks')  return { type: 'task-attachment',  id, entityDir: path.join(projectDir, dir, id) };
      if (dir === '.skills') return { type: 'skill-attachment', id, entityDir: path.join(projectDir, dir, id) };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Snapshot diff helpers — detect user edits to task.md/note.md/skill.md
// ---------------------------------------------------------------------------

function isoToMs(value: unknown): number | null {
  if (value == null) return null;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d.getTime();
}

const VALID_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']);
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const VALID_SOURCES = new Set(['user', 'learned']);

/** Parse a task snapshot file and extract structural fields from frontmatter. */
function parseTaskSnapshot(filePath: string): {
  status?: TaskStatus; priority?: TaskPriority; tags?: string[];
  dueDate?: number | null; estimate?: number | null; title?: string; description?: string;
} | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter: fm, body } = parseMarkdown(raw);
    const lines = body.split('\n');
    const headingMatch = lines[0]?.match(/^#\s+(.+)/);
    const title = headingMatch?.[1]?.trim();
    let start = 1;
    if (lines[start] === '') start++;
    const description = lines.slice(start).join('\n').trim();
    const result: ReturnType<typeof parseTaskSnapshot> = {};
    if (title) result.title = title;
    if (description) result.description = description;
    if (VALID_STATUSES.has(fm.status as string)) result.status = fm.status as TaskStatus;
    if (VALID_PRIORITIES.has(fm.priority as string)) result.priority = fm.priority as TaskPriority;
    if (Array.isArray(fm.tags)) result.tags = fm.tags.filter((t: unknown) => typeof t === 'string');
    if ('dueDate' in fm) result.dueDate = isoToMs(fm.dueDate);
    if ('estimate' in fm) result.estimate = typeof fm.estimate === 'number' ? fm.estimate : null;
    return result;
  } catch {
    return null;
  }
}

/** Parse a note snapshot file. */
function parseNoteSnapshot(filePath: string): {
  title?: string; tags?: string[]; content?: string;
} | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter: fm, body } = parseMarkdown(raw);
    const lines = body.split('\n');
    const headingMatch = lines[0]?.match(/^#\s+(.+)/);
    const title = headingMatch?.[1]?.trim();
    let start = 1;
    if (lines[start] === '') start++;
    const content = lines.slice(start).join('\n').trim();
    const result: ReturnType<typeof parseNoteSnapshot> = {};
    if (title) result.title = title;
    if (content !== undefined) result.content = content;
    if (Array.isArray(fm.tags)) result.tags = fm.tags.filter((t: unknown) => typeof t === 'string');
    return result;
  } catch {
    return null;
  }
}

/** Parse a skill snapshot file. */
function parseSkillSnapshot(filePath: string): {
  title?: string; tags?: string[]; source?: SkillSource; confidence?: number;
  triggers?: string[]; description?: string;
} | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter: fm, body } = parseMarkdown(raw);
    const lines = body.split('\n');
    const headingMatch = lines[0]?.match(/^#\s+(.+)/);
    const title = headingMatch?.[1]?.trim();
    let start = 1;
    if (lines[start] === '') start++;
    // Find ## Steps section to extract description
    const stepsIdx = lines.findIndex((l, i) => i >= start && /^##\s+Steps/i.test(l));
    const description = stepsIdx === -1
      ? lines.slice(start).join('\n').trim()
      : lines.slice(start, stepsIdx).join('\n').trim();
    const result: ReturnType<typeof parseSkillSnapshot> = {};
    if (title) result.title = title;
    if (description) result.description = description;
    if (Array.isArray(fm.tags)) result.tags = fm.tags.filter((t: unknown) => typeof t === 'string');
    if (VALID_SOURCES.has(fm.source as string)) result.source = fm.source as SkillSource;
    if (typeof fm.confidence === 'number') result.confidence = fm.confidence;
    if (Array.isArray(fm.triggers)) result.triggers = fm.triggers.filter((t: unknown) => typeof t === 'string');
    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// startMirrorWatcher
// ---------------------------------------------------------------------------

/**
 * Start watching .notes/, .tasks/, and .skills/ for external file edits.
 *
 * File types watched:
 * - events.jsonl changes → replay all events → importFromFile (e.g., after git pull)
 * - description.md / content.md changes → update description in graph (no new event)
 * - task.md / note.md / skill.md user edits → detect delta → append update events → importFromFile
 * - attachments/* → syncAttachments
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
    depth: 3, // increased to catch attachments/{filename}
  });

  const handleAddOrChange = (filePath: string) => {
    if (config.tracker.isOwnWrite(filePath)) return;

    const classified = classifyFile(config.projectDir, filePath);
    if (!classified) return;

    const { type, id, entityDir } = classified;

    // --- events.jsonl changed (e.g., git pull merged new events) ---
    if (type === 'note-events') {
      config.mutationQueue.enqueue(async () => {
        const parsed = parseNoteDir(entityDir);
        if (parsed) await config.knowledgeManager.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'note events import error'));
      return;
    }
    if (type === 'task-events') {
      config.mutationQueue.enqueue(async () => {
        const parsed = parseTaskDir(entityDir);
        if (parsed) await config.taskManager.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'task events import error'));
      return;
    }
    if (type === 'skill-events' && config.skillManager) {
      const mgr = config.skillManager;
      config.mutationQueue.enqueue(async () => {
        const parsed = parseSkillDir(entityDir);
        if (parsed) await mgr.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'skill events import error'));
      return;
    }

    // --- content.md / description.md changed (human-edited in IDE) ---
    if (type === 'note-content') {
      config.mutationQueue.enqueue(async () => {
        // Re-parse from directory to pick up new content + existing events
        const parsed = parseNoteDir(entityDir);
        if (parsed) await config.knowledgeManager.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'note content import error'));
      return;
    }
    if (type === 'task-content') {
      config.mutationQueue.enqueue(async () => {
        const parsed = parseTaskDir(entityDir);
        if (parsed) await config.taskManager.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'task content import error'));
      return;
    }
    if (type === 'skill-content' && config.skillManager) {
      const mgr = config.skillManager;
      config.mutationQueue.enqueue(async () => {
        const parsed = parseSkillDir(entityDir);
        if (parsed) await mgr.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'skill content import error'));
      return;
    }

    // --- snapshot (task.md / note.md / skill.md) edited by user ---
    // Detect delta vs current graph state, append update events, then re-import from dir
    if (type === 'task-snapshot') {
      config.mutationQueue.enqueue(async () => {
        const current = config.taskManager.getTask(id);
        const snapshot = parseTaskSnapshot(filePath);
        if (!current || !snapshot) return;

        const eventsPath = path.join(entityDir, 'events.jsonl');
        const delta: Record<string, unknown> = {};
        if (snapshot.title !== undefined && snapshot.title !== current.title) delta.title = snapshot.title;
        if (snapshot.status !== undefined && snapshot.status !== current.status) delta.status = snapshot.status;
        if (snapshot.priority !== undefined && snapshot.priority !== current.priority) delta.priority = snapshot.priority;
        if (snapshot.tags !== undefined && JSON.stringify(snapshot.tags) !== JSON.stringify(current.tags)) delta.tags = snapshot.tags;
        if ('dueDate' in snapshot && snapshot.dueDate !== current.dueDate) delta.dueDate = snapshot.dueDate;
        if ('estimate' in snapshot && snapshot.estimate !== current.estimate) delta.estimate = snapshot.estimate;

        if (Object.keys(delta).length > 0) {
          appendEvent(eventsPath, { op: 'update', ...delta });
          config.tracker.recordWrite(eventsPath);
        }

        // If description changed, write to description.md
        if (snapshot.description !== undefined && snapshot.description !== current.description) {
          const descPath = path.join(entityDir, 'description.md');
          fs.writeFileSync(descPath, snapshot.description, 'utf-8');
          config.tracker.recordWrite(descPath);
        }

        const parsed = parseTaskDir(entityDir);
        if (parsed) await config.taskManager.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'task snapshot edit error'));
      return;
    }

    if (type === 'note-snapshot') {
      config.mutationQueue.enqueue(async () => {
        const current = config.knowledgeManager.getNote(id);
        const snapshot = parseNoteSnapshot(filePath);
        if (!current || !snapshot) return;

        const eventsPath = path.join(entityDir, 'events.jsonl');
        const delta: Record<string, unknown> = {};
        if (snapshot.title !== undefined && snapshot.title !== current.title) delta.title = snapshot.title;
        if (snapshot.tags !== undefined && JSON.stringify(snapshot.tags) !== JSON.stringify(current.tags)) delta.tags = snapshot.tags;

        if (Object.keys(delta).length > 0) {
          appendEvent(eventsPath, { op: 'update', ...delta });
          config.tracker.recordWrite(eventsPath);
        }

        // If content changed, write to content.md
        if (snapshot.content !== undefined && snapshot.content !== current.content) {
          const contentPath = path.join(entityDir, 'content.md');
          fs.writeFileSync(contentPath, snapshot.content, 'utf-8');
          config.tracker.recordWrite(contentPath);
        }

        const parsed = parseNoteDir(entityDir);
        if (parsed) await config.knowledgeManager.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'note snapshot edit error'));
      return;
    }

    if (type === 'skill-snapshot' && config.skillManager) {
      const mgr = config.skillManager;
      config.mutationQueue.enqueue(async () => {
        const current = mgr.getSkill(id);
        const snapshot = parseSkillSnapshot(filePath);
        if (!current || !snapshot) return;

        const eventsPath = path.join(entityDir, 'events.jsonl');
        const delta: Record<string, unknown> = {};
        if (snapshot.title !== undefined && snapshot.title !== current.title) delta.title = snapshot.title;
        if (snapshot.tags !== undefined && JSON.stringify(snapshot.tags) !== JSON.stringify(current.tags)) delta.tags = snapshot.tags;
        if (snapshot.source !== undefined && snapshot.source !== current.source) delta.source = snapshot.source;
        if (snapshot.confidence !== undefined && snapshot.confidence !== current.confidence) delta.confidence = snapshot.confidence;
        if (snapshot.triggers !== undefined && JSON.stringify(snapshot.triggers) !== JSON.stringify(current.triggers)) delta.triggers = snapshot.triggers;

        if (Object.keys(delta).length > 0) {
          appendEvent(eventsPath, { op: 'update', ...delta });
          config.tracker.recordWrite(eventsPath);
        }

        // If description changed, write to description.md
        if (snapshot.description !== undefined && snapshot.description !== current.description) {
          const descPath = path.join(entityDir, 'description.md');
          fs.writeFileSync(descPath, snapshot.description, 'utf-8');
          config.tracker.recordWrite(descPath);
        }

        const parsed = parseSkillDir(entityDir);
        if (parsed) await mgr.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'skill snapshot edit error'));
      return;
    }

    // --- attachment file added ---
    if (type === 'note-attachment') {
      config.mutationQueue.enqueue(async () => {
        config.knowledgeManager.syncAttachments(id);
      }).catch(err => log.error({ err }, 'note attachment sync error'));
      return;
    }
    if (type === 'task-attachment') {
      config.mutationQueue.enqueue(async () => {
        config.taskManager.syncAttachments(id);
      }).catch(err => log.error({ err }, 'task attachment sync error'));
      return;
    }
    if (type === 'skill-attachment' && config.skillManager) {
      const mgr = config.skillManager;
      config.mutationQueue.enqueue(async () => {
        mgr.syncAttachments(id);
      }).catch(err => log.error({ err }, 'skill attachment sync error'));
      return;
    }
  };

  const handleUnlink = (filePath: string) => {
    const classified = classifyFile(config.projectDir, filePath);
    if (!classified) return;

    const { type, id, entityDir } = classified;

    // events.jsonl deleted → delete entity from graph
    if (type === 'note-events') {
      config.mutationQueue.enqueue(async () => {
        config.knowledgeManager.deleteFromFile(id);
      }).catch(err => log.error({ err }, 'note delete error'));
      return;
    }
    if (type === 'task-events') {
      config.mutationQueue.enqueue(async () => {
        config.taskManager.deleteFromFile(id);
      }).catch(err => log.error({ err }, 'task delete error'));
      return;
    }
    if (type === 'skill-events' && config.skillManager) {
      const mgr = config.skillManager;
      config.mutationQueue.enqueue(async () => {
        mgr.deleteFromFile(id);
      }).catch(err => log.error({ err }, 'skill delete error'));
      return;
    }

    // Snapshot deleted → ignore (gitignored, server regenerates it)
    if (type === 'note-snapshot' || type === 'task-snapshot' || type === 'skill-snapshot') {
      return;
    }

    // content.md deleted → re-import with empty content
    if (type === 'note-content') {
      config.mutationQueue.enqueue(async () => {
        const parsed = parseNoteDir(entityDir);
        if (parsed) await config.knowledgeManager.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'note content delete sync error'));
      return;
    }
    if (type === 'task-content') {
      config.mutationQueue.enqueue(async () => {
        const parsed = parseTaskDir(entityDir);
        if (parsed) await config.taskManager.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'task content delete sync error'));
      return;
    }
    if (type === 'skill-content' && config.skillManager) {
      const mgr = config.skillManager;
      config.mutationQueue.enqueue(async () => {
        const parsed = parseSkillDir(entityDir);
        if (parsed) await mgr.importFromFile(parsed);
      }).catch(err => log.error({ err }, 'skill content delete sync error'));
      return;
    }

    // Attachment deleted → sync attachments metadata
    if (type === 'note-attachment') {
      config.mutationQueue.enqueue(async () => {
        config.knowledgeManager.syncAttachments(id);
      }).catch(err => log.error({ err }, 'note attachment sync error'));
      return;
    }
    if (type === 'task-attachment') {
      config.mutationQueue.enqueue(async () => {
        config.taskManager.syncAttachments(id);
      }).catch(err => log.error({ err }, 'task attachment sync error'));
      return;
    }
    if (type === 'skill-attachment' && config.skillManager) {
      const mgr = config.skillManager;
      config.mutationQueue.enqueue(async () => {
        mgr.syncAttachments(id);
      }).catch(err => log.error({ err }, 'skill attachment sync error'));
      return;
    }
  };

  watcher.on('add', handleAddOrChange);
  watcher.on('change', handleAddOrChange);
  watcher.on('unlink', handleUnlink);
  watcher.once('ready', () => {
    const watched = ['.notes/', '.tasks/'];
    if (config.skillManager) watched.push('.skills/');
    log.info({ dirs: watched, projectDir: config.projectDir }, 'Watching mirror directories');
    resolveReady();
  });
  watcher.on('error', (err: unknown) => {
    log.error({ err }, 'watcher error');
  });

  return { whenReady, close: () => watcher.close() };
}

/**
 * Scan .notes/, .tasks/, and .skills/ directories once on startup.
 * Imports any entity dirs where events.jsonl is newer than the graph's updatedAt.
 */
export async function scanMirrorDirs(config: MirrorWatcherConfig): Promise<void> {
  const notesDir = path.join(config.projectDir, '.notes');
  const tasksDir = path.join(config.projectDir, '.tasks');
  const skillsDir = path.join(config.projectDir, '.skills');
  let noteCount = 0;
  let taskCount = 0;
  let skillCount = 0;

  // Scan notes (directory-based: .notes/{id}/events.jsonl)
  if (fs.existsSync(notesDir)) {
    const entries = fs.readdirSync(notesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entityDir = path.join(notesDir, entry.name);
      const eventsPath = path.join(entityDir, 'events.jsonl');
      if (!fs.existsSync(eventsPath)) continue;

      noteCount++;
      const parsed = parseNoteDir(entityDir);
      if (!parsed) continue;

      const existingUpdatedAt = config.knowledgeManager.getNodeUpdatedAt(parsed.id);
      const evMtime = fs.statSync(eventsPath).mtimeMs;
      const contentPath = path.join(entityDir, 'content.md');
      const contentMtime = fs.existsSync(contentPath) ? fs.statSync(contentPath).mtimeMs : 0;
      const fileMtime = Math.max(evMtime, contentMtime);

      if (existingUpdatedAt == null || fileMtime > existingUpdatedAt) {
        await config.mutationQueue.enqueue(async () => {
          await config.knowledgeManager.importFromFile(parsed);
        });
      }
    }
  }

  // Scan tasks (directory-based: .tasks/{id}/events.jsonl)
  if (fs.existsSync(tasksDir)) {
    const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entityDir = path.join(tasksDir, entry.name);
      const eventsPath = path.join(entityDir, 'events.jsonl');
      if (!fs.existsSync(eventsPath)) continue;

      taskCount++;
      const parsed = parseTaskDir(entityDir);
      if (!parsed) continue;

      const existingUpdatedAt = config.taskManager.getNodeUpdatedAt(parsed.id);
      const evMtime = fs.statSync(eventsPath).mtimeMs;
      const descPath = path.join(entityDir, 'description.md');
      const descMtime = fs.existsSync(descPath) ? fs.statSync(descPath).mtimeMs : 0;
      const fileMtime = Math.max(evMtime, descMtime);

      if (existingUpdatedAt == null || fileMtime > existingUpdatedAt) {
        await config.mutationQueue.enqueue(async () => {
          await config.taskManager.importFromFile(parsed);
        });
      }
    }
  }

  // Scan skills (directory-based: .skills/{id}/events.jsonl)
  if (config.skillManager && fs.existsSync(skillsDir)) {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entityDir = path.join(skillsDir, entry.name);
      const eventsPath = path.join(entityDir, 'events.jsonl');
      if (!fs.existsSync(eventsPath)) continue;

      skillCount++;
      const parsed = parseSkillDir(entityDir);
      if (!parsed) continue;

      const existingUpdatedAt = config.skillManager.getNodeUpdatedAt(parsed.id);
      const evMtime = fs.statSync(eventsPath).mtimeMs;
      const descPath = path.join(entityDir, 'description.md');
      const descMtime = fs.existsSync(descPath) ? fs.statSync(descPath).mtimeMs : 0;
      const fileMtime = Math.max(evMtime, descMtime);

      if (existingUpdatedAt == null || fileMtime > existingUpdatedAt) {
        const mgr = config.skillManager;
        await config.mutationQueue.enqueue(async () => {
          await mgr.importFromFile(parsed);
        });
      }
    }
  }

  if (noteCount > 0 || taskCount > 0 || skillCount > 0) {
    log.info({ notes: noteCount, tasks: taskCount, skills: skillCount }, 'Scanned mirror directories');
  }
}
