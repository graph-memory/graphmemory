import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { serializeMarkdown } from './frontmatter';
import type { KnowledgeNodeAttributes } from '../graphs/knowledge-types';
import type { TaskNodeAttributes } from '../graphs/task-types';
import type { SkillNodeAttributes } from '../graphs/skill-types';
import {
  appendEvent,
  ensureGitignore,
  ensureGitattributes,
  type CreatedNoteEvent,
  type CreatedTaskEvent,
  type CreatedSkillEvent,
} from './events-log';

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

type NoteAttrs = Pick<KnowledgeNodeAttributes, 'title' | 'content' | 'tags' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>;

/** Append a 'created' event + write content.md + regenerate note.md snapshot. */
export function mirrorNoteCreate(
  notesDir: string,
  noteId: string,
  attrs: NoteAttrs,
  relations: RelationLike[],
): void {
  try {
    const entityDir = path.join(notesDir, noteId);
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
    process.stderr.write(`[file-mirror] failed to mirror note create ${noteId}: ${err}\n`);
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
    const entityDir = path.join(notesDir, noteId);
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
    process.stderr.write(`[file-mirror] failed to mirror note update ${noteId}: ${err}\n`);
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

  const body = `# ${attrs.title}\n\n${attrs.content}`;
  const entityDir = path.join(notesDir, noteId);
  fs.mkdirSync(entityDir, { recursive: true });
  atomicWriteFileSync(path.join(entityDir, 'note.md'), serializeMarkdown(fm, body));
}

// ---------------------------------------------------------------------------
// Task mirror functions
// ---------------------------------------------------------------------------

type TaskAttrs = Pick<TaskNodeAttributes, 'title' | 'description' | 'status' | 'priority' | 'tags' | 'assignee' | 'dueDate' | 'estimate' | 'completedAt' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>;

/** Append a 'created' event + write description.md + regenerate task.md snapshot. */
export function mirrorTaskCreate(
  tasksDir: string,
  taskId: string,
  attrs: TaskAttrs,
  relations: RelationLike[],
): void {
  try {
    const entityDir = path.join(tasksDir, taskId);
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
    process.stderr.write(`[file-mirror] failed to mirror task create ${taskId}: ${err}\n`);
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
    const entityDir = path.join(tasksDir, taskId);
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
    process.stderr.write(`[file-mirror] failed to mirror task update ${taskId}: ${err}\n`);
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

  const body = `# ${attrs.title}\n\n${attrs.description}`;
  const entityDir = path.join(tasksDir, taskId);
  fs.mkdirSync(entityDir, { recursive: true });
  atomicWriteFileSync(path.join(entityDir, 'task.md'), serializeMarkdown(fm, body));
}

// ---------------------------------------------------------------------------
// Skill mirror functions
// ---------------------------------------------------------------------------

type SkillAttrs = Pick<SkillNodeAttributes, 'title' | 'description' | 'steps' | 'triggers' | 'inputHints' | 'filePatterns' | 'tags' | 'source' | 'confidence' | 'usageCount' | 'lastUsedAt' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>;

/** Append a 'created' event + write description.md + regenerate skill.md snapshot. */
export function mirrorSkillCreate(
  skillsDir: string,
  skillId: string,
  attrs: SkillAttrs,
  relations: RelationLike[],
): void {
  try {
    const entityDir = path.join(skillsDir, skillId);
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
    process.stderr.write(`[file-mirror] failed to mirror skill create ${skillId}: ${err}\n`);
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
    const entityDir = path.join(skillsDir, skillId);
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
    process.stderr.write(`[file-mirror] failed to mirror skill update ${skillId}: ${err}\n`);
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
  const body = `# ${attrs.title}\n\n${attrs.description}${stepsBlock}`;
  const entityDir = path.join(skillsDir, skillId);
  fs.mkdirSync(entityDir, { recursive: true });
  atomicWriteFileSync(path.join(entityDir, 'skill.md'), serializeMarkdown(fm, body));
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
): void {
  try {
    const entityDir = path.join(notesDir, noteId);
    const eventsPath = path.join(entityDir, 'events.jsonl');
    const event: Record<string, unknown> = { op: 'relation', action, kind, to };
    if (graph) event.graph = graph;
    appendEvent(eventsPath, event as Parameters<typeof appendEvent>[1]);
    _regenerateNoteSnapshot(notesDir, noteId, attrs, relations);
  } catch (err) {
    process.stderr.write(`[file-mirror] failed to mirror note relation ${noteId}: ${err}\n`);
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
): void {
  try {
    const entityDir = path.join(tasksDir, taskId);
    const eventsPath = path.join(entityDir, 'events.jsonl');
    const event: Record<string, unknown> = { op: 'relation', action, kind, to };
    if (graph) event.graph = graph;
    appendEvent(eventsPath, event as Parameters<typeof appendEvent>[1]);
    _regenerateTaskSnapshot(tasksDir, taskId, attrs, relations);
  } catch (err) {
    process.stderr.write(`[file-mirror] failed to mirror task relation ${taskId}: ${err}\n`);
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
): void {
  try {
    const entityDir = path.join(skillsDir, skillId);
    const eventsPath = path.join(entityDir, 'events.jsonl');
    const event: Record<string, unknown> = { op: 'relation', action, kind, to };
    if (graph) event.graph = graph;
    appendEvent(eventsPath, event as Parameters<typeof appendEvent>[1]);
    _regenerateSkillSnapshot(skillsDir, skillId, attrs, relations);
  } catch (err) {
    process.stderr.write(`[file-mirror] failed to mirror skill relation ${skillId}: ${err}\n`);
  }
}

/** Append an attachment add/remove event. */
export function mirrorAttachmentEvent(
  entityDir: string,
  action: 'add' | 'remove',
  file: string,
): void {
  try {
    const eventsPath = path.join(entityDir, 'events.jsonl');
    appendEvent(eventsPath, { op: 'attachment', action, file } as Parameters<typeof appendEvent>[1]);
  } catch (err) {
    process.stderr.write(`[file-mirror] failed to mirror attachment event: ${err}\n`);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Delete the entire mirror directory for a note, task or skill (including attachments). */
export function deleteMirrorDir(dir: string, id: string): void {
  try {
    fs.rmSync(path.join(dir, id), { recursive: true, force: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`[file-mirror] failed to delete ${id}/: ${err}\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Attachment file helpers (paths now go through attachments/ subdir)
// ---------------------------------------------------------------------------

/** Sanitize a filename: strip path separators, .., and null bytes. */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/\0/g, '')
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .trim();
  return sanitized; // empty string is a valid return — callers must check
}

/** Write an attachment file to the entity's attachments/ subdirectory. */
export function writeAttachment(baseDir: string, entityId: string, filename: string, data: Buffer): void {
  const safe = sanitizeFilename(filename);
  if (!safe) throw new Error('Attachment filename is empty after sanitization');
  const attachmentsDir = path.join(baseDir, entityId, 'attachments');
  fs.mkdirSync(attachmentsDir, { recursive: true });
  fs.writeFileSync(path.join(attachmentsDir, safe), data);
}

/** Delete an attachment file from attachments/ subdir. Returns true if it existed. */
export function deleteAttachment(baseDir: string, entityId: string, filename: string): boolean {
  const filePath = path.join(baseDir, entityId, 'attachments', sanitizeFilename(filename));
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`[file-mirror] failed to delete attachment ${filename}: ${err}\n`);
    }
    return false;
  }
}

/** Get the absolute path of an attachment in attachments/ subdir, or null if not found. */
export function getAttachmentPath(baseDir: string, entityId: string, filename: string): string | null {
  const filePath = path.join(baseDir, entityId, 'attachments', sanitizeFilename(filename));
  return fs.existsSync(filePath) ? filePath : null;
}
