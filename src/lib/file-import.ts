import * as fs from 'fs';
import * as path from 'path';
import { parseMarkdown } from './frontmatter';
import type { RelationFrontmatter } from './file-mirror';
import type { TaskStatus, TaskPriority } from '../store/types/tasks';
import type { SkillSource } from '../store/types/skills';
import type { AttachmentMeta } from './attachment-types';
import type { EpicStatus } from '../store/types/epics';
import { scanAttachments } from './attachment-types';
import { readEvents, replayNoteEvents, replayTaskEvents, replaySkillEvents, replayEpicEvents } from './events-log';
import { createLogger } from '@/lib/logger';

const log = createLogger('file-import');

const VALID_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled'];
const VALID_EPIC_STATUSES: EpicStatus[] = ['open', 'in_progress', 'done', 'cancelled'];
const VALID_PRIORITIES: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
const VALID_SOURCES: SkillSource[] = ['user', 'learned'];

export interface ParsedNoteFile {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number | null;
  updatedAt: number | null;
  version: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  relations: RelationFrontmatter[];
  attachments: AttachmentMeta[];
}

export interface ParsedTaskFile {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate: number | null;
  estimate: number | null;
  completedAt: number | null;
  assignee: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  version: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  relations: RelationFrontmatter[];
  attachments: AttachmentMeta[];
}

function isoToMs(value: unknown): number | null {
  if (value == null) return null;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter(t => typeof t === 'string');
  return [];
}

function parseRelations(raw: unknown): RelationFrontmatter[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(r => r && typeof r === 'object' && typeof r.to === 'string' && typeof r.kind === 'string')
    .map(r => {
      const entry: RelationFrontmatter = { to: r.to, kind: r.kind };
      if (typeof r.graph === 'string') entry.graph = r.graph;
      return entry;
    });
}

function parseAuthorString(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

function extractTitleAndContent(body: string): { title: string; content: string } {
  const lines = body.split('\n');
  const headingMatch = lines[0]?.match(/^#\s+(.+)/);
  if (!headingMatch) return { title: '', content: body.trim() };

  const title = headingMatch[1].trim();
  // Skip heading line and the blank line after it
  let start = 1;
  if (lines[start] === '') start++;
  const content = lines.slice(start).join('\n').trim();
  return { title, content };
}

/**
 * Determine the entity ID from a file path.
 * New format: .notes/{id}/note.md or .tasks/{id}/task.md or .skills/{id}/skill.md → id from dirname
 * Legacy format: .notes/{id}.md or .tasks/{id}.md → id from basename
 */
function extractId(filePath: string): string {
  const basename = path.basename(filePath, '.md');
  let id: string;
  if (basename === 'note' || basename === 'task' || basename === 'skill') {
    id = path.basename(path.dirname(filePath));
  } else {
    id = basename;
  }
  if (id === '..' || id === '.' || id.includes('\0')) return '';
  return id;
}

export function parseNoteFile(filePath: string): ParsedNoteFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter: fm, body } = parseMarkdown(raw);
    const { title, content } = extractTitleAndContent(body);

    const id = extractId(filePath);
    if (!title && !id) return null;

    const attachments = scanAttachments(path.dirname(filePath));

    return {
      id,
      title: title || id,
      content,
      tags: parseTags(fm.tags),
      createdAt: isoToMs(fm.createdAt),
      updatedAt: isoToMs(fm.updatedAt),
      version: typeof fm.version === 'number' ? fm.version : null,
      createdBy: parseAuthorString(fm.createdBy),
      updatedBy: parseAuthorString(fm.updatedBy),
      relations: parseRelations(fm.relations),
      attachments,
    };
  } catch (err) {
    log.error({ err, filePath }, 'failed to parse note');
    return null;
  }
}

export function parseTaskFile(filePath: string): ParsedTaskFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter: fm, body } = parseMarkdown(raw);
    const { title, content: description } = extractTitleAndContent(body);

    const id = extractId(filePath);
    if (!title && !id) return null;

    const status = VALID_STATUSES.includes(fm.status as TaskStatus)
      ? (fm.status as TaskStatus) : 'backlog';
    const priority = VALID_PRIORITIES.includes(fm.priority as TaskPriority)
      ? (fm.priority as TaskPriority) : 'medium';

    const attachments = scanAttachments(path.dirname(filePath));

    return {
      id,
      title: title || id,
      description,
      status,
      priority,
      tags: parseTags(fm.tags),
      dueDate: isoToMs(fm.dueDate),
      estimate: typeof fm.estimate === 'number' ? fm.estimate : null,
      completedAt: isoToMs(fm.completedAt),
      assignee: typeof fm.assignee === 'string' ? fm.assignee : null,
      createdAt: isoToMs(fm.createdAt),
      updatedAt: isoToMs(fm.updatedAt),
      version: typeof fm.version === 'number' ? fm.version : null,
      createdBy: parseAuthorString(fm.createdBy),
      updatedBy: parseAuthorString(fm.updatedBy),
      relations: parseRelations(fm.relations),
      attachments,
    };
  } catch (err) {
    log.error({ err, filePath }, 'failed to parse task');
    return null;
  }
}

export interface ParsedSkillFile {
  id: string;
  title: string;
  description: string;
  steps: string[];
  triggers: string[];
  inputHints: string[];
  filePatterns: string[];
  tags: string[];
  source: SkillSource;
  confidence: number;
  usageCount: number | null;
  lastUsedAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  version: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  relations: RelationFrontmatter[];
  attachments: AttachmentMeta[];
}

function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter(t => typeof t === 'string');
  return [];
}

function extractDescriptionAndSteps(body: string): { title: string; description: string; steps: string[] } {
  const lines = body.split('\n');
  const headingMatch = lines[0]?.match(/^#\s+(.+)/);
  if (!headingMatch) return { title: '', description: body.trim(), steps: [] };

  const title = headingMatch[1].trim();
  let start = 1;
  if (lines[start] === '') start++;

  // Find ## Steps section
  const stepsIdx = lines.findIndex((l, i) => i >= start && /^##\s+Steps/i.test(l));

  if (stepsIdx === -1) {
    return { title, description: lines.slice(start).join('\n').trim(), steps: [] };
  }

  const description = lines.slice(start, stepsIdx).join('\n').trim();

  // Parse numbered list after ## Steps
  const steps: string[] = [];
  for (let i = stepsIdx + 1; i < lines.length; i++) {
    const stepMatch = lines[i].match(/^\d+\.\s+(.+)/);
    if (stepMatch) {
      steps.push(stepMatch[1].trim());
    } else if (lines[i].trim() === '') {
      continue;
    } else if (/^##\s+/.test(lines[i])) {
      break; // another heading section
    }
  }

  return { title, description, steps };
}

export function parseSkillFile(filePath: string): ParsedSkillFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter: fm, body } = parseMarkdown(raw);
    const { title, description, steps } = extractDescriptionAndSteps(body);

    const id = extractId(filePath);
    if (!title && !id) return null;

    const source = VALID_SOURCES.includes(fm.source as SkillSource)
      ? (fm.source as SkillSource) : 'user';
    const confidence = typeof fm.confidence === 'number' ? Math.max(0, Math.min(1, fm.confidence)) : 1;

    const attachments = scanAttachments(path.dirname(filePath));

    return {
      id,
      title: title || id,
      description,
      steps,
      triggers: parseStringArray(fm.triggers),
      inputHints: parseStringArray(fm.inputHints),
      filePatterns: parseStringArray(fm.filePatterns),
      tags: parseTags(fm.tags),
      source,
      confidence,
      usageCount: typeof fm.usageCount === 'number' ? fm.usageCount : null,
      lastUsedAt: isoToMs(fm.lastUsedAt),
      createdAt: isoToMs(fm.createdAt),
      updatedAt: isoToMs(fm.updatedAt),
      version: typeof fm.version === 'number' ? fm.version : null,
      createdBy: parseAuthorString(fm.createdBy),
      updatedBy: parseAuthorString(fm.updatedBy),
      relations: parseRelations(fm.relations),
      attachments,
    };
  } catch (err) {
    log.error({ err, filePath }, 'failed to parse skill');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Event-sourced directory parsers (new format)
// ---------------------------------------------------------------------------

/** Parse a note from its entity directory (events.jsonl + content.md). */
export function parseNoteDir(dirPath: string): ParsedNoteFile | null {
  try {
    const eventsPath = path.join(dirPath, 'events.jsonl');
    if (!fs.existsSync(eventsPath)) return null;
    const events = readEvents(eventsPath);
    const contentPath = path.join(dirPath, 'content.md');
    const content = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, 'utf-8') : '';
    const parsed = replayNoteEvents(events, content);
    if (!parsed) return null;
    // Refresh attachments from disk (overrides event-derived list with accurate metadata)
    parsed.attachments = scanAttachments(dirPath);
    return parsed;
  } catch (err) {
    log.error({ err, dirPath }, 'failed to parse note dir');
    return null;
  }
}

/** Parse a task from its entity directory (events.jsonl + description.md). */
export function parseTaskDir(dirPath: string): ParsedTaskFile | null {
  try {
    const eventsPath = path.join(dirPath, 'events.jsonl');
    if (!fs.existsSync(eventsPath)) return null;
    const events = readEvents(eventsPath);
    const descPath = path.join(dirPath, 'description.md');
    const description = fs.existsSync(descPath) ? fs.readFileSync(descPath, 'utf-8') : '';
    const parsed = replayTaskEvents(events, description);
    if (!parsed) return null;
    parsed.attachments = scanAttachments(dirPath);
    return parsed;
  } catch (err) {
    log.error({ err, dirPath }, 'failed to parse task dir');
    return null;
  }
}

/** Parse a skill from its entity directory (events.jsonl + description.md). */
export function parseSkillDir(dirPath: string): ParsedSkillFile | null {
  try {
    const eventsPath = path.join(dirPath, 'events.jsonl');
    if (!fs.existsSync(eventsPath)) return null;
    const events = readEvents(eventsPath);
    const descPath = path.join(dirPath, 'description.md');
    const description = fs.existsSync(descPath) ? fs.readFileSync(descPath, 'utf-8') : '';
    const parsed = replaySkillEvents(events, description);
    if (!parsed) return null;
    parsed.attachments = scanAttachments(dirPath);
    return parsed;
  } catch (err) {
    log.error({ err, dirPath }, 'failed to parse skill dir');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Epic types & parsers
// ---------------------------------------------------------------------------

export interface ParsedEpicFile {
  id: string;
  title: string;
  description: string;
  status: EpicStatus;
  priority: TaskPriority;
  tags: string[];
  createdAt: number | null;
  updatedAt: number | null;
  version: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  relations: RelationFrontmatter[];
  attachments: AttachmentMeta[];
}

/** Parse an epic from its entity directory (events.jsonl + description.md). */
export function parseEpicDir(dirPath: string): ParsedEpicFile | null {
  try {
    const eventsPath = path.join(dirPath, 'events.jsonl');
    if (!fs.existsSync(eventsPath)) return null;
    const events = readEvents(eventsPath);
    const descPath = path.join(dirPath, 'description.md');
    const description = fs.existsSync(descPath) ? fs.readFileSync(descPath, 'utf-8') : '';
    const parsed = replayEpicEvents(events, description);
    if (!parsed) return null;
    parsed.attachments = scanAttachments(dirPath);
    return parsed;
  } catch (err) {
    log.error({ err, dirPath }, 'failed to parse epic dir');
    return null;
  }
}

export function parseEpicFile(filePath: string): ParsedEpicFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter: fm, body } = parseMarkdown(raw);
    const { title, content: description } = extractTitleAndContent(body);

    const id = extractId(filePath);
    if (!title && !id) return null;

    const status = VALID_EPIC_STATUSES.includes(fm.status as EpicStatus)
      ? (fm.status as EpicStatus) : 'open';
    const priority = VALID_PRIORITIES.includes(fm.priority as TaskPriority)
      ? (fm.priority as TaskPriority) : 'medium';

    const attachments = scanAttachments(path.dirname(filePath));

    return {
      id,
      title: title || id,
      description,
      status,
      priority,
      tags: parseTags(fm.tags),
      createdAt: isoToMs(fm.createdAt),
      updatedAt: isoToMs(fm.updatedAt),
      version: typeof fm.version === 'number' ? fm.version : null,
      createdBy: parseAuthorString(fm.createdBy),
      updatedBy: parseAuthorString(fm.updatedBy),
      relations: parseRelations(fm.relations),
      attachments,
    };
  } catch (err) {
    log.error({ err, filePath }, 'failed to parse epic');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Relation diffing
// ---------------------------------------------------------------------------

export interface RelationDiff {
  toAdd: RelationFrontmatter[];
  toRemove: RelationFrontmatter[];
}

function relationKey(r: RelationFrontmatter): string {
  return `${r.to}:${r.kind}:${r.graph ?? ''}`;
}

export function diffRelations(
  current: RelationFrontmatter[],
  desired: RelationFrontmatter[],
): RelationDiff {
  const currentKeys = new Set(current.map(relationKey));
  const desiredKeys = new Set(desired.map(relationKey));
  const desiredMap = new Map(desired.map(r => [relationKey(r), r]));
  const currentMap = new Map(current.map(r => [relationKey(r), r]));

  const toAdd: RelationFrontmatter[] = [];
  const toRemove: RelationFrontmatter[] = [];

  for (const key of desiredKeys) {
    if (!currentKeys.has(key)) toAdd.push(desiredMap.get(key)!);
  }
  for (const key of currentKeys) {
    if (!desiredKeys.has(key)) toRemove.push(currentMap.get(key)!);
  }

  return { toAdd, toRemove };
}
