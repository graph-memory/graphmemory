/**
 * BM25 keyword search index with incremental updates.
 * Used alongside vector cosine similarity for hybrid search.
 */

import { BM25_K1, BM25_B, BM25_IDF_OFFSET, RRF_K } from '@/lib/defaults';

export type SearchMode = 'hybrid' | 'vector' | 'keyword';

export interface HybridOptions {
  queryText?: string;
  bm25Index?: BM25Index<any>;
  searchMode?: SearchMode;
  rrfK?: number;
}

export interface BM25Options {
  k1?: number;  // term frequency saturation, default 1.2
  b?: number;   // length normalization, default 0.75
}

export type TextExtractor<A> = (attrs: A) => string;

interface DocEntry {
  termFreqs: Map<string, number>;
  length: number;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize text: split on whitespace/punctuation, split camelCase, lowercase.
 * "getUserById" → ["get", "user", "by", "id"]
 * "JWT tokens" → ["jwt", "tokens"]
 */
/**
 * Minimal stop words for code/doc search.
 * Only articles, conjunctions, prepositions, and pronouns — words that never
 * carry meaning in code search. Excludes programming-significant words like
 * `for`, `do`, `if`, `not`, `is`, `has`, `all`, `can`, `no`.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the',                                    // articles
  'and', 'or', 'but', 'nor',                           // conjunctions
  'of', 'with', 'by', 'from', 'as', 'at', 'on', 'in', 'to', 'into', 'onto',  // prepositions
  'it', 'its', 'he', 'she', 'we', 'they', 'i', 'me',  // pronouns
  'my', 'you', 'your', 'his', 'her', 'our', 'their',   // possessives
  'this', 'that', 'these', 'those',                     // demonstratives
  'been', 'being', 'were', 'was', 'are',                // be-forms (but not 'be', 'is')
  'would', 'could', 'should', 'shall', 'might',         // modals (but not 'can', 'may', 'will', 'do')
  'than', 'such', 'very', 'just', 'also', 'about',     // fillers
]);

export function tokenize(text: string): string[] {
  if (!text) return [];

  // Split camelCase/PascalCase boundaries, then split on non-letter/non-digit (Unicode-aware)
  const parts = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')     // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // XMLParser → XML Parser
    .split(/[^\p{L}\p{N}]+/u)
    .map(t => t.toLowerCase())
    .filter(t => t.length > 0 && !STOP_WORDS.has(t));

  return parts;
}

// ---------------------------------------------------------------------------
// BM25 Index
// ---------------------------------------------------------------------------

export class BM25Index<A = Record<string, unknown>> {
  private docs = new Map<string, DocEntry>();
  private df = new Map<string, number>();   // document frequency per term
  private totalLength = 0;
  private k1: number;
  private b: number;
  private textExtractor: TextExtractor<A>;

  constructor(textExtractor: TextExtractor<A>, opts?: BM25Options) {
    this.textExtractor = textExtractor;
    this.k1 = opts?.k1 ?? BM25_K1;
    this.b = opts?.b ?? BM25_B;
  }

  get size(): number {
    return this.docs.size;
  }

  hasDocument(id: string): boolean {
    return this.docs.has(id);
  }

  addDocument(id: string, attrs: A): void {
    // Remove old version first if exists
    if (this.docs.has(id)) this.removeDocument(id);

    const text = this.textExtractor(attrs);
    const tokens = tokenize(text);
    const termFreqs = new Map<string, number>();

    for (const token of tokens) {
      termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
    }

    // Update document frequency for each unique term
    for (const term of termFreqs.keys()) {
      this.df.set(term, (this.df.get(term) ?? 0) + 1);
    }

    this.docs.set(id, { termFreqs, length: tokens.length });
    this.totalLength += tokens.length;
  }

  removeDocument(id: string): void {
    const doc = this.docs.get(id);
    if (!doc) return;

    // Decrement document frequency for each unique term
    for (const term of doc.termFreqs.keys()) {
      const current = this.df.get(term) ?? 0;
      if (current <= 1) {
        this.df.delete(term);
      } else {
        this.df.set(term, current - 1);
      }
    }

    this.totalLength -= doc.length;
    this.docs.delete(id);
  }

  updateDocument(id: string, attrs: A): void {
    this.removeDocument(id);
    this.addDocument(id, attrs);
  }

  clear(): void {
    this.docs.clear();
    this.df.clear();
    this.totalLength = 0;
  }

  /**
   * Compute BM25 scores for all documents matching the query.
   * Returns only documents with score > 0 (at least one query term matches).
   */
  score(query: string): Map<string, number> {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return new Map();

    const N = this.docs.size;
    if (N === 0) return new Map();

    const avgDl = this.totalLength / N;
    const results = new Map<string, number>();

    for (const [id, doc] of this.docs) {
      let docScore = 0;

      for (const term of queryTokens) {
        const tf = doc.termFreqs.get(term) ?? 0;
        if (tf === 0) continue;

        const docFreq = this.df.get(term) ?? 0;
        // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
        const idf = Math.log((N - docFreq + BM25_IDF_OFFSET) / (docFreq + BM25_IDF_OFFSET) + 1);
        // TF saturation: (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl/avgdl))
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * doc.length / avgDl));

        docScore += idf * tfNorm;
      }

      if (docScore > 0) {
        results.set(id, docScore);
      }
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion
// ---------------------------------------------------------------------------

/**
 * Fuse two ranked lists using Reciprocal Rank Fusion (RRF).
 * score(d) = 1/(k + rank_vector(d)) + 1/(k + rank_bm25(d))
 *
 * Nodes appearing in only one list get rank = Infinity for the other → only 1/(k+rank) from one source.
 */
export function rrfFuse(
  vectorScores: Map<string, number>,
  bm25Scores: Map<string, number>,
  k: number = RRF_K,
): Map<string, number> {
  // Build ranked lists (sorted desc by score, rank starts at 1)
  const vectorRank = buildRankMap(vectorScores);
  const bm25Rank = buildRankMap(bm25Scores);

  // Collect all unique document IDs
  const allIds = new Set<string>();
  for (const id of vectorScores.keys()) allIds.add(id);
  for (const id of bm25Scores.keys()) allIds.add(id);

  const fused = new Map<string, number>();
  for (const id of allIds) {
    const vRank = vectorRank.get(id);
    const bRank = bm25Rank.get(id);
    let score = 0;
    if (vRank != null) score += 1 / (k + vRank);
    if (bRank != null) score += 1 / (k + bRank);
    fused.set(id, score);
  }

  return fused;
}

function buildRankMap(scores: Map<string, number>): Map<string, number> {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    ranks.set(sorted[i][0], i + 1); // rank starts at 1
  }
  return ranks;
}
