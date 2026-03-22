import { cosineSimilarity } from '@/lib/embedder';
import type { FileIndexGraph, FileIndexNodeAttributes } from '@/graphs/file-index-types';
import { FILE_SEARCH_TOP_K, SEARCH_MIN_SCORE_FILES } from '@/lib/defaults';

export interface FileIndexSearchResult {
  filePath: string;
  fileName: string;
  extension: string;
  language: string | null;
  size: number;
  score: number;
}

/**
 * Semantic search over file nodes by path embedding.
 * Only searches file nodes (directories have empty embeddings).
 * Pure cosine similarity, no BFS expansion.
 */
export function searchFileIndex(
  graph: FileIndexGraph,
  queryEmbedding: number[],
  options: { topK?: number; minScore?: number } = {},
): FileIndexSearchResult[] {
  const { topK = FILE_SEARCH_TOP_K, minScore = SEARCH_MIN_SCORE_FILES } = options;

  const scored: FileIndexSearchResult[] = [];
  graph.forEachNode((_, attrs: FileIndexNodeAttributes) => {
    if (attrs.kind !== 'file' || attrs.embedding.length === 0) return;
    const score = cosineSimilarity(queryEmbedding, attrs.embedding);
    if (score >= minScore) {
      scored.push({
        filePath: attrs.filePath,
        fileName: attrs.fileName,
        extension: attrs.extension,
        language: attrs.language,
        size: attrs.size,
        score,
      });
    }
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
