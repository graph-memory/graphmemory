import { cosineSimilarity } from '@/lib/embedder';
import type { DocGraph, NodeAttributes } from '@/graphs/docs';
import type { CodeGraph, CodeNodeAttributes } from '@/graphs/code-types';

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
  options: { topK?: number; minScore?: number } = {},
): DocFileSearchResult[] {
  const { topK = 10, minScore = 0.3 } = options;

  // Collect root chunks (level=1) that have a fileEmbedding
  const scored: Array<{ fileId: string; title: string; score: number }> = [];
  graph.forEachNode((_, attrs: NodeAttributes) => {
    if (attrs.level !== 1 || attrs.fileEmbedding.length === 0) return;
    scored.push({
      fileId: attrs.fileId,
      title: attrs.title,
      score: cosineSimilarity(queryEmbedding, attrs.fileEmbedding),
    });
  });

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
      title: s.title,
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
  options: { topK?: number; minScore?: number } = {},
): CodeFileSearchResult[] {
  const { topK = 10, minScore = 0.3 } = options;

  // Collect file nodes that have a fileEmbedding
  const scored: Array<{ fileId: string; score: number }> = [];
  graph.forEachNode((_, attrs: CodeNodeAttributes) => {
    if (attrs.kind !== 'file' || attrs.fileEmbedding.length === 0) return;
    scored.push({
      fileId: attrs.fileId,
      score: cosineSimilarity(queryEmbedding, attrs.fileEmbedding),
    });
  });

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
