import { cosineSimilarity } from '@/lib/embedder';
import type { DocGraph, NodeAttributes } from '@/graphs/docs';
import type { CodeGraph, CodeNodeAttributes } from '@/graphs/code-types';
import { FILE_SEARCH_TOP_K, SEARCH_MIN_SCORE_FILES, RRF_K } from '@/lib/defaults';
import { rrfFuse, type BM25Index } from '@/lib/search/bm25';

// ---------------------------------------------------------------------------
// Docs: semantic file search over root chunks (level=1)
// ---------------------------------------------------------------------------

export interface DocFileSearchResult {
  fileId: string;
  title: string;
  chunks: number;
  score: number;
}

export function searchDocFiles(
  graph: DocGraph,
  queryEmbedding: number[],
  options: { topK?: number; minScore?: number; queryText?: string; bm25Index?: BM25Index<any> } = {},
): DocFileSearchResult[] {
  const { topK = FILE_SEARCH_TOP_K, minScore = SEARCH_MIN_SCORE_FILES, queryText, bm25Index } = options;

  // Vector scoring: root chunks (level=1) with fileEmbedding
  const vectorScores = new Map<string, number>();
  const titleMap = new Map<string, string>();
  if (queryEmbedding.length > 0) {
    graph.forEachNode((_, attrs: NodeAttributes) => {
      if (attrs.level !== 1 || attrs.fileEmbedding.length === 0) return;
      vectorScores.set(attrs.fileId, cosineSimilarity(queryEmbedding, attrs.fileEmbedding));
      titleMap.set(attrs.fileId, attrs.title);
    });
  }

  // BM25 scoring
  const bm25Scores = queryText && bm25Index ? bm25Index.score(queryText) : new Map<string, number>();
  // Collect titles from BM25 hits not already in titleMap
  for (const fileId of bm25Scores.keys()) {
    if (!titleMap.has(fileId)) {
      graph.forEachNode((_, attrs: NodeAttributes) => {
        if (attrs.fileId === fileId && attrs.level === 1) titleMap.set(fileId, attrs.title);
      });
    }
  }

  // Fuse or use single source
  let scored: Array<{ fileId: string; score: number }>;
  if (vectorScores.size > 0 && bm25Scores.size > 0) {
    const fused = rrfFuse(vectorScores, bm25Scores, RRF_K);
    scored = [...fused.entries()].map(([fileId, score]) => ({ fileId, score }));
    // Normalize fused scores to 0–1
    const maxScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
    if (maxScore > 0) for (const s of scored) s.score /= maxScore;
  } else if (bm25Scores.size > 0) {
    scored = [...bm25Scores.entries()].map(([fileId, score]) => ({ fileId, score }));
    const maxScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
    if (maxScore > 0) for (const s of scored) s.score /= maxScore;
  } else {
    scored = [...vectorScores.entries()].map(([fileId, score]) => ({ fileId, score }));
  }

  // Count chunks per file
  const chunkCounts = new Map<string, number>();
  graph.forEachNode((_, attrs: NodeAttributes) => {
    chunkCounts.set(attrs.fileId, (chunkCounts.get(attrs.fileId) ?? 0) + 1);
  });

  return scored
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => ({
      fileId: s.fileId,
      title: titleMap.get(s.fileId) ?? '',
      chunks: chunkCounts.get(s.fileId) ?? 0,
      score: s.score,
    }));
}

// ---------------------------------------------------------------------------
// Code: semantic file search over file nodes (kind='file')
// ---------------------------------------------------------------------------

export interface CodeFileSearchResult {
  fileId: string;
  symbolCount: number;
  score: number;
}

export function searchCodeFiles(
  graph: CodeGraph,
  queryEmbedding: number[],
  options: { topK?: number; minScore?: number; queryText?: string; bm25Index?: BM25Index<any> } = {},
): CodeFileSearchResult[] {
  const { topK = FILE_SEARCH_TOP_K, minScore = SEARCH_MIN_SCORE_FILES, queryText, bm25Index } = options;

  // Vector scoring: file nodes with fileEmbedding
  const vectorScores = new Map<string, number>();
  if (queryEmbedding.length > 0) {
    graph.forEachNode((_, attrs: CodeNodeAttributes) => {
      if (attrs.kind !== 'file' || attrs.fileEmbedding.length === 0) return;
      vectorScores.set(attrs.fileId, cosineSimilarity(queryEmbedding, attrs.fileEmbedding));
    });
  }

  // BM25 scoring
  const bm25Scores = queryText && bm25Index ? bm25Index.score(queryText) : new Map<string, number>();

  // Fuse or use single source
  let scored: Array<{ fileId: string; score: number }>;
  if (vectorScores.size > 0 && bm25Scores.size > 0) {
    const fused = rrfFuse(vectorScores, bm25Scores, RRF_K);
    scored = [...fused.entries()].map(([fileId, score]) => ({ fileId, score }));
    const maxScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
    if (maxScore > 0) for (const s of scored) s.score /= maxScore;
  } else if (bm25Scores.size > 0) {
    scored = [...bm25Scores.entries()].map(([fileId, score]) => ({ fileId, score }));
    const maxScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
    if (maxScore > 0) for (const s of scored) s.score /= maxScore;
  } else {
    scored = [...vectorScores.entries()].map(([fileId, score]) => ({ fileId, score }));
  }

  // Count symbols per file
  const symbolCounts = new Map<string, number>();
  graph.forEachNode((_, attrs: CodeNodeAttributes) => {
    symbolCounts.set(attrs.fileId, (symbolCounts.get(attrs.fileId) ?? 0) + 1);
  });

  return scored
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => ({
      fileId: s.fileId,
      symbolCount: symbolCounts.get(s.fileId) ?? 0,
      score: s.score,
    }));
}
