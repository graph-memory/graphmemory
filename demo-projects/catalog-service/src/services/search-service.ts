/**
 * Search service — full-text search with BM25 ranking and faceted results.
 * Implements an in-memory search index over product documents. For production
 * scale, this would be replaced by Elasticsearch or similar, but the custom
 * BM25 implementation keeps the service self-contained. See ADR-003.
 *
 * @see {@link ../../docs/search-algorithm.md} for BM25 explanation
 * @see {@link ../../docs/adr-003-search-engine.md} for design rationale
 */

import { Product, SearchQuery, SearchResult, FacetBucket, FacetedSearchResponse } from '@/types';
import { normalizePagination, applyOffsetPagination } from '@/utils/pagination';

/** BM25 tuning parameters */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Indexed document with pre-computed term frequencies */
interface IndexedDocument {
  product: Product;
  terms: Map<string, number>;
  totalTerms: number;
}

/** In-memory search index */
const index: Map<string, IndexedDocument> = new Map();
let avgDocLength = 0;

/**
 * Tokenize text into lowercase terms, splitting on whitespace and punctuation.
 * Filters out stopwords and terms shorter than 2 characters.
 */
const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or']);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Index a product for full-text search. Combines title (boosted 3x),
 * description, tags, and variant names into a single term frequency map.
 */
export function indexProduct(product: Product): void {
  const titleTerms = tokenize(product.title);
  const descTerms = tokenize(product.description);
  const tagTerms = product.tags.flatMap(t => tokenize(t));
  const variantTerms = product.variants.flatMap(v => tokenize(v.name));

  // Title terms are boosted by repeating them
  const allTerms = [...titleTerms, ...titleTerms, ...titleTerms, ...descTerms, ...tagTerms, ...variantTerms];

  const terms = new Map<string, number>();
  for (const term of allTerms) {
    terms.set(term, (terms.get(term) ?? 0) + 1);
  }

  index.set(product.id, { product, terms, totalTerms: allTerms.length });
  recomputeAvgLength();
}

/** Recompute average document length after index changes */
function recomputeAvgLength(): void {
  const docs = Array.from(index.values());
  avgDocLength = docs.length > 0
    ? docs.reduce((sum, d) => sum + d.totalTerms, 0) / docs.length
    : 0;
}

/**
 * Compute the BM25 score for a single document against a set of query terms.
 * Uses Okapi BM25 with configurable k1 and b parameters.
 */
function computeBM25Score(doc: IndexedDocument, queryTerms: string[]): number {
  const N = index.size;
  let score = 0;

  for (const term of queryTerms) {
    const tf = doc.terms.get(term) ?? 0;
    if (tf === 0) continue;

    // Document frequency: how many docs contain this term
    let df = 0;
    for (const d of index.values()) {
      if (d.terms.has(term)) df++;
    }

    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * doc.totalTerms / avgDocLength));
    score += idf * tfNorm;
  }

  return score;
}

/**
 * Execute a full-text search with optional faceted filtering.
 * Returns ranked results, facet distributions, and pagination info.
 */
export function search(query: SearchQuery): FacetedSearchResponse {
  const startTime = Date.now();
  const queryTerms = tokenize(query.query);
  const params = normalizePagination(query.page ?? { limit: 20 });

  // Score all documents
  let results: SearchResult[] = [];
  for (const doc of index.values()) {
    const score = computeBM25Score(doc, queryTerms);
    if (score > 0) {
      results.push({ product: doc.product, score, highlights: {} });
    }
  }

  // Apply filters
  if (query.category) results = results.filter(r => r.product.category === query.category);
  if (query.tags?.length) results = results.filter(r => query.tags!.some(t => r.product.tags.includes(t)));
  if (query.inStock) results = results.filter(r => r.product.variants.some(v => v.stockQuantity > 0));

  // Sort by relevance score descending
  results.sort((a, b) => b.score - a.score);

  // Extract facets from filtered results
  const facets = extractFacets(results);

  // Paginate
  const paginated = applyOffsetPagination(results, params.offset ?? 0, params.limit);

  return {
    results: paginated.items,
    facets,
    pageInfo: paginated.pageInfo,
    queryTime: Date.now() - startTime,
  };
}

/**
 * Extract facet buckets from search results for categories and tags.
 */
function extractFacets(results: SearchResult[]): Record<string, FacetBucket[]> {
  const categoryMap = new Map<string, number>();
  const tagMap = new Map<string, number>();

  for (const r of results) {
    categoryMap.set(r.product.category, (categoryMap.get(r.product.category) ?? 0) + 1);
    for (const tag of r.product.tags) {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
  }

  return {
    category: Array.from(categoryMap.entries()).map(([value, count]) => ({ value, count })),
    tag: Array.from(tagMap.entries()).map(([value, count]) => ({ value, count })),
  };
}

/**
 * Autocomplete suggestions based on indexed terms matching a prefix.
 * Returns up to `limit` unique terms sorted by document frequency.
 */
export function autocomplete(prefix: string, limit: number = 10): string[] {
  const lower = prefix.toLowerCase();
  const termFreqs = new Map<string, number>();

  for (const doc of index.values()) {
    for (const term of doc.terms.keys()) {
      if (term.startsWith(lower)) {
        termFreqs.set(term, (termFreqs.get(term) ?? 0) + 1);
      }
    }
  }

  return Array.from(termFreqs.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}
