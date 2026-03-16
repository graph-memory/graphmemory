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
  } & HybridOptions = {},
): CodeSearchResult[] {
  const { topK = 5, bfsDepth = 1, maxResults = 20, minScore = 0.5, bfsDecay = 0.8,
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
      const vectorMap = new Map(scored.map(s => [s.id, s.score]));
      const fused = rrfFuse(vectorMap, bm25Scores, rrfK);
      scored.length = 0;
      for (const [id, score] of fused) scored.push({ id, score });
    } else if (!useVector) {
      for (const [id, score] of bm25Scores) scored.push({ id, score });
    }
  }

  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);

  // --- 2. Filter seeds ---
  const minS = useBm25 && !useVector ? 0 : minScore;
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
      if (item.score * bfsDecay < minScore) continue;

      const nextScore = item.score * bfsDecay;
      graph.outNeighbors(item.id).forEach(n => queue.push({ id: n, depth: item.depth + 1, score: nextScore }));
      graph.inNeighbors(item.id).forEach(n => queue.push({ id: n, depth: item.depth + 1, score: nextScore }));
    }
  }

  for (const seed of seeds) {
    bfs(seed.id, seed.score);
  }

  // --- 4. Build results ---
  return [...scoreMap.entries()]
    .filter(([, score]) => score >= minScore)
    .map(([id, score]) => {
      const attrs = graph.getNodeAttributes(id);
      return {
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
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
