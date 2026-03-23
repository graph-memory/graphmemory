import { cosineSimilarity } from '@/lib/embedder';
import type { FileIndexGraph, FileIndexNodeAttributes } from '@/graphs/file-index-types';
import { FILE_SEARCH_TOP_K, SEARCH_MIN_SCORE_FILES, RRF_K } from '@/lib/defaults';
import { rrfFuse, type BM25Index } from '@/lib/search/bm25';

export interface FileIndexSearchResult {
  filePath: string;
  fileName: string;
  extension: string;
  language: string | null;
  size: number;
  score: number;
}

/**
 * Hybrid search over file nodes by path embedding + BM25 keyword matching.
 * Only searches file nodes (directories have empty embeddings).
 * No BFS expansion.
 */
export function searchFileIndex(
  graph: FileIndexGraph,
  queryEmbedding: number[],
  options: { topK?: number; minScore?: number; queryText?: string; bm25Index?: BM25Index<any> } = {},
): FileIndexSearchResult[] {
  const { topK = FILE_SEARCH_TOP_K, minScore = SEARCH_MIN_SCORE_FILES, queryText, bm25Index } = options;

  // Vector scoring
  const vectorScores = new Map<string, number>();
  if (queryEmbedding.length > 0) {
    graph.forEachNode((id, attrs: FileIndexNodeAttributes) => {
      if (attrs.kind !== 'file' || attrs.embedding.length === 0) return;
      vectorScores.set(id, cosineSimilarity(queryEmbedding, attrs.embedding));
    });
  }

  // BM25 scoring
  const bm25Scores = queryText && bm25Index ? bm25Index.score(queryText) : new Map<string, number>();

  // Fuse or use single source
  let scored: Array<{ id: string; score: number }>;
  if (vectorScores.size > 0 && bm25Scores.size > 0) {
    const fused = rrfFuse(vectorScores, bm25Scores, RRF_K);
    scored = [...fused.entries()].map(([id, score]) => ({ id, score }));
    const maxScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
    if (maxScore > 0) for (const s of scored) s.score /= maxScore;
  } else if (bm25Scores.size > 0) {
    scored = [...bm25Scores.entries()].map(([id, score]) => ({ id, score }));
    const maxScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
    if (maxScore > 0) for (const s of scored) s.score /= maxScore;
  } else {
    scored = [...vectorScores.entries()].map(([id, score]) => ({ id, score }));
  }

  return scored
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => {
      const attrs = graph.getNodeAttributes(s.id);
      return {
        filePath: attrs.filePath,
        fileName: attrs.fileName,
        extension: attrs.extension,
        language: attrs.language,
        size: attrs.size,
        score: s.score,
      };
    });
}
