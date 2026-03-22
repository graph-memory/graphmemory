import type { DocGraph, NodeAttributes } from '@/graphs/docs';
import { cosineSimilarity } from '@/lib/embedder';
import { rrfFuse, type HybridOptions } from '@/lib/search/bm25';
import { SEARCH_TOP_K, SEARCH_BFS_DEPTH, SEARCH_MAX_RESULTS, SEARCH_MIN_SCORE, SEARCH_BFS_DECAY, RRF_K } from '@/lib/defaults';

export interface SearchResult {
  id: string;
  fileId: string;
  title: string;
  content: string;
  level: number;
  score: number;
}

/**
 * Semantic search over the graph.
 *
 * 1. Score every node by cosine similarity to the query embedding.
 * 2. Discard seeds below `minScore` (default 0 = keep all).
 * 3. Take the top `topK` remaining seeds.
 * 4. BFS from each seed up to `bfsDepth` hops; BFS nodes inherit the seed's
 *    score multiplied by `bfsDecay` per hop (default 0.8), so deeper nodes
 *    rank lower and are filtered by `minScore` too.
 * 5. De-duplicate and return results sorted by score, capped at `maxResults`.
 */
export function search(
  graph: DocGraph,
  queryEmbedding: number[],
  options: {
    topK?: number;       // initial seeds from similarity ranking
    bfsDepth?: number;   // BFS hops from each seed
    maxResults?: number; // final cap on returned results
    minScore?: number;   // discard nodes with score below this (0–1, default 0.5)
    bfsDecay?: number;   // score multiplier per BFS hop (0–1, default 0.8)
  } & HybridOptions = {},
): SearchResult[] {
  const { topK = SEARCH_TOP_K, bfsDepth = SEARCH_BFS_DEPTH, maxResults = SEARCH_MAX_RESULTS, minScore = SEARCH_MIN_SCORE, bfsDecay = SEARCH_BFS_DECAY,
    queryText, bm25Index, searchMode = 'hybrid', rrfK = RRF_K } = options;

  const useVector = searchMode !== 'keyword';
  const useBm25 = searchMode !== 'vector' && !!queryText && !!bm25Index;

  // --- 1. Score all nodes ---
  const scored: Array<{ id: string; score: number }> = [];

  if (useVector) {
    graph.forEachNode((id, attrs: NodeAttributes) => {
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
      // BM25-only or vector returned nothing — use BM25 as fallback
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

  // --- 2. Filter seeds by minScore, then take topK ---
  const minS = minScore;
  const seeds = scored.filter(s => s.score >= minS).slice(0, topK);
  if (seeds.length === 0) return [];

  // --- 3. BFS expansion with score decay ---
  // scoreMap holds the best score seen for each node
  const scoreMap = new Map<string, number>(seeds.map(s => [s.id, s.score]));

  function bfs(startId: string, seedScore: number): void {
    const queue: Array<{ id: string; depth: number; score: number }> = [
      { id: startId, depth: 0, score: seedScore },
    ];
    const localVisited = new Set<string>();

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (localVisited.has(item.id)) continue;
      localVisited.add(item.id);

      // Keep the best score this node has received across all BFS runs
      const prev = scoreMap.get(item.id) ?? -Infinity;
      if (item.score > prev) scoreMap.set(item.id, item.score);

      if (item.depth >= bfsDepth) continue;
      if (item.score * bfsDecay < minS) continue; // prune: deeper hops won't pass threshold

      const nextScore = item.score * bfsDecay;
      graph.outNeighbors(item.id).forEach(n => queue.push({ id: n, depth: item.depth + 1, score: nextScore }));
      graph.inNeighbors(item.id).forEach(n => queue.push({ id: n, depth: item.depth + 1, score: nextScore }));
    }
  }

  for (const seed of seeds) {
    bfs(seed.id, seed.score);
  }

  // --- 4. Build results from scoreMap, apply minScore filter, sort, cap ---
  return [...scoreMap.entries()]
    .filter(([, score]) => score >= minS)
    .map(([id, score]) => {
      const attrs = graph.getNodeAttributes(id);
      return {
        id,
        fileId: attrs.fileId,
        title: attrs.title,
        content: attrs.content,
        level: attrs.level,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
