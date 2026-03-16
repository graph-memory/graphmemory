import { createGraph, updateFile } from '@/graphs/docs';
import { search } from '@/lib/search/docs';
import type { Chunk } from '@/lib/parsers/docs';

const DIM = 8;

function unitVec(dim: number, axis: number): number[] {
  const v = new Array<number>(dim).fill(0);
  v[axis] = 1;
  return v;
}

function chunk(id: string, fileId: string, title: string, axis: number, level = 1, links: string[] = []): Chunk {
  return { id, fileId, title, content: `content of ${title}`, level, links, embedding: unitVec(DIM, axis), symbols: [] };
}

// Graph layout:
//   file A: a-root (axis 0) -> a-sec (axis 1)    (sibling edge)
//   file B: b-root (axis 2)
//   file C: c-root (axis 7)
//   A -> B link edge (a-root links to b-root)
//
// Query along axis 0: should find a-root (score 1.0), then via BFS a-sec and b-root

describe('docs search', () => {
  const graph = createGraph();

  beforeAll(() => {
    // b must be indexed before a, because a-root links to b
    updateFile(graph, [chunk('b', 'b', 'B Root', 2, 1)], 1000);
    updateFile(graph, [chunk('c', 'c', 'C Root', 7, 1)], 1000);
    updateFile(graph, [
      chunk('a-root', 'a', 'A Root', 0, 1, ['b']),
      chunk('a-sec',  'a', 'A Section', 1, 2),
    ], 1000);
  });

  const q0 = unitVec(DIM, 0); // closest to a-root

  it('top result is a-root (score 1.0)', () => {
    const r0 = search(graph, q0);
    expect(r0[0]?.id).toBe('a-root');
    expect(r0[0]?.score).toBe(1);
  });

  it('BFS includes a-sec (sibling)', () => {
    const r0 = search(graph, q0);
    const ids = r0.map(r => r.id);
    expect(ids).toContain('a-sec');
  });

  it('BFS includes b (link target)', () => {
    const r0 = search(graph, q0);
    const ids = r0.map(r => r.id);
    expect(ids).toContain('b');
  });

  it('c excluded (not reachable from a-root in 1 hop)', () => {
    const r0narrow = search(graph, q0, { topK: 1, bfsDepth: 1 });
    const ids = r0narrow.map(r => r.id);
    expect(ids).not.toContain('c');
  });

  it('maxResults=2 returns at most 2 results', () => {
    const rMax = search(graph, q0, { topK: 5, bfsDepth: 2, maxResults: 2 });
    expect(rMax.length).toBeLessThanOrEqual(2);
  });

  it('empty graph returns empty results', () => {
    const emptyGraph = createGraph();
    const rEmpty = search(emptyGraph, q0);
    expect(rEmpty).toHaveLength(0);
  });

  it('results are sorted by score descending', () => {
    const r0 = search(graph, q0);
    const sorted = r0.every((r, i) => i === 0 || r.score <= r0[i - 1].score);
    expect(sorted).toBe(true);
  });
});
