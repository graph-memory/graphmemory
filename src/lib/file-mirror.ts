import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { serializeMarkdown } from './frontmatter';
import type { TaskStatus, TaskPriority } from '../store/types/tasks';
import type { SkillSource } from '../store/types/skills';
import {
  appendEvent,
  ensureGitignore,
  ensureGitattributes,
  type CreatedNoteEvent,
  type CreatedTaskEvent,
  type CreatedSkillEvent,
  type CreatedEpicEvent,
} from './events-log';
import type { EpicStatus } from '../store/types/epics';
import { createLogger } from '@/lib/logger';

const log = createLogger('file-mirror');

/** Sanitize a string for safe inclusion in log output. */
function sanitizeForLog(s: string): string {
  return s.replace(/[\r\n\t]/g, ' ').slice(0, 200);
}

/** Write to a temp file then rename — atomic on same filesystem. */
function atomicWriteFileSync(filePath: string, data: string | Buffer, encoding?: BufferEncoding): void {
  const tmp = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, data, encoding);
  fs.renameSync(tmp, filePath);
}

export interface RelationFrontmatter {
  to: string;
  kind: string;
  graph?: string;
}

export interface RelationLike {
  fromId: string;
  toId: string;
  kind: string;
  targetGraph?: string;
}

function tsToIso(ts: number | null | undefined): string | null {
  if (ts == null || ts === 0) return null;
  return new Date(ts).toISOString();
}

function buildOutgoingRelations(entityId: string, relations: RelationLike[]): RelationFrontmatter[] {
  return relations
    .filter(r => r.fromId === entityId)
    .map(r => {
      const entry: RelationFrontmatter = { to: r.toId, kind: r.kind };
      if (r.targetGraph) entry.graph = r.targetGraph;
      return entry;
    });
}

// ---------------------------------------------------------------------------
// Note mirror functions
// ---------------------------------------------------------------------------

interface NoteAttrs {
  title: string; content: string; tags: string[];
  createdAt: number; updatedAt: number; version: number;
  createdBy?: string; updatedBy?: string;
}

/** Append a 'created' event + write content.md + regenerate note.md snapshot. */
export function mirrorNoteCreate(
  notesDir: string,
  noteId: string,
  attrs: NoteAttrs,
  relations: RelationLike[],
): void {
  try {
    const safeId = sanitizeEntityId(noteId);
    if (!safeId) {
      log.warn('rejected invalid entity ID');
      return;
    }
    const entityDir = path.join(notesDir, safeId);
    fs.mkdirSync(entityDir, { recursive: true });

    const eventsPath = path.join(entityDir, 'events.jsonl');
    if (!fs.existsSync(eventsPath)) {
      const event: Omit<CreatedNoteEvent, 'ts'> = {
        op: 'created',
        id: noteId,
        title: attrs.title,
        tags: attrs.tags,
        createdAt: attrs.createdAt,
      };
      if (attrs.createdBy) event.createdBy = attrs.createdBy;
      appendEvent(eventsPath, event);
    }

    atomicWriteFileSync(path.join(entityDir, 'content.md'), attrs.content, 'utf-8');
    _regenerateNoteSnapshot(notesDir, noteId, attrs, relations);
    ensureGitignore(notesDir, '*/note.md');
    ensureGitattributes(notesDir);
  } catch (err) {
    log.error({ err, noteId: sanitizeForLog(noteId) }, 'failed to mirror note create');
  }
}

/** Append an 'update' event + (if content changed) write content.md + regenerate note.md. */
export function mirrorNoteUpdate(
  notesDir: string,
  noteId: string,
  patch: Partial<NoteAttrs & { by?: string }>,
  attrs: NoteAttrs,
  relations: RelationLike[],
): void {
  try {
    const safeId = sanitizeEntityId(noteId);
    if (!safeId) {
      log.warn('rejected invalid entity ID');
      return;
    }
    const entityDir = path.join(notesDir, safeId);
    fs.mkdirSync(entityDir, { recursive: true });

    const eventsPath = path.join(entityDir, 'events.jsonl');
    const delta: Record<string, unknown> = { op: 'update' };
    if (patch.title !== undefined) delta.title = patch.title;
    if (patch.tags !== undefined) delta.tags = patch.tags;
    if (patch.by !== undefined) delta.by = patch.by;
    else if (attrs.updatedBy) delta.by = attrs.updatedBy;

    if (Object.keys(delta).length > 1) appendEvent(eventsPath, delta as Parameters<typeof appendEvent>[1]);

    if (patch.content !== undefined) {
      atomicWriteFileSync(path.join(entityDir, 'content.md'), patch.content, 'utf-8');
    }
    _regenerateNoteSnapshot(notesDir, noteId, attrs, relations);
  } catch (err) {
    log.error({ err, noteId: sanitizeForLog(noteId) }, 'failed to mirror note update');
  }
}

function _regenerateNoteSnapshot(
  notesDir: string,
  noteId: string,
  attrs: NoteAttrs,
  relations: RelationLike[],
): void {
  const outgoing = buildOutgoingRelations(noteId, relations);
  const fm: Record<string, unknown> = {
    id: noteId,
    tags: attrs.tags,
    createdAt: tsToIso(attrs.createdAt),
    updatedAt: tsToIso(attrs.updatedAt),
    version: attrs.version,
  };
  if (attrs.createdBy) fm.createdBy = attrs.createdBy;
  if (attrs.updatedBy) fm.updatedBy = attrs.updatedBy;
  if (outgoing.length > 0) fm.relations = outgoing;

  const safeId = sanitizeEntityId(noteId);
  if (!safeId) return;
  const body = `# ${attrs.title}\n\n${attrs.content}`;
  const entityDir = path.join(notesDir, safeId);
  fs.mkdirSync(entityDir, { recursive: true });
  atomicWriteFileSync(path.join(entityDir, 'note.md'), serializeMarkdown(fm, body));
}

// ---------------------------------------------------------------------------
// Task mirror functions
// ---------------------------------------------------------------------------

interface TaskAttrs {
  title: string; description: string; status: TaskStatus; priority: TaskPriority;
  tags: string[]; order: number; assignee: string | null;
  dueDate: number | null; estimate: number | null; completedAt: number | null;
  createdAt: number; updatedAt: number; version: number;
  createdBy?: string; updatedBy?: string;
}

/** Append a 'created' event + write description.md + regenerate task.md snapshot. */
export function mirrorTaskCreate(
  tasksDir: string,
  taskId: string,
  attrs: TaskAttrs,
  relations: RelationLike[],
): void {
  try {
    const safeId = sanitizeEntityId(taskId);
    if (!safeId) {
      log.warn('rejected invalid entity ID');
      return;
    }
    const entityDir = path.join(tasksDir, safeId);
    fs.mkdirSync(entityDir, { recursive: true });

    const eventsPath = path.join(entityDir, 'events.jsonl');
    if (!fs.existsSync(eventsPath)) {
      const event: Omit<CreatedTaskEvent, 'ts'> = {
        op: 'created',
        id: taskId,
        title: attrs.title,
        status: attrs.status,
        priority: attrs.priority,
        tags: attrs.tags,
        dueDate: attrs.dueDate,
        estimate: attrs.estimate,
        completedAt: attrs.completedAt,
        createdAt: attrs.createdAt,
      };
      if (attrs.createdBy) event.createdBy = attrs.createdBy;
      appendEvent(eventsPath, event);
    }

    atomicWriteFileSync(path.join(entityDir, 'description.md'), attrs.description, 'utf-8');
    _regenerateTaskSnapshot(tasksDir, taskId, attrs, relations);
    ensureGitignore(tasksDir, '*/task.md');
    ensureGitattributes(tasksDir);
  } catch (err) {
    log.error({ err, taskId: sanitizeForLog(taskId) }, 'failed to mirror task create');
  }
}

/** Append an 'update' event + (if description changed) write description.md + regenerate task.md. */
export function mirrorTaskUpdate(
  tasksDir: string,
  taskId: string,
  patch: Partial<TaskAttrs & { by?: string }>,
  attrs: TaskAttrs,
  relations: RelationLike[],
): void {
  try {
    const safeId = sanitizeEntityId(taskId);
    if (!safeId) {
      log.warn('rejected invalid entity ID');
      return;
    }
    const entityDir = path.join(tasksDir, safeId);
    fs.mkdirSync(entityDir, { recursive: true });

    const eventsPath = path.join(entityDir, 'events.jsonl');
    const delta: Record<string, unknown> = { op: 'update' };
    if (patch.title !== undefined) delta.title = patch.title;
    if (patch.status !== undefined) delta.status = patch.status;
    if (patch.priority !== undefined) delta.priority = patch.priority;
    if (patch.tags !== undefined) delta.tags = patch.tags;
    if ('dueDate' in patch) delta.dueDate = patch.dueDate;
    if ('estimate' in patch) delta.estimate = patch.estimate;
    if ('completedAt' in patch) delta.completedAt = patch.completedAt;
    if (patch.by !== undefined) delta.by = patch.by;
    else if (attrs.updatedBy) delta.by = attrs.updatedBy;

    if (Object.keys(delta).length > 1) appendEvent(eventsPath, delta as Parameters<typeof appendEvent>[1]);

    if (patch.description !== undefined) {
      atomicWriteFileSync(path.join(entityDir, 'description.md'), patch.description, 'utf-8');
    }
    _regenerateTaskSnapshot(tasksDir, taskId, attrs, relations);
  } catch (err) {
    log.error({ err, taskId: sanitizeForLog(taskId) }, 'failed to mirror task update');
  }
}

function _regenerateTaskSnapshot(
  tasksDir: string,
  taskId: string,
  attrs: TaskAttrs,
  relations: RelationLike[],
): void {
  const outgoing = buildOutgoingRelations(taskId, relations);
  const fm: Record<string, unknown> = {
    id: taskId,
    status: attrs.status,
    priority: attrs.priority,
    order: attrs.order ?? 0,
    tags: attrs.tags,
    assignee: attrs.assignee ?? null,
    dueDate: tsToIso(attrs.dueDate),
    estimate: attrs.estimate,
    completedAt: tsToIso(attrs.completedAt),
    createdAt: tsToIso(attrs.createdAt),
    updatedAt: tsToIso(attrs.updatedAt),
    version: attrs.version,
  };
  if (attrs.createdBy) fm.createdBy = attrs.createdBy;
  if (attrs.updatedBy) fm.updatedBy = attrs.updatedBy;
  if (outgoing.length > 0) fm.relations = outgoing;

  const safeId = sanitizeEntityId(taskId);
  if (!safeId) return;
  const body = `# ${attrs.title}\n\n${attrs.description}`;
  const entityDir = path.join(tasksDir, safeId);
  fs.mkdirSync(entityDir, { recursive: true });
  atomicWriteFileSync(path.join(entityDir, 'task.md'), serializeMarkdown(fm, body));
}

// ---------------------------------------------------------------------------
// Skill mirror functions
// ---------------------------------------------------------------------------

interface SkillAttrs {
  title: string; description: string; steps: string[]; triggers: string[];
  inputHints: string[]; filePatterns: string[]; tags: string[];
  source: SkillSource; confidence: number; usageCount: number; lastUsedAt: number | null;
  createdAt: number; updatedAt: number; version: number;
  createdBy?: string; updatedBy?: string;
}

/** Append a 'created' event + write description.md + regenerate skill.md snapshot. */
export function mirrorSkillCreate(
  skillsDir: string,
  skillId: string,
  attrs: SkillAttrs,
  relations: RelationLike[],
): void {
  try {
    const safeId = sanitizeEntityId(skillId);
    if (!safeId) {
      log.warn('rejected invalid entity ID');
      return;
    }
    const entityDir = path.join(skillsDir, safeId);
    fs.mkdirSync(entityDir, { recursive: true });

    const eventsPath = path.join(entityDir, 'events.jsonl');
    if (!fs.existsSync(eventsPath)) {
      const event: Omit<CreatedSkillEvent, 'ts'> = {
        op: 'created',
        id: skillId,
        title: attrs.title,
        tags: attrs.tags,
        steps: attrs.steps,
        triggers: attrs.triggers,
        inputHints: attrs.inputHints,
        filePatterns: attrs.filePatterns,
        source: attrs.source,
        confidence: attrs.confidence,
        usageCount: attrs.usageCount,
        lastUsedAt: attrs.lastUsedAt,
        createdAt: attrs.createdAt,
      };
      if (attrs.createdBy) event.createdBy = attrs.createdBy;
      appendEvent(eventsPath, event);
    }

    atomicWriteFileSync(path.join(entityDir, 'description.md'), attrs.description, 'utf-8');
    _regenerateSkillSnapshot(skillsDir, skillId, attrs, relations);
    ensureGitignore(skillsDir, '*/skill.md');
    ensureGitattributes(skillsDir);
  } catch (err) {
    log.error({ err, skillId: sanitizeForLog(skillId) }, 'failed to mirror skill create');
  }
}

/** Append an 'update' event + (if description changed) write description.md + regenerate skill.md. */
export function mirrorSkillUpdate(
  skillsDir: string,
  skillId: string,
  patch: Partial<SkillAttrs & { by?: string }>,
  attrs: SkillAttrs,
  relations: RelationLike[],
): void {
  try {
    const safeId = sanitizeEntityId(skillId);
    if (!safeId) {
      log.warn('rejected invalid entity ID');
      return;
    }
    const entityDir = path.join(skillsDir, safeId);
    fs.mkdirSync(entityDir, { recursive: true });

    const eventsPath = path.join(entityDir, 'events.jsonl');
    const delta: Record<string, unknown> = { op: 'update' };
    if (patch.title !== undefined) delta.title = patch.title;
    if (patch.tags !== undefined) delta.tags = patch.tags;
    if (patch.steps !== undefined) delta.steps = patch.steps;
    if (patch.triggers !== undefined) delta.triggers = patch.triggers;
    if (patch.inputHints !== undefined) delta.inputHints = patch.inputHints;
    if (patch.filePatterns !== undefined) delta.filePatterns = patch.filePatterns;
    if (patch.source !== undefined) delta.source = patch.source;
    if (patch.confidence !== undefined) delta.confidence = patch.confidence;
    if (patch.usageCount !== undefined) delta.usageCount = patch.usageCount;
    if ('lastUsedAt' in patch) delta.lastUsedAt = patch.lastUsedAt;
    if (patch.by !== undefined) delta.by = patch.by;
    else if (attrs.updatedBy) delta.by = attrs.updatedBy;

    if (Object.keys(delta).length > 1) appendEvent(eventsPath, delta as Parameters<typeof appendEvent>[1]);

    if (patch.description !== undefined) {
      atomicWriteFileSync(path.join(entityDir, 'description.md'), patch.description, 'utf-8');
    }
    _regenerateSkillSnapshot(skillsDir, skillId, attrs, relations);
  } catch (err) {
    log.error({ err, skillId: sanitizeForLog(skillId) }, 'failed to mirror skill update');
  }
}

function _regenerateSkillSnapshot(
  skillsDir: string,
  skillId: string,
  attrs: SkillAttrs,
  relations: RelationLike[],
): void {
  const outgoing = buildOutgoingRelations(skillId, relations);
  const fm: Record<string, unknown> = {
    id: skillId,
    source: attrs.source,
    confidence: attrs.confidence,
    triggers: attrs.triggers,
    inputHints: attrs.inputHints,
    filePatterns: attrs.filePatterns,
    tags: attrs.tags,
    createdAt: tsToIso(attrs.createdAt),
    updatedAt: tsToIso(attrs.updatedAt),
    version: attrs.version,
  };
  if (attrs.createdBy) fm.createdBy = attrs.createdBy;
  if (attrs.updatedBy) fm.updatedBy = attrs.updatedBy;
  if (outgoing.length > 0) fm.relations = outgoing;

  const stepsBlock = attrs.steps.length > 0
    ? `\n\n## Steps\n${attrs.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';
  const safeId = sanitizeEntityId(skillId);
  if (!safeId) return;
  const body = `# ${attrs.title}\n\n${attrs.description}${stepsBlock}`;
  const entityDir = path.join(skillsDir, safeId);
  fs.mkdirSync(entityDir, { recursive: true });
  atomicWriteFileSync(path.join(entityDir, 'skill.md'), serializeMarkdown(fm, body));
}

// ---------------------------------------------------------------------------
// Epic mirror functions
// ---------------------------------------------------------------------------

type EpicAttrs = {
  title: string;
  description: string;
  status: EpicStatus;
  priority: string;
  tags: string[];
  order?: number;
  createdAt: number;
  updatedAt: number;
  version: number;
  createdBy?: string | null;
  updatedBy?: string | null;
};

/** Append a 'created' event + write description.md + regenerate epic.md snapshot. */
export function mirrorEpicCreate(
  epicsDir: string,
  epicId: string,
  attrs: EpicAttrs,
  relations: RelationLike[],
): void {
  try {
    const safeId = sanitizeEntityId(epicId);
    if (!safeId) {
      log.warn('rejected invalid entity ID');
      return;
    }
    const entityDir = path.join(epicsDir, safeId);
    fs.mkdirSync(entityDir, { recursive: true });

    const eventsPath = path.join(entityDir, 'events.jsonl');
    if (!fs.existsSync(eventsPath)) {
      const event: Omit<CreatedEpicEvent, 'ts'> = {
        op: 'created',
        id: epicId,
        title: attrs.title,
        status: attrs.status,
        priority: attrs.priority as CreatedEpicEvent['priority'],
        tags: attrs.tags,
        createdAt: attrs.createdAt,
      };
      if (attrs.createdBy) event.createdBy = attrs.createdBy;
      appendEvent(eventsPath, event);
    }

    atomicWriteFileSync(path.join(entityDir, 'description.md'), attrs.description, 'utf-8');
    _regenerateEpicSnapshot(epicsDir, epicId, attrs, relations);
    ensureGitignore(epicsDir, '*/epic.md');
    ensureGitattributes(epicsDir);
  } catch (err) {
    log.error({ err, epicId: sanitizeForLog(epicId) }, 'failed to mirror epic create');
  }
}

/** Append an 'update' event + (if description changed) write description.md + regenerate epic.md. */
export function mirrorEpicUpdate(
  epicsDir: string,
  epicId: string,
  patch: Partial<EpicAttrs & { by?: string }>,
  attrs: EpicAttrs,
  relations: RelationLike[],
): void {
  try {
    const safeId = sanitizeEntityId(epicId);
    if (!safeId) {
      log.warn('rejected invalid entity ID');
      return;
    }
    const entityDir = path.join(epicsDir, safeId);
    fs.mkdirSync(entityDir, { recursive: true });

    const eventsPath = path.join(entityDir, 'events.jsonl');
    const delta: Record<string, unknown> = { op: 'update' };
    if (patch.title !== undefined) delta.title = patch.title;
    if (patch.status !== undefined) delta.status = patch.status;
    if (patch.priority !== undefined) delta.priority = patch.priority;
    if (patch.tags !== undefined) delta.tags = patch.tags;
    if (patch.by !== undefined) delta.by = patch.by;
    else if (attrs.updatedBy) delta.by = attrs.updatedBy;

    if (Object.keys(delta).length > 1) appendEvent(eventsPath, delta as Parameters<typeof appendEvent>[1]);

    if (patch.description !== undefined) {
      atomicWriteFileSync(path.join(entityDir, 'description.md'), patch.description, 'utf-8');
    }
    _regenerateEpicSnapshot(epicsDir, epicId, attrs, relations);
  } catch (err) {
    log.error({ err, epicId: sanitizeForLog(epicId) }, 'failed to mirror epic update');
  }
}

function _regenerateEpicSnapshot(
  epicsDir: string,
  epicId: string,
  attrs: EpicAttrs,
  relations: RelationLike[],
): void {
  const outgoing = buildOutgoingRelations(epicId, relations);
  const fm: Record<string, unknown> = {
    id: epicId,
    status: attrs.status,
    priority: attrs.priority,
    order: attrs.order ?? 0,
    tags: attrs.tags,
    createdAt: tsToIso(attrs.createdAt),
    updatedAt: tsToIso(attrs.updatedAt),
    version: attrs.version,
  };
  if (attrs.createdBy) fm.createdBy = attrs.createdBy;
  if (attrs.updatedBy) fm.updatedBy = attrs.updatedBy;
  if (outgoing.length > 0) fm.relations = outgoing;

  const safeId = sanitizeEntityId(epicId);
  if (!safeId) return;
  const body = `# ${attrs.title}\n\n${attrs.description}`;
  const entityDir = path.join(epicsDir, safeId);
  fs.mkdirSync(entityDir, { recursive: true });
  atomicWriteFileSync(path.join(entityDir, 'epic.md'), serializeMarkdown(fm, body));
}

export function mirrorEpicRelation(
  epicsDir: string,
  epicId: string,
  action: 'add' | 'remove',
  kind: string,
  to: string,
  attrs: EpicAttrs,
  relations: RelationLike[],
  graph?: string,
  by?: string,
): void {
  try {
    const safeId = sanitizeEntityId(epicId);
    if (!safeId) return;
    const entityDir = path.join(epicsDir, safeId);
    const eventsPath = path.join(entityDir, 'events.jsonl');
    const event: Record<string, unknown> = { op: 'relation', action, kind, to };
    if (graph) event.graph = graph;
    if (by) event.by = by;
    appendEvent(eventsPath, event as Parameters<typeof appendEvent>[1]);
    _regenerateEpicSnapshot(epicsDir, epicId, attrs, relations);
  } catch (err) {
    log.error({ err, epicId: sanitizeForLog(epicId) }, 'failed to mirror epic relation');
  }
}

// ---------------------------------------------------------------------------
// Relation + attachment event append helpers
// ---------------------------------------------------------------------------

/** Append a relation add/remove event and regenerate snapshot. */
export function mirrorNoteRelation(
  notesDir: string,
  noteId: string,
  action: 'add' | 'remove',
  kind: string,
  to: string,
  attrs: NoteAttrs,
  relations: RelationLike[],
  graph?: string,
  by?: string,
): void {
  try {
    const safeId = sanitizeEntityId(noteId);
    if (!safeId) return;
    const entityDir = path.join(notesDir, safeId);
    const eventsPath = path.join(entityDir, 'events.jsonl');
    const event: Record<string, unknown> = { op: 'relation', action, kind, to };
    if (graph) event.graph = graph;
    if (by) event.by = by;
    appendEvent(eventsPath, event as Parameters<typeof appendEvent>[1]);
    _regenerateNoteSnapshot(notesDir, noteId, attrs, relations);
  } catch (err) {
    log.error({ err, noteId: sanitizeForLog(noteId) }, 'failed to mirror note relation');
  }
}

export function mirrorTaskRelation(
  tasksDir: string,
  taskId: string,
  action: 'add' | 'remove',
  kind: string,
  to: string,
  attrs: TaskAttrs,
  relations: RelationLike[],
  graph?: string,
  by?: string,
): void {
  try {
    const safeId = sanitizeEntityId(taskId);
    if (!safeId) return;
    const entityDir = path.join(tasksDir, safeId);
    const eventsPath = path.join(entityDir, 'events.jsonl');
    const event: Record<string, unknown> = { op: 'relation', action, kind, to };
    if (graph) event.graph = graph;
    if (by) event.by = by;
    appendEvent(eventsPath, event as Parameters<typeof appendEvent>[1]);
    _regenerateTaskSnapshot(tasksDir, taskId, attrs, relations);
  } catch (err) {
    log.error({ err, taskId: sanitizeForLog(taskId) }, 'failed to mirror task relation');
  }
}

export function mirrorSkillRelation(
  skillsDir: string,
  skillId: string,
  action: 'add' | 'remove',
  kind: string,
  to: string,
  attrs: SkillAttrs,
  relations: RelationLike[],
  graph?: string,
  by?: string,
): void {
  try {
    const safeId = sanitizeEntityId(skillId);
    if (!safeId) return;
    const entityDir = path.join(skillsDir, safeId);
    const eventsPath = path.join(entityDir, 'events.jsonl');
    const event: Record<string, unknown> = { op: 'relation', action, kind, to };
    if (graph) event.graph = graph;
    if (by) event.by = by;
    appendEvent(eventsPath, event as Parameters<typeof appendEvent>[1]);
    _regenerateSkillSnapshot(skillsDir, skillId, attrs, relations);
  } catch (err) {
    log.error({ err, skillId: sanitizeForLog(skillId) }, 'failed to mirror skill relation');
  }
}

/** Append an attachment add/remove event. */
export function mirrorAttachmentEvent(
  entityDir: string,
  action: 'add' | 'remove',
  file: string,
  by?: string,
): void {
  try {
    const eventsPath = path.join(entityDir, 'events.jsonl');
    const event: Record<string, unknown> = { op: 'attachment', action, file };
    if (by) event.by = by;
    appendEvent(eventsPath, event as Parameters<typeof appendEvent>[1]);
  } catch (err) {
    log.error({ err }, 'failed to mirror attachment event');
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Delete the entire mirror directory for a note, task or skill (including attachments). */
export function deleteMirrorDir(dir: string, id: string): void {
  const safeId = sanitizeEntityId(id);
  if (!safeId) {
    log.warn('rejected invalid entity ID');
    return;
  }
  try {
    fs.rmSync(path.join(dir, safeId), { recursive: true, force: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error({ err, id: sanitizeForLog(id) }, 'failed to delete mirror dir');
    }
  }
}

// ---------------------------------------------------------------------------
// Attachment file helpers (paths now go through attachments/ subdir)
// ---------------------------------------------------------------------------

/** Sanitize an entity ID: extract basename, strip null bytes and path traversal. */
export function sanitizeEntityId(id: string): string {
  const base = path.basename(id.replace(/\0/g, '').replace(/\\/g, '/')).trim();
  if (base === '.' || base === '..') return '';
  return base;
}

/** Sanitize a filename: extract basename, strip null bytes and path traversal. */
export function sanitizeFilename(name: string): string {
  // Normalize backslashes to forward slashes (path.basename on Unix doesn't treat \ as separator)
  const base = path.basename(name.replace(/\0/g, '').replace(/\\/g, '/')).trim();
  // Reject pure traversal names
  if (base === '.' || base === '..') return '';
  return base;
}

/** Write an attachment file to the entity's attachments/ subdirectory. */
export function writeAttachment(baseDir: string, entityId: string, filename: string, data: Buffer): void {
  const safeEntityId = sanitizeEntityId(entityId);
  if (!safeEntityId) throw new Error('Entity ID is empty after sanitization');
  const safe = sanitizeFilename(filename);
  if (!safe) throw new Error('Attachment filename is empty after sanitization');
  const attachmentsDir = path.join(baseDir, safeEntityId, 'attachments');
  fs.mkdirSync(attachmentsDir, { recursive: true });
  fs.writeFileSync(path.join(attachmentsDir, safe), data);
}

/** Delete an attachment file from attachments/ subdir. Returns true if it existed. */
export function deleteAttachment(baseDir: string, entityId: string, filename: string): boolean {
  const safeEntityId = sanitizeEntityId(entityId);
  if (!safeEntityId) return false;
  const filePath = path.join(baseDir, safeEntityId, 'attachments', sanitizeFilename(filename));
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error({ err, filename: sanitizeForLog(filename) }, 'failed to delete attachment');
    }
    return false;
  }
}

/** Get the absolute path of an attachment in attachments/ subdir, or null if not found. */
export function getAttachmentPath(baseDir: string, entityId: string, filename: string): string | null {
  const safeEntityId = sanitizeEntityId(entityId);
  if (!safeEntityId) return null;
  const filePath = path.join(baseDir, safeEntityId, 'attachments', sanitizeFilename(filename));
  return fs.existsSync(filePath) ? filePath : null;
}
