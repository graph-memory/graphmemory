import Database from 'better-sqlite3';
import type { AttachmentMeta, Edge, GraphName } from '../../types';
import { num, chunk } from './bigint';

/**
 * Shared helpers for user-managed stores (knowledge, tasks, skills).
 * Handles tags, attachments, edges — avoids duplication across stores.
 */
export class EntityHelpers {
  constructor(private db: Database.Database, private projectId: number) {}

  // --- Tags ---

  setTags(graph: string, entityId: number, tags: string[]): void {
    // Collect old tag ids before deleting edges
    const oldTagIds = this.db.prepare(
      `SELECT from_id FROM edges WHERE to_graph = ? AND to_id = ? AND from_graph = 'tags' AND kind = 'tagged'`
    ).all(graph, entityId) as Array<{ from_id: bigint }>;

    this.db.prepare(`DELETE FROM edges WHERE to_graph = ? AND to_id = ? AND from_graph = 'tags' AND kind = 'tagged'`)
      .run(graph, entityId);

    // Clean up orphaned tags in one query
    if (oldTagIds.length > 0) {
      const ids = oldTagIds.map(o => num(o.from_id));
      const ph = ids.map(() => '?').join(',');
      this.db.prepare(`
        DELETE FROM tags WHERE project_id = ? AND id IN (${ph})
        AND NOT EXISTS (
          SELECT 1 FROM edges WHERE from_graph = 'tags' AND from_id = tags.id AND kind = 'tagged'
        )
      `).run(this.projectId, ...ids);
    }

    // Insert new tags — deduplicate, INSERT OR IGNORE + SELECT per tag
    const uniqueTags = [...new Set(tags)];
    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (project_id, name) VALUES (?, ?)');
    const selectTag = this.db.prepare('SELECT id FROM tags WHERE project_id = ? AND name = ?');
    const insertEdge = this.db.prepare(`INSERT OR IGNORE INTO edges (from_project_id, from_graph, from_id, to_project_id, to_graph, to_id, kind) VALUES (?, 'tags', ?, ?, ?, ?, 'tagged')`);
    for (const tag of uniqueTags) {
      insertTag.run(this.projectId, tag);
      const row = selectTag.get(this.projectId, tag) as { id: bigint } | undefined;
      if (!row) throw new Error(`Failed to resolve tag: ${tag}`);
      insertEdge.run(this.projectId, num(row.id), this.projectId, graph, entityId);
    }
  }

  fetchTags(graph: string, entityId: number): string[] {
    const rows = this.db.prepare(`
      SELECT t.name FROM tags t
      JOIN edges e ON e.from_graph = 'tags' AND e.from_id = t.id
      WHERE e.to_graph = ? AND e.to_id = ? AND e.kind = 'tagged'
      ORDER BY t.name
    `).all(graph, entityId) as Array<{ name: string }>;
    return rows.map(r => r.name);
  }

  /** Batch-fetch tags for multiple entities. Returns Map<entityId, string[]> */
  fetchTagsBatch(graph: string, entityIds: number[]): Map<number, string[]> {
    const result = new Map<number, string[]>();
    if (entityIds.length === 0) return result;
    for (const id of entityIds) result.set(id, []);

    for (const batch of chunk(entityIds)) {
      const ph = batch.map(() => '?').join(',');
      const rows = this.db.prepare(`
        SELECT e.to_id AS entity_id, t.name
        FROM edges e
        JOIN tags t ON t.id = e.from_id
        WHERE e.from_graph = 'tags' AND e.to_graph = ? AND e.kind = 'tagged'
        AND e.to_id IN (${ph})
        ORDER BY t.name
      `).all(graph, ...batch) as Array<{ entity_id: bigint; name: string }>;

      for (const r of rows) {
        const id = num(r.entity_id);
        const arr = result.get(id);
        if (arr) arr.push(r.name);
      }
    }
    return result;
  }

  // --- Attachments ---

  fetchAttachments(graph: string, entityId: number): AttachmentMeta[] {
    const rows = this.db.prepare(`
      SELECT filename, mime_type, size, url, added_at FROM attachments
      WHERE project_id = ? AND graph = ? AND entity_id = ? ORDER BY added_at
    `).all(this.projectId, graph, entityId) as Array<Record<string, unknown>>;
    return rows.map(r => this.toAttachmentMeta(r));
  }

  /** Batch-fetch attachments for multiple entities. Returns Map<entityId, AttachmentMeta[]> */
  fetchAttachmentsBatch(graph: string, entityIds: number[]): Map<number, AttachmentMeta[]> {
    const result = new Map<number, AttachmentMeta[]>();
    if (entityIds.length === 0) return result;
    for (const id of entityIds) result.set(id, []);

    for (const batch of chunk(entityIds)) {
      const ph = batch.map(() => '?').join(',');
      const rows = this.db.prepare(`
        SELECT entity_id, filename, mime_type, size, url, added_at FROM attachments
        WHERE project_id = ? AND graph = ? AND entity_id IN (${ph})
        ORDER BY added_at
      `).all(this.projectId, graph, ...batch) as Array<Record<string, unknown>>;

      for (const r of rows) {
        const id = num(r.entity_id as bigint);
        const arr = result.get(id);
        if (arr) arr.push(this.toAttachmentMeta(r));
      }
    }
    return result;
  }

  private toAttachmentMeta(r: Record<string, unknown>): AttachmentMeta {
    return {
      filename: r.filename as string,
      mimeType: r.mime_type as string,
      size: num(r.size as bigint),
      url: (r.url as string) ?? undefined,
      addedAt: num(r.added_at as bigint),
    };
  }

  // --- Edges ---

  fetchEdges(graph: string, entityId: number): Edge[] {
    const rows = this.db.prepare(`
      SELECT from_graph, from_id, to_graph, to_id, kind FROM edges
      WHERE (
        (from_graph = ? AND from_id = ?) OR (to_graph = ? AND to_id = ?)
      ) AND from_graph != 'tags'
    `).all(graph, entityId, graph, entityId) as Array<Record<string, unknown>>;
    return rows.map(r => ({
      fromGraph: r.from_graph as GraphName,
      fromId: num(r.from_id as bigint),
      toGraph: r.to_graph as GraphName,
      toId: num(r.to_id as bigint),
      kind: r.kind as string,
    }));
  }
}
