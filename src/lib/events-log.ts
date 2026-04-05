import * as fs from 'fs';
import * as path from 'path';
import type { TaskStatus, TaskPriority } from '../store/types/tasks';
import type { SkillSource } from '../store/types/skills';
import type { AttachmentMeta } from '../graphs/attachment-types';
import type { EpicStatus } from '../store/types/epics';
import type { RelationFrontmatter } from './file-mirror';
import type { ParsedNoteFile, ParsedTaskFile, ParsedSkillFile, ParsedEpicFile } from './file-import';
import { createLogger } from '@/lib/logger';

const log = createLogger('events-log');

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface CreatedNoteEvent {
  ts: string;
  op: 'created';
  id: string;
  title: string;
  tags: string[];
  createdAt: number;
  createdBy?: string;
}

export interface CreatedTaskEvent {
  ts: string;
  op: 'created';
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate: number | null;
  estimate: number | null;
  completedAt: number | null;
  createdAt: number;
  createdBy?: string;
}

export interface CreatedSkillEvent {
  ts: string;
  op: 'created';
  id: string;
  title: string;
  tags: string[];
  steps: string[];
  triggers: string[];
  inputHints: string[];
  filePatterns: string[];
  source: SkillSource;
  confidence: number;
  usageCount: number;
  lastUsedAt: number | null;
  createdAt: number;
  createdBy?: string;
}

export interface CreatedEpicEvent {
  ts: string;
  op: 'created';
  id: string;
  title: string;
  status: EpicStatus;
  priority: TaskPriority;
  tags: string[];
  createdAt: number;
  createdBy?: string;
}

export interface UpdateEvent {
  ts: string;
  op: 'update';
  by?: string;
  [field: string]: unknown;
}

export interface RelationEvent {
  ts: string;
  op: 'relation';
  action: 'add' | 'remove';
  kind: string;
  to: string;
  graph?: string;
}

export interface AttachmentEvent {
  ts: string;
  op: 'attachment';
  action: 'add' | 'remove';
  file: string;
}

export type AnyEvent =
  | CreatedNoteEvent
  | CreatedTaskEvent
  | CreatedSkillEvent
  | CreatedEpicEvent
  | UpdateEvent
  | RelationEvent
  | AttachmentEvent;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/** Append a single event as a JSON line to the events.jsonl file. */
export function appendEvent(eventsPath: string, event: Omit<AnyEvent, 'ts'>): void {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(eventsPath, line, 'utf-8');
  } catch (err) {
    log.error({ err }, 'failed to append event');
  }
}

/** Read and parse all events from a JSONL file. Invalid lines are skipped. */
export function readEvents(eventsPath: string): AnyEvent[] {
  try {
    if (!fs.existsSync(eventsPath)) return [];
    const content = fs.readFileSync(eventsPath, 'utf-8');
    const events: AnyEvent[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as AnyEvent);
      } catch { /* skip invalid lines */ }
    }
    return events;
  } catch {
    return [];
  }
}

/** Sort events by timestamp (ISO strings are lexicographically sortable). */
function sortByTs(events: AnyEvent[]): AnyEvent[] {
  return [...events].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

function isoToMs(value: unknown): number | null {
  if (value == null) return null;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// ---------------------------------------------------------------------------
// Replay functions
// ---------------------------------------------------------------------------

/**
 * Replay note events + content to reconstruct a ParsedNoteFile.
 * Returns null if no 'created' event is found.
 */
export function replayNoteEvents(events: AnyEvent[], content: string): ParsedNoteFile | null {
  const sorted = sortByTs(events);
  const created = sorted.find(e => e.op === 'created') as CreatedNoteEvent | undefined;
  if (!created) return null;

  let title = created.title;
  let tags = created.tags ?? [];
  let updatedBy: string | null = null;
  const relations: RelationFrontmatter[] = [];
  const attachments: AttachmentMeta[] = [];

  for (const ev of sorted) {
    if (ev.op === 'update') {
      const u = ev as UpdateEvent;
      if (typeof u.title === 'string') title = u.title;
      if (Array.isArray(u.tags)) tags = u.tags as string[];
      if (typeof u.by === 'string') updatedBy = u.by;
    } else if (ev.op === 'relation') {
      const r = ev as RelationEvent;
      const key = `${r.to}:${r.kind}:${r.graph ?? ''}`;
      if (r.action === 'add') {
        if (!relations.some(x => `${x.to}:${x.kind}:${x.graph ?? ''}` === key)) {
          const entry: RelationFrontmatter = { to: r.to, kind: r.kind };
          if (r.graph) entry.graph = r.graph;
          relations.push(entry);
        }
      } else {
        const idx = relations.findIndex(x => `${x.to}:${x.kind}:${x.graph ?? ''}` === key);
        if (idx !== -1) relations.splice(idx, 1);
      }
    } else if (ev.op === 'attachment') {
      const a = ev as AttachmentEvent;
      if (a.action === 'add') {
        if (!attachments.some(x => x.filename === a.file)) {
          attachments.push({ filename: a.file, mimeType: 'application/octet-stream', size: 0, addedAt: 0 });
        }
      } else {
        const idx = attachments.findIndex(x => x.filename === a.file);
        if (idx !== -1) attachments.splice(idx, 1);
      }
    }
  }

  const version = sorted.length;
  // updatedAt = ts of last event; createdAt from created event
  const lastEvent = sorted[sorted.length - 1];
  const updatedAt = isoToMs(lastEvent?.ts);
  const createdAt = isoToMs(created.ts) ?? created.createdAt;

  return {
    id: created.id,
    title,
    content,
    tags,
    createdAt: created.createdAt ?? createdAt,
    updatedAt: updatedAt ?? created.createdAt,
    version,
    createdBy: created.createdBy ?? null,
    updatedBy,
    relations,
    attachments,
  };
}

/**
 * Replay task events + description to reconstruct a ParsedTaskFile.
 * Returns null if no 'created' event is found.
 */
export function replayTaskEvents(events: AnyEvent[], description: string): ParsedTaskFile | null {
  const sorted = sortByTs(events);
  const created = sorted.find(e => e.op === 'created') as CreatedTaskEvent | undefined;
  if (!created) return null;

  let title = created.title;
  let status = created.status;
  let priority = created.priority;
  let tags = created.tags ?? [];
  let dueDate = created.dueDate;
  let estimate = created.estimate;
  let completedAt = created.completedAt;
  let updatedBy: string | null = null;
  const relations: RelationFrontmatter[] = [];
  const attachments: AttachmentMeta[] = [];

  for (const ev of sorted) {
    if (ev.op === 'update') {
      const u = ev as UpdateEvent;
      if (typeof u.title === 'string') title = u.title;
      if (typeof u.status === 'string') status = u.status as TaskStatus;
      if (typeof u.priority === 'string') priority = u.priority as TaskPriority;
      if (Array.isArray(u.tags)) tags = u.tags as string[];
      if ('dueDate' in u) dueDate = (u.dueDate as number | null);
      if ('estimate' in u) estimate = (u.estimate as number | null);
      if ('completedAt' in u) completedAt = (u.completedAt as number | null);
      if (typeof u.by === 'string') updatedBy = u.by;
    } else if (ev.op === 'relation') {
      const r = ev as RelationEvent;
      const key = `${r.to}:${r.kind}:${r.graph ?? ''}`;
      if (r.action === 'add') {
        if (!relations.some(x => `${x.to}:${x.kind}:${x.graph ?? ''}` === key)) {
          const entry: RelationFrontmatter = { to: r.to, kind: r.kind };
          if (r.graph) entry.graph = r.graph;
          relations.push(entry);
        }
      } else {
        const idx = relations.findIndex(x => `${x.to}:${x.kind}:${x.graph ?? ''}` === key);
        if (idx !== -1) relations.splice(idx, 1);
      }
    } else if (ev.op === 'attachment') {
      const a = ev as AttachmentEvent;
      if (a.action === 'add') {
        if (!attachments.some(x => x.filename === a.file)) {
          attachments.push({ filename: a.file, mimeType: 'application/octet-stream', size: 0, addedAt: 0 });
        }
      } else {
        const idx = attachments.findIndex(x => x.filename === a.file);
        if (idx !== -1) attachments.splice(idx, 1);
      }
    }
  }

  const version = sorted.length;
  const lastEvent = sorted[sorted.length - 1];
  const updatedAt = isoToMs(lastEvent?.ts);

  return {
    id: created.id,
    title,
    description,
    status,
    priority,
    tags,
    dueDate,
    estimate,
    completedAt,
    assignee: null,
    createdAt: created.createdAt,
    updatedAt: updatedAt ?? created.createdAt,
    version,
    createdBy: created.createdBy ?? null,
    updatedBy,
    relations,
    attachments,
  };
}

/**
 * Replay skill events + description to reconstruct a ParsedSkillFile.
 * Returns null if no 'created' event is found.
 */
export function replaySkillEvents(events: AnyEvent[], description: string): ParsedSkillFile | null {
  const sorted = sortByTs(events);
  const created = sorted.find(e => e.op === 'created') as CreatedSkillEvent | undefined;
  if (!created) return null;

  let title = created.title;
  let tags = created.tags ?? [];
  let steps = created.steps ?? [];
  let triggers = created.triggers ?? [];
  let inputHints = created.inputHints ?? [];
  let filePatterns = created.filePatterns ?? [];
  let source = created.source;
  let confidence = created.confidence;
  let usageCount = created.usageCount;
  let lastUsedAt = created.lastUsedAt;
  let updatedBy: string | null = null;
  const relations: RelationFrontmatter[] = [];
  const attachments: AttachmentMeta[] = [];

  for (const ev of sorted) {
    if (ev.op === 'update') {
      const u = ev as UpdateEvent;
      if (typeof u.title === 'string') title = u.title;
      if (Array.isArray(u.tags)) tags = u.tags as string[];
      if (Array.isArray(u.steps)) steps = u.steps as string[];
      if (Array.isArray(u.triggers)) triggers = u.triggers as string[];
      if (Array.isArray(u.inputHints)) inputHints = u.inputHints as string[];
      if (Array.isArray(u.filePatterns)) filePatterns = u.filePatterns as string[];
      if (typeof u.source === 'string') source = u.source as SkillSource;
      if (typeof u.confidence === 'number') confidence = u.confidence;
      if (typeof u.usageCount === 'number') usageCount = u.usageCount;
      if ('lastUsedAt' in u) lastUsedAt = (u.lastUsedAt as number | null);
      if (typeof u.by === 'string') updatedBy = u.by;
    } else if (ev.op === 'relation') {
      const r = ev as RelationEvent;
      const key = `${r.to}:${r.kind}:${r.graph ?? ''}`;
      if (r.action === 'add') {
        if (!relations.some(x => `${x.to}:${x.kind}:${x.graph ?? ''}` === key)) {
          const entry: RelationFrontmatter = { to: r.to, kind: r.kind };
          if (r.graph) entry.graph = r.graph;
          relations.push(entry);
        }
      } else {
        const idx = relations.findIndex(x => `${x.to}:${x.kind}:${x.graph ?? ''}` === key);
        if (idx !== -1) relations.splice(idx, 1);
      }
    } else if (ev.op === 'attachment') {
      const a = ev as AttachmentEvent;
      if (a.action === 'add') {
        if (!attachments.some(x => x.filename === a.file)) {
          attachments.push({ filename: a.file, mimeType: 'application/octet-stream', size: 0, addedAt: 0 });
        }
      } else {
        const idx = attachments.findIndex(x => x.filename === a.file);
        if (idx !== -1) attachments.splice(idx, 1);
      }
    }
  }

  const version = sorted.length;
  const lastEvent = sorted[sorted.length - 1];
  const updatedAt = isoToMs(lastEvent?.ts);

  return {
    id: created.id,
    title,
    description,
    steps,
    triggers,
    inputHints,
    filePatterns,
    tags,
    source,
    confidence,
    usageCount,
    lastUsedAt,
    createdAt: created.createdAt,
    updatedAt: updatedAt ?? created.createdAt,
    version,
    createdBy: created.createdBy ?? null,
    updatedBy,
    relations,
    attachments,
  };
}

/**
 * Replay epic events + description to reconstruct a ParsedEpicFile.
 * Returns null if no 'created' event is found.
 */
export function replayEpicEvents(events: AnyEvent[], description: string): ParsedEpicFile | null {
  const sorted = sortByTs(events);
  const created = sorted.find(e => e.op === 'created') as CreatedEpicEvent | undefined;
  if (!created) return null;

  let title = created.title;
  let status = created.status;
  let priority = created.priority;
  let tags = created.tags ?? [];
  let updatedBy: string | null = null;
  const relations: RelationFrontmatter[] = [];
  const attachments: AttachmentMeta[] = [];

  for (const ev of sorted) {
    if (ev.op === 'update') {
      const u = ev as UpdateEvent;
      if (typeof u.title === 'string') title = u.title;
      if (typeof u.status === 'string') status = u.status as EpicStatus;
      if (typeof u.priority === 'string') priority = u.priority as TaskPriority;
      if (Array.isArray(u.tags)) tags = u.tags as string[];
      if (typeof u.by === 'string') updatedBy = u.by;
    } else if (ev.op === 'relation') {
      const r = ev as RelationEvent;
      const key = `${r.to}:${r.kind}:${r.graph ?? ''}`;
      if (r.action === 'add') {
        if (!relations.some(x => `${x.to}:${x.kind}:${x.graph ?? ''}` === key)) {
          const entry: RelationFrontmatter = { to: r.to, kind: r.kind };
          if (r.graph) entry.graph = r.graph;
          relations.push(entry);
        }
      } else {
        const idx = relations.findIndex(x => `${x.to}:${x.kind}:${x.graph ?? ''}` === key);
        if (idx !== -1) relations.splice(idx, 1);
      }
    } else if (ev.op === 'attachment') {
      const a = ev as AttachmentEvent;
      if (a.action === 'add') {
        if (!attachments.some(x => x.filename === a.file)) {
          attachments.push({ filename: a.file, mimeType: 'application/octet-stream', size: 0, addedAt: 0 });
        }
      } else {
        const idx = attachments.findIndex(x => x.filename === a.file);
        if (idx !== -1) attachments.splice(idx, 1);
      }
    }
  }

  const version = sorted.length;
  const lastEvent = sorted[sorted.length - 1];
  const updatedAt = isoToMs(lastEvent?.ts);

  return {
    id: created.id,
    title,
    description,
    status,
    priority,
    tags,
    createdAt: created.createdAt,
    updatedAt: updatedAt ?? created.createdAt,
    version,
    createdBy: created.createdBy ?? null,
    updatedBy,
    relations,
    attachments,
  };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

/** Ensure a .gitignore file in parentDir contains the given pattern line. */
export function ensureGitignore(parentDir: string, pattern: string): void {
  try {
    const gitignorePath = path.join(parentDir, '.gitignore');
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8');
    }
    if (!content.split('\n').some(l => l.trim() === pattern)) {
      fs.mkdirSync(parentDir, { recursive: true });
      fs.writeFileSync(gitignorePath, content + (content && !content.endsWith('\n') ? '\n' : '') + pattern + '\n', 'utf-8');
    }
  } catch (err) {
    log.error({ err }, 'failed to write .gitignore');
  }
}

/** Ensure a .gitattributes file in entityParentDir contains the merge=union line for events.jsonl. */
export function ensureGitattributes(entityParentDir: string): void {
  const pattern = '*/events.jsonl merge=union';
  try {
    const gitattrsPath = path.join(entityParentDir, '.gitattributes');
    let content = '';
    if (fs.existsSync(gitattrsPath)) {
      content = fs.readFileSync(gitattrsPath, 'utf-8');
    }
    if (!content.split('\n').some(l => l.trim() === pattern)) {
      fs.mkdirSync(entityParentDir, { recursive: true });
      fs.writeFileSync(gitattrsPath, content + (content && !content.endsWith('\n') ? '\n' : '') + pattern + '\n', 'utf-8');
    }
  } catch (err) {
    log.error({ err }, 'failed to write .gitattributes');
  }
}
