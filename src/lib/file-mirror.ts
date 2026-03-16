import * as fs from 'fs';
import * as path from 'path';
import { serializeMarkdown } from './frontmatter';
import type { KnowledgeNodeAttributes } from '../graphs/knowledge-types';
import type { TaskNodeAttributes } from '../graphs/task-types';
import type { SkillNodeAttributes } from '../graphs/skill-types';

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

function buildOutgoingRelations(noteId: string, relations: RelationLike[]): RelationFrontmatter[] {
  return relations
    .filter(r => r.fromId === noteId)
    .map(r => {
      const entry: RelationFrontmatter = { to: r.toId, kind: r.kind };
      if (r.targetGraph) entry.graph = r.targetGraph;
      return entry;
    });
}

export function writeNoteFile(
  notesDir: string,
  noteId: string,
  attrs: Pick<KnowledgeNodeAttributes, 'title' | 'content' | 'tags' | 'createdAt' | 'updatedAt'>,
  relations: RelationLike[],
): void {
  try {
    const outgoing = buildOutgoingRelations(noteId, relations);
    const fm: Record<string, unknown> = {
      id: noteId,
      tags: attrs.tags,
      createdAt: tsToIso(attrs.createdAt),
      updatedAt: tsToIso(attrs.updatedAt),
    };
    if (outgoing.length > 0) fm.relations = outgoing;

    const body = `# ${attrs.title}\n\n${attrs.content}`;
    const dir = path.join(notesDir, noteId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'note.md'), serializeMarkdown(fm, body));
  } catch (err) {
    process.stderr.write(`[file-mirror] failed to write note ${noteId}: ${err}\n`);
  }
}

export function writeTaskFile(
  tasksDir: string,
  taskId: string,
  attrs: Pick<TaskNodeAttributes, 'title' | 'description' | 'status' | 'priority' | 'tags' | 'dueDate' | 'estimate' | 'completedAt' | 'createdAt' | 'updatedAt'>,
  relations: RelationLike[],
): void {
  try {
    const outgoing = buildOutgoingRelations(taskId, relations);
    const fm: Record<string, unknown> = {
      id: taskId,
      status: attrs.status,
      priority: attrs.priority,
      tags: attrs.tags,
      dueDate: tsToIso(attrs.dueDate),
      estimate: attrs.estimate,
      completedAt: tsToIso(attrs.completedAt),
      createdAt: tsToIso(attrs.createdAt),
      updatedAt: tsToIso(attrs.updatedAt),
    };
    if (outgoing.length > 0) fm.relations = outgoing;

    const body = `# ${attrs.title}\n\n${attrs.description}`;
    const dir = path.join(tasksDir, taskId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'task.md'), serializeMarkdown(fm, body));
  } catch (err) {
    process.stderr.write(`[file-mirror] failed to write task ${taskId}: ${err}\n`);
  }
}

export function writeSkillFile(
  skillsDir: string,
  skillId: string,
  attrs: Pick<SkillNodeAttributes, 'title' | 'description' | 'steps' | 'triggers' | 'inputHints' | 'filePatterns' | 'tags' | 'source' | 'confidence' | 'createdAt' | 'updatedAt'>,
  relations: RelationLike[],
): void {
  try {
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
    };
    if (outgoing.length > 0) fm.relations = outgoing;

    const stepsBlock = attrs.steps.length > 0
      ? `\n\n## Steps\n${attrs.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : '';
    const body = `# ${attrs.title}\n\n${attrs.description}${stepsBlock}`;
    const dir = path.join(skillsDir, skillId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'skill.md'), serializeMarkdown(fm, body));
  } catch (err) {
    process.stderr.write(`[file-mirror] failed to write skill ${skillId}: ${err}\n`);
  }
}

/** Delete the entire mirror directory for a note or task (including attachments). */
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
// Attachment file helpers
// ---------------------------------------------------------------------------

/** Sanitize a filename: strip path separators, .., and null bytes. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/\0/g, '')
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .trim();
}

/** Write an attachment file to the entity directory. */
export function writeAttachment(baseDir: string, entityId: string, filename: string, data: Buffer): void {
  const dir = path.join(baseDir, entityId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, sanitizeFilename(filename)), data);
}

/** Delete an attachment file. Returns true if it existed. */
export function deleteAttachment(baseDir: string, entityId: string, filename: string): boolean {
  const filePath = path.join(baseDir, entityId, sanitizeFilename(filename));
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

/** Get the absolute path of an attachment, or null if it doesn't exist. */
export function getAttachmentPath(baseDir: string, entityId: string, filename: string): string | null {
  const filePath = path.join(baseDir, entityId, sanitizeFilename(filename));
  return fs.existsSync(filePath) ? filePath : null;
}
