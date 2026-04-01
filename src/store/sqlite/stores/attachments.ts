import Database from 'better-sqlite3';
import type {
  AttachmentsStore,
  AttachmentMeta,
  GraphName,
} from '../../types';
import { num, now } from '../lib/bigint';

export class SqliteAttachmentsStore implements AttachmentsStore {
  private stmts: ReturnType<SqliteAttachmentsStore['prepareStatements']>;

  constructor(private db: Database.Database, private projectId: number) {
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      insert: this.db.prepare(`
        INSERT INTO attachments (project_id, graph, entity_id, filename, mime_type, size, url, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      delete: this.db.prepare(
        'DELETE FROM attachments WHERE project_id = ? AND graph = ? AND entity_id = ? AND filename = ?'
      ),
      deleteAll: this.db.prepare(
        'DELETE FROM attachments WHERE project_id = ? AND graph = ? AND entity_id = ?'
      ),
      list: this.db.prepare(
        'SELECT filename, mime_type, size, url, added_at FROM attachments WHERE project_id = ? AND graph = ? AND entity_id = ? ORDER BY added_at'
      ),
    };
  }

  private toMeta(row: Record<string, unknown>): AttachmentMeta {
    return {
      filename: row.filename as string,
      mimeType: row.mime_type as string,
      size: num(row.size as bigint),
      url: (row.url as string) ?? undefined,
      addedAt: num(row.added_at as bigint),
    };
  }

  add(graph: GraphName, entityId: number, meta: AttachmentMeta): void {
    this.stmts.insert.run(
      this.projectId, graph, entityId,
      meta.filename, meta.mimeType, meta.size, meta.url ?? null, meta.addedAt ?? now(),
    );
  }

  remove(graph: GraphName, entityId: number, filename: string): void {
    this.stmts.delete.run(this.projectId, graph, entityId, filename);
  }

  removeAll(graph: GraphName, entityId: number): void {
    this.stmts.deleteAll.run(this.projectId, graph, entityId);
  }

  list(graph: GraphName, entityId: number): AttachmentMeta[] {
    const rows = this.stmts.list.all(this.projectId, graph, entityId) as Array<Record<string, unknown>>;
    return rows.map(r => this.toMeta(r));
  }
}
