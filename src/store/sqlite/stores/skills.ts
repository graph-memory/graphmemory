import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  SkillsStore,
  SkillCreate,
  SkillPatch,
  SkillRecord,
  SkillDetail,
  SkillListOptions,
  AttachmentMeta,
  SearchQuery,
  SearchResult,
} from '../../types';
import { VersionConflictError } from '../../types';
import { MetaHelper } from '../lib/meta';
import { EntityHelpers } from '../lib/entity-helpers';
import { num, now, safeJson, likeEscape, assertEmbeddingDim } from '../lib/bigint';
import { hybridSearch, SearchConfig } from '../lib/search';

const GRAPH = 'skills';

const SEARCH_CONFIG: SearchConfig = {
  ftsTable: 'skills_fts', vecTable: 'skills_vec', parentTable: 'skills', parentIdColumn: 'id',
};

export class SqliteSkillsStore implements SkillsStore {
  private meta: MetaHelper;
  private helpers: EntityHelpers;

  constructor(private db: Database.Database, private projectId: number, private embeddingDim: number = 384) {
    this.meta = new MetaHelper(db, `${projectId}:${GRAPH}`);
    this.helpers = new EntityHelpers(db, projectId);
  }

  // =========================================================================
  // CRUD
  // =========================================================================

  private toRecord(row: Record<string, unknown>, tags?: string[], attachments?: AttachmentMeta[]): SkillRecord {
    const id = num(row.id as bigint);
    return {
      id,
      slug: row.slug as string,
      title: row.title as string,
      description: row.description as string,
      steps: safeJson<string[]>(row.steps_json as string, []),
      triggers: safeJson<string[]>(row.triggers_json as string, []),
      inputHints: safeJson<string[]>(row.input_hints_json as string, []),
      filePatterns: safeJson<string[]>(row.file_patterns_json as string, []),
      tags: tags ?? this.helpers.fetchTags(GRAPH, id),
      source: row.source as SkillRecord['source'],
      confidence: num(row.confidence as number),
      usageCount: num(row.usage_count as bigint),
      lastUsedAt: row.last_used_at ? num(row.last_used_at as bigint) : null,
      attachments: attachments ?? this.helpers.fetchAttachments(GRAPH, id),
      createdAt: num(row.created_at as bigint),
      updatedAt: num(row.updated_at as bigint),
      version: num(row.version as bigint),
      createdById: row.created_by_id ? num(row.created_by_id as bigint) : null,
      updatedById: row.updated_by_id ? num(row.updated_by_id as bigint) : null,
    };
  }

  private toDetail(row: Record<string, unknown>): SkillDetail {
    const record = this.toRecord(row);
    return { ...record, edges: this.helpers.fetchEdges(GRAPH, record.id) };
  }

  create(data: SkillCreate, embedding: number[]): SkillRecord {
    assertEmbeddingDim(embedding, this.embeddingDim);
    const slug = data.slug ?? randomUUID();
    const ts = now();
    const authorId = data.authorId ?? null;
    const version = data.version ?? 1;
    const createdAt = data.createdAt ?? ts;
    const updatedAt = data.updatedAt ?? ts;

    // Upsert when slug is provided and already exists
    if (data.slug) {
      const existing = this.db.prepare('SELECT * FROM skills WHERE slug = ? AND project_id = ?').get(slug, this.projectId) as Record<string, unknown> | undefined;
      if (existing) {
        const id = num(existing.id as bigint);
        this.db.prepare(`
          UPDATE skills SET title = ?, description = ?,
          steps_json = ?, triggers_json = ?, input_hints_json = ?, file_patterns_json = ?,
          source = ?, confidence = ?, usage_count = ?, last_used_at = ?,
          version = ?, updated_at = ?
          WHERE id = ? AND project_id = ?
        `).run(
          data.title, data.description ?? '',
          JSON.stringify(data.steps ?? []), JSON.stringify(data.triggers ?? []),
          JSON.stringify(data.inputHints ?? []), JSON.stringify(data.filePatterns ?? []),
          data.source ?? 'user', data.confidence ?? 1.0,
          data.usageCount ?? 0, data.lastUsedAt ?? null,
          version, updatedAt, id, this.projectId,
        );
        this.db.prepare('DELETE FROM skills_vec WHERE rowid = ?').run(BigInt(id));
        this.db.prepare('INSERT INTO skills_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(id), Buffer.from(new Float32Array(embedding).buffer));
        if (data.tags) this.helpers.setTags(GRAPH, id, data.tags);
        return this.toRecord(this.db.prepare('SELECT * FROM skills WHERE id = ? AND project_id = ?').get(id, this.projectId) as Record<string, unknown>);
      }
    }

    const result = this.db.prepare(`
      INSERT INTO skills (project_id, slug, title, description, steps_json, triggers_json, input_hints_json, file_patterns_json, source, confidence, usage_count, last_used_at, version, created_by_id, updated_by_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.projectId, slug, data.title, data.description ?? '',
      JSON.stringify(data.steps ?? []),
      JSON.stringify(data.triggers ?? []),
      JSON.stringify(data.inputHints ?? []),
      JSON.stringify(data.filePatterns ?? []),
      data.source ?? 'user', data.confidence ?? 1.0,
      data.usageCount ?? 0, data.lastUsedAt ?? null,
      version, authorId, authorId, createdAt, updatedAt,
    );
    const id = result.lastInsertRowid;

    this.db.prepare('INSERT INTO skills_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(id as number | bigint), Buffer.from(new Float32Array(embedding).buffer));

    if (data.tags && data.tags.length > 0) this.helpers.setTags(GRAPH, num(id), data.tags);

    return this.toRecord(this.db.prepare('SELECT * FROM skills WHERE id = ? AND project_id = ?').get(num(id), this.projectId) as Record<string, unknown>);
  }

  update(skillId: number, patch: SkillPatch, embedding: number[] | null, authorId?: number, expectedVersion?: number): SkillRecord {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ? AND project_id = ?').get(skillId, this.projectId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Skill ${skillId} not found`);

    if (expectedVersion !== undefined) {
      const current = num(row.version as bigint);
      if (current !== expectedVersion) throw new VersionConflictError(current, expectedVersion);
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { fields.push(`${col} = ?`); params.push(val); };

    if (patch.title !== undefined) set('title', patch.title);
    if (patch.description !== undefined) set('description', patch.description);
    if (patch.steps !== undefined) set('steps_json', JSON.stringify(patch.steps));
    if (patch.triggers !== undefined) set('triggers_json', JSON.stringify(patch.triggers));
    if (patch.inputHints !== undefined) set('input_hints_json', JSON.stringify(patch.inputHints));
    if (patch.filePatterns !== undefined) set('file_patterns_json', JSON.stringify(patch.filePatterns));
    if (patch.source !== undefined) set('source', patch.source);
    if (patch.confidence !== undefined) set('confidence', patch.confidence);

    set('version', num(row.version as bigint) + 1);
    set('updated_by_id', authorId ?? null);
    set('updated_at', now());

    params.push(skillId, this.projectId);
    this.db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`).run(...params);

    if (embedding) {
      assertEmbeddingDim(embedding, this.embeddingDim);
      this.db.prepare('DELETE FROM skills_vec WHERE rowid = ?').run(BigInt(skillId));
      this.db.prepare('INSERT INTO skills_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(skillId), Buffer.from(new Float32Array(embedding).buffer));
    }

    if (patch.tags !== undefined) this.helpers.setTags(GRAPH, skillId, patch.tags);

    return this.toRecord(this.db.prepare('SELECT * FROM skills WHERE id = ? AND project_id = ?').get(skillId, this.projectId) as Record<string, unknown>);
  }

  delete(skillId: number): void {
    this.db.prepare('DELETE FROM skills WHERE id = ? AND project_id = ?').run(skillId, this.projectId);
  }

  get(skillId: number): SkillDetail | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ? AND project_id = ?').get(skillId, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toDetail(row) : null;
  }

  getBySlug(slug: string): SkillDetail | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE slug = ? AND project_id = ?').get(slug, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toDetail(row) : null;
  }

  list(opts?: SkillListOptions): { results: SkillRecord[]; total: number } {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const conditions: string[] = ['s.project_id = ?'];
    const params: unknown[] = [this.projectId];

    if (opts?.source) { conditions.push('s.source = ?'); params.push(opts.source); }
    if (opts?.filter) { conditions.push("(s.title LIKE ? ESCAPE '\\' OR s.description LIKE ? ESCAPE '\\')"); const like = `%${likeEscape(opts.filter)}%`; params.push(like, like); }
    if (opts?.tag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM edges e JOIN tags t ON t.id = e.from_id AND t.project_id = e.project_id
        WHERE e.project_id = s.project_id AND e.to_graph = 'skills' AND e.to_id = s.id
        AND e.from_graph = 'tags' AND e.kind = 'tagged' AND t.name = ?
      )`);
      params.push(opts.tag);
    }

    const where = conditions.join(' AND ');
    const rows = this.db.prepare(`SELECT s.* FROM skills s WHERE ${where} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    const total = num((this.db.prepare(`SELECT COUNT(*) AS c FROM skills s WHERE ${where}`).get(...params) as { c: bigint }).c);

    const ids = rows.map(r => num(r.id as bigint));
    const tagsMap = this.helpers.fetchTagsBatch(GRAPH, ids);
    const attachMap = this.helpers.fetchAttachmentsBatch(GRAPH, ids);

    const results = rows.map(r => {
      const id = num(r.id as bigint);
      return this.toRecord(r, tagsMap.get(id), attachMap.get(id) ?? []);
    });

    return { results, total };
  }

  search(query: SearchQuery): SearchResult[] {
    return hybridSearch(this.db, SEARCH_CONFIG, query, this.projectId);
  }

  bumpUsage(skillId: number): void {
    const ts = now();
    this.db.prepare(`
      UPDATE skills SET usage_count = usage_count + 1, version = version + 1, last_used_at = ?, updated_at = ?
      WHERE id = ? AND project_id = ?
    `).run(ts, ts, skillId, this.projectId);
  }

  getUpdatedAt(skillId: number): number | null {
    const row = this.db.prepare('SELECT updated_at FROM skills WHERE id = ? AND project_id = ?').get(skillId, this.projectId) as { updated_at: bigint } | undefined;
    return row ? num(row.updated_at) : null;
  }

  getMeta(key: string): string | null { return this.meta.getMeta(key); }
  setMeta(key: string, value: string): void { this.meta.setMeta(key, value); }
  deleteMeta(key: string): void { this.meta.deleteMeta(key); }
}
