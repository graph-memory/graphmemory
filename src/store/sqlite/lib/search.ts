import Database from 'better-sqlite3';
import type { SearchQuery, SearchResult } from '../../types';
import { num } from './bigint';

const RRF_K = 60;

/** Validate SQL identifier (table/column name) — alphanumeric + underscore only */
function assertIdentifier(name: string, label: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

/**
 * Escape user text for FTS5 MATCH — wrap each token in double quotes.
 * Preserves FTS5 operators (AND, OR, NOT, NEAR) when used explicitly.
 * Returns empty string if no valid tokens remain.
 */
function ftsEscape(text: string): string {
  const FTS5_OPS = new Set(['AND', 'OR', 'NOT', 'NEAR']);
  const tokens = text
    .split(/\s+/)
    .filter(t => t.length > 0);
  const escaped = tokens
    .map(t => FTS5_OPS.has(t) ? t : `"${t.replace(/"/g, '""')}"`)
    .join(' ');
  // If all tokens were FTS5 operators, result is unusable — return empty
  if (tokens.length > 0 && tokens.every(t => FTS5_OPS.has(t))) return '';
  return escaped;
}

/**
 * Configuration for hybrid search on a specific entity table.
 * Each store provides its own config pointing to its FTS5 and vec0 tables.
 */
export interface SearchConfig {
  /** FTS5 virtual table name (e.g. 'notes_fts') */
  ftsTable: string;
  /** vec0 virtual table name (e.g. 'notes_vec') */
  vecTable: string;
  /** Parent table name (e.g. 'notes') for project_id filtering */
  parentTable: string;
  /** Column to join parent table to FTS rowid (usually 'id') */
  parentIdColumn: string;
  /** Optional extra SQL appended to the JOIN condition on parent table (e.g. "AND p.kind = 'file'") */
  extraJoinCondition?: string;
}

/**
 * Perform hybrid search combining FTS5 keyword search and vec0 vector search.
 *
 * - mode 'keyword': FTS5 only, embedding ignored
 * - mode 'vector': vec0 only, text ignored
 * - mode 'hybrid' (default): both, fused via Reciprocal Rank Fusion (RRF)
 *
 * vec0 cannot filter by project_id directly, so we overfetch and post-filter via JOIN.
 */
export function hybridSearch(
  db: Database.Database,
  config: SearchConfig,
  query: SearchQuery,
  projectId: number,
): SearchResult[] {
  const mode = query.searchMode ?? 'hybrid';
  const topK = query.topK ?? 50;
  const maxResults = query.maxResults ?? 20;
  const minScore = query.minScore ?? 0;

  let ftsRanked: Array<{ id: number; rn: number }> = [];
  let vecRanked: Array<{ id: number; rn: number }> = [];

  // Validate config identifiers to prevent SQL injection
  assertIdentifier(config.ftsTable, 'ftsTable');
  assertIdentifier(config.vecTable, 'vecTable');
  assertIdentifier(config.parentTable, 'parentTable');
  assertIdentifier(config.parentIdColumn, 'parentIdColumn');

  const extraJoin = config.extraJoinCondition ?? '';

  // FTS5 keyword search
  if (mode !== 'vector' && query.text) {
    const escaped = ftsEscape(query.text);
    if (!escaped) return [];
    const rows = db.prepare(`
      SELECT p.${config.parentIdColumn} AS id, ROW_NUMBER() OVER (ORDER BY rank) AS rn
      FROM ${config.ftsTable} fts
      JOIN ${config.parentTable} p ON p.${config.parentIdColumn} = fts.rowid AND p.project_id = ? ${extraJoin}
      WHERE ${config.ftsTable} MATCH ?
      LIMIT ?
    `).all(projectId, escaped, topK) as Array<{ id: bigint; rn: bigint }>;

    ftsRanked = rows.map(r => ({ id: num(r.id), rn: num(r.rn) }));
  }

  // vec0 vector search
  if (mode !== 'keyword' && query.embedding && query.embedding.length > 0) {
    const embeddingBuf = Buffer.from(new Float32Array(query.embedding).buffer);
    // Overfetch x3 to compensate for cross-project rows filtered out by JOIN
    const vecK = topK * 3;

    const rows = db.prepare(`
      SELECT v.rowid AS id, v.distance, ROW_NUMBER() OVER (ORDER BY v.distance) AS rn
      FROM ${config.vecTable} v
      JOIN ${config.parentTable} p ON p.${config.parentIdColumn} = v.rowid AND p.project_id = ? ${extraJoin}
      WHERE v.embedding MATCH ? AND v.k = ?
    `).all(projectId, embeddingBuf, vecK) as Array<{ id: bigint; distance: number; rn: bigint }>;

    vecRanked = rows.slice(0, topK).map((r, i) => ({ id: num(r.id), rn: i + 1 }));
  }

  // Single-mode: return directly with normalized scores
  if (mode === 'keyword') {
    return ftsRanked
      .map(r => ({ id: r.id, score: 1 / (RRF_K + r.rn) }))
      .filter(r => r.score >= minScore)
      .slice(0, maxResults);
  }

  if (mode === 'vector') {
    return vecRanked
      .map(r => ({ id: r.id, score: 1 / (RRF_K + r.rn) }))
      .filter(r => r.score >= minScore)
      .slice(0, maxResults);
  }

  // Hybrid: RRF fusion
  const scores = new Map<number, number>();
  for (const r of ftsRanked) {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (RRF_K + r.rn));
  }
  for (const r of vecRanked) {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (RRF_K + r.rn));
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
