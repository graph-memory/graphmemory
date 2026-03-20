import { cosineSimilarity } from '@/lib/embedder';
import type { CodeGraph, CodeNodeAttributes } from '@/graphs/code-types';
import { rrfFuse, type HybridOptions } from '@/lib/search/bm25';

export interface CodeSearchResult {
  id: string;
  fileId: string;
  kind: string;
  name: string;
  signature: string;
  docComment: string;
  body?: string;
  startLine: number;
  endLine: number;
  score: number;
}

/**
 * Semantic search over the code graph.
 *
 * 1. Score every node by cosine similarity to the query embedding.
 * 2. Filter seeds below `minScore`, take top `topK`.
 * 3. BFS expansion via graph edges up to `bfsDepth` hops with score decay.
 * 4. De-duplicate, re-filter, sort, cap at `maxResults`.
 */
export function searchCode(
  graph: CodeGraph,
  queryEmbedding: number[],
  options: {
    topK?: number;
    bfsDepth?: number;
    maxResults?: number;
    minScore?: number;
    bfsDecay?: number;
    includeBody?: boolean;
  } & HybridOptions = {},
): CodeSearchResult[] {
  const { topK = 5, bfsDepth = 1, maxResults = 20, minScore = 0.3, bfsDecay = 0.8,
    includeBody = false,
    queryText, bm25Index, searchMode = 'hybrid', rrfK = 60 } = options;

  const useVector = searchMode !== 'keyword';
  const useBm25 = searchMode !== 'vector' && !!queryText && !!bm25Index;

  // --- 1. Score all nodes ---
  const scored: Array<{ id: string; score: number }> = [];

  if (useVector) {
    graph.forEachNode((id, attrs: CodeNodeAttributes) => {
      if (attrs.embedding.length === 0) return;
      scored.push({ id, score: cosineSimilarity(queryEmbedding, attrs.embedding) });
    });
  }

  if (useBm25) {
    const bm25Scores = bm25Index!.score(queryText!);
    if (useVector && scored.length > 0) {
      // RRF fusion of vector and BM25 — include all vector results (not just positive)
      const vectorMap = new Map(scored.map(s => [s.id, s.score]));
      const fused = rrfFuse(vectorMap, bm25Scores, rrfK);
      scored.length = 0;
      for (const [id, score] of fused) scored.push({ id, score });
    } else {
      scored.length = 0;
      for (const [id, score] of bm25Scores) scored.push({ id, score });
    }
    // Normalize scores to 0–1 so minScore threshold works uniformly
    const maxScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
    if (maxScore > 0) {
      for (const s of scored) s.score /= maxScore;
    }
  }

  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);

  // --- 2. Filter seeds ---
  const minS = minScore;
  const seeds = scored.filter(s => s.score >= minS).slice(0, topK);
  if (seeds.length === 0) return [];

  // --- 3. BFS expansion ---
  const scoreMap = new Map<string, number>(seeds.map(s => [s.id, s.score]));

  function bfs(startId: string, seedScore: number): void {
    const queue: Array<{ id: string; depth: number; score: number }> = [
      { id: startId, depth: 0, score: seedScore },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (visited.has(item.id)) continue;
      visited.add(item.id);

      const prev = scoreMap.get(item.id) ?? -Infinity;
      if (item.score > prev) scoreMap.set(item.id, item.score);

      if (item.depth >= bfsDepth) continue;
      if (item.score * bfsDecay < minS) continue;

      const nextScore = item.score * bfsDecay;
      // Follow all outgoing edges (contains, imports, extends, implements)
      graph.outNeighbors(item.id).forEach(n => queue.push({ id: n, depth: item.depth + 1, score: nextScore }));
      // Follow incoming edges, but NOT reverse imports (avoids noise from popular utility files)
      graph.forEachInEdge(item.id, (_edge, attrs, source) => {
        if (attrs.kind !== 'imports') {
          queue.push({ id: source, depth: item.depth + 1, score: nextScore });
        }
      });
    }
  }

  for (const seed of seeds) {
    bfs(seed.id, seed.score);
  }

  // --- 4. Build results ---
  return [...scoreMap.entries()]
    .filter(([, score]) => score >= minS)
    .map(([id, score]) => {
      const attrs = graph.getNodeAttributes(id);
      const result: CodeSearchResult = {
        id,
        fileId: attrs.fileId,
        kind: attrs.kind,
        name: attrs.name,
        signature: attrs.signature,
        docComment: attrs.docComment,
        startLine: attrs.startLine,
        endLine: attrs.endLine,
        score,
      };
      if (includeBody) result.body = attrs.body;
      return result;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
