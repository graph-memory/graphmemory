import { cosineSimilarity } from '@/lib/embedder';
import type { CodeGraph, CodeNodeAttributes } from '@/graphs/code-types';
import { rrfFuse, type HybridOptions } from '@/lib/search/bm25';
import { SEARCH_TOP_K, SEARCH_BFS_DEPTH, SEARCH_MAX_RESULTS, SEARCH_MIN_SCORE_CODE, SEARCH_BFS_DECAY, RRF_K, CODE_EDGE_DECAY } from '@/lib/defaults';

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
  const { topK = SEARCH_TOP_K, bfsDepth = SEARCH_BFS_DEPTH, maxResults = SEARCH_MAX_RESULTS, minScore = SEARCH_MIN_SCORE_CODE, bfsDecay = SEARCH_BFS_DECAY,
    includeBody = false,
    queryText, bm25Index, searchMode = 'hybrid', rrfK = RRF_K } = options;

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
  const maxEdgeDecay = Math.max(...Object.values(CODE_EDGE_DECAY), bfsDecay);

  function bfs(startId: string, seedScore: number): void {
    const queue: Array<{ id: string; depth: number; score: number }> = [
      { id: startId, depth: 0, score: seedScore },
    ];
    const visited = new Set<string>();

    let head = 0;
    while (head < queue.length) {
      const item = queue[head++];
      if (visited.has(item.id)) continue;
      visited.add(item.id);

      const prev = scoreMap.get(item.id) ?? -Infinity;
      if (item.score > prev) scoreMap.set(item.id, item.score);

      if (item.depth >= bfsDepth) continue;
      if (item.score * maxEdgeDecay < minS) continue;

      // Follow all outgoing edges with edge-specific decay
      graph.forEachOutEdge(item.id, (_edge, edgeAttrs, _src, target) => {
        const decay = CODE_EDGE_DECAY[edgeAttrs.kind] ?? bfsDecay;
        queue.push({ id: target, depth: item.depth + 1, score: item.score * decay });
      });
      // Follow incoming edges, but NOT reverse imports (avoids noise from popular utility files)
      graph.forEachInEdge(item.id, (_edge, edgeAttrs, source) => {
        if (edgeAttrs.kind === 'imports') return;
        const decay = CODE_EDGE_DECAY[edgeAttrs.kind] ?? bfsDecay;
        queue.push({ id: source, depth: item.depth + 1, score: item.score * decay });
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
