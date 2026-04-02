/**
 * Mirror import — rebuilds SQLite store from file mirror directories.
 *
 * Scans .notes/, .tasks/, .skills/ directories, replays events.jsonl for each
 * entity, and upserts into the store. Cross-graph relations are collected as
 * deferred edges and returned for resolution after indexing completes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseNoteDir, parseTaskDir, parseSkillDir } from '../../../lib/file-import';
import type { RelationFrontmatter } from '../../../lib/file-mirror';
import type { ProjectScopedStore, GraphName, NoteRecord, TaskRecord, SkillRecord } from '../../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('mirror-import');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An edge that cannot be resolved yet (target entity may not exist). */
export interface DeferredEdge {
  fromGraph: GraphName;
  fromId: number;
  toSlug: string;
  toGraph: GraphName;
  kind: string;
}

export interface MirrorImportResult {
  notes: number;
  tasks: number;
  skills: number;
  deferredEdges: DeferredEdge[];
}

export type EmbedFn = (text: string) => number[];

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

/**
 * Scan mirror directories and import all entities into the store.
 * Returns deferred edges that need resolution after full indexing.
 *
 * @param scoped - Project-scoped store (already opened)
 * @param projectDir - Root directory of the project (contains .notes/, .tasks/, .skills/)
 * @param embedFn - Synchronous embedding function (text → vector)
 */
export function importMirrorDirs(
  scoped: ProjectScopedStore,
  projectDir: string,
  embedFn: EmbedFn,
): MirrorImportResult {
  const deferredEdges: DeferredEdge[] = [];
  let notes = 0;
  let tasks = 0;
  let skills = 0;

  // --- Notes ---
  const notesDir = path.join(projectDir, '.notes');
  if (fs.existsSync(notesDir)) {
    const entries = readEntityDirs(notesDir);
    for (const entityDir of entries) {
      const parsed = parseNoteDir(entityDir);
      if (!parsed) continue;

      const embedding = embedFn(`${parsed.title} ${parsed.content}`);
      const record = scoped.knowledge.importRecord({
        slug: parsed.id,
        title: parsed.title,
        content: parsed.content,
        tags: parsed.tags,
        createdAt: parsed.createdAt ?? Date.now(),
        updatedAt: parsed.updatedAt ?? Date.now(),
        version: parsed.version ?? 1,
      }, embedding);

      collectDeferredEdges(deferredEdges, 'knowledge', record, parsed.relations);
      importAttachments(scoped, 'knowledge', record.id, parsed.attachments, entityDir);
      notes++;
    }
  }

  // --- Tasks ---
  const tasksDir = path.join(projectDir, '.tasks');
  if (fs.existsSync(tasksDir)) {
    const entries = readEntityDirs(tasksDir);
    for (const entityDir of entries) {
      const parsed = parseTaskDir(entityDir);
      if (!parsed) continue;

      const embedding = embedFn(`${parsed.title} ${parsed.description}`);
      const record = scoped.tasks.importRecord({
        slug: parsed.id,
        title: parsed.title,
        description: parsed.description,
        status: parsed.status,
        priority: parsed.priority,
        tags: parsed.tags,
        dueDate: parsed.dueDate,
        estimate: parsed.estimate,
        completedAt: parsed.completedAt,
        createdAt: parsed.createdAt ?? Date.now(),
        updatedAt: parsed.updatedAt ?? Date.now(),
        version: parsed.version ?? 1,
      }, embedding);

      collectDeferredEdges(deferredEdges, 'tasks', record, parsed.relations);
      importAttachments(scoped, 'tasks', record.id, parsed.attachments, entityDir);
      tasks++;
    }
  }

  // --- Skills ---
  const skillsDir = path.join(projectDir, '.skills');
  if (fs.existsSync(skillsDir)) {
    const entries = readEntityDirs(skillsDir);
    for (const entityDir of entries) {
      const parsed = parseSkillDir(entityDir);
      if (!parsed) continue;

      const embedding = embedFn(`${parsed.title} ${parsed.description}`);
      const record = scoped.skills.importRecord({
        slug: parsed.id,
        title: parsed.title,
        description: parsed.description,
        steps: parsed.steps,
        triggers: parsed.triggers,
        inputHints: parsed.inputHints,
        filePatterns: parsed.filePatterns,
        tags: parsed.tags,
        source: parsed.source,
        confidence: parsed.confidence,
        usageCount: parsed.usageCount ?? 0,
        lastUsedAt: parsed.lastUsedAt,
        createdAt: parsed.createdAt ?? Date.now(),
        updatedAt: parsed.updatedAt ?? Date.now(),
        version: parsed.version ?? 1,
      }, embedding);

      collectDeferredEdges(deferredEdges, 'skills', record, parsed.relations);
      importAttachments(scoped, 'skills', record.id, parsed.attachments, entityDir);
      skills++;
    }
  }

  if (notes > 0 || tasks > 0 || skills > 0) {
    log.info({ notes, tasks, skills, deferredEdges: deferredEdges.length }, 'Mirror import complete');
  }

  return { notes, tasks, skills, deferredEdges };
}

// ---------------------------------------------------------------------------
// Deferred edge resolution
// ---------------------------------------------------------------------------

/**
 * Resolve deferred edges after all indexing is complete.
 * For same-graph edges, looks up target by slug.
 * For cross-graph edges (docs, code, files), the caller must provide a resolver.
 */
export function resolveDeferredEdges(
  scoped: ProjectScopedStore,
  deferred: DeferredEdge[],
  resolveSlug?: (graph: GraphName, slug: string) => number | null,
): { resolved: number; failed: number } {
  let resolved = 0;
  let failed = 0;

  for (const edge of deferred) {
    let toId: number | null = null;

    // Try same-graph slug lookup first
    if (edge.toGraph === 'knowledge') {
      toId = scoped.knowledge.getBySlug(edge.toSlug)?.id ?? null;
    } else if (edge.toGraph === 'tasks') {
      toId = scoped.tasks.getBySlug(edge.toSlug)?.id ?? null;
    } else if (edge.toGraph === 'skills') {
      toId = scoped.skills.getBySlug(edge.toSlug)?.id ?? null;
    } else if (resolveSlug) {
      toId = resolveSlug(edge.toGraph, edge.toSlug);
    }

    if (toId != null) {
      try {
        scoped.createEdge({
          fromGraph: edge.fromGraph,
          fromId: edge.fromId,
          toGraph: edge.toGraph,
          toId,
          kind: edge.kind,
        });
        resolved++;
      } catch {
        failed++;
      }
    } else {
      log.warn({ edge }, 'Could not resolve deferred edge target');
      failed++;
    }
  }

  return { resolved, failed };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read entity subdirectories that contain events.jsonl. */
function readEntityDirs(baseDir: string): string[] {
  try {
    return fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => path.join(baseDir, e.name))
      .filter(d => fs.existsSync(path.join(d, 'events.jsonl')));
  } catch {
    return [];
  }
}

/**
 * Collect relations as deferred edges.
 * Same-graph relations (no `graph` field) target the same graph.
 * Cross-graph relations have a `graph` field indicating the target graph.
 */
function collectDeferredEdges(
  deferred: DeferredEdge[],
  fromGraph: GraphName,
  record: NoteRecord | TaskRecord | SkillRecord,
  relations: RelationFrontmatter[],
): void {
  for (const rel of relations) {
    const toGraph = (rel.graph ?? fromGraph) as GraphName;
    deferred.push({
      fromGraph,
      fromId: record.id,
      toSlug: rel.to,
      toGraph,
      kind: rel.kind,
    });
  }
}

/** Import attachment metadata into the store. */
function importAttachments(
  scoped: ProjectScopedStore,
  graph: GraphName,
  entityId: number,
  attachments: Array<{ filename: string; mimeType: string; size: number; addedAt?: number }>,
  _entityDir: string,
): void {
  for (const att of attachments) {
    try {
      scoped.attachments.add(graph, entityId, {
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        addedAt: att.addedAt ?? Date.now(),
      });
    } catch {
      // Duplicate attachment — skip (UNIQUE constraint)
    }
  }
}
