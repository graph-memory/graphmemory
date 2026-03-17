# Search Algorithm

Technical documentation for the full-text search implementation in the Catalog Service. The search engine uses BM25 ranking with title boosting, faceted filtering, and autocomplete suggestions.

## Overview

The search system is built around three components:

1. **Indexing** — Tokenize product fields and build term frequency maps
2. **Ranking** — BM25 scoring algorithm for relevance ordering
3. **Faceting** — Real-time aggregation of filter values from result sets

For the rationale behind choosing a custom BM25 implementation over Elasticsearch, see [ADR-003](adr-003-search-engine.md).

## BM25 Algorithm

BM25 (Best Matching 25) is a probabilistic relevance ranking function from the Okapi information retrieval system. It scores documents based on term frequency (TF), inverse document frequency (IDF), and document length normalization.

### Formula

```
score(D, Q) = Σ IDF(qi) × (tf(qi, D) × (k1 + 1)) / (tf(qi, D) + k1 × (1 - b + b × |D| / avgdl))
```

Where:
- `D` = document, `Q` = query terms
- `tf(qi, D)` = frequency of term `qi` in document `D`
- `IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5) + 1)`
- `N` = total number of documents
- `n(qi)` = number of documents containing term `qi`
- `|D|` = document length (total terms)
- `avgdl` = average document length across the index
- `k1 = 1.2` (term frequency saturation)
- `b = 0.75` (document length normalization)

### Tuning Parameters

| Parameter | Value | Effect |
|-----------|-------|--------|
| `k1` | 1.2 | Controls TF saturation. Higher values give more weight to repeated terms. |
| `b` | 0.75 | Controls length normalization. 0 = no normalization, 1 = full normalization. |

These defaults work well for product catalogs where titles are short (3-8 words) and descriptions are medium-length (50-200 words).

## Indexing Strategy

### Tokenization

Text is processed through these steps:

1. Convert to lowercase
2. Remove non-alphanumeric characters (except spaces)
3. Split on whitespace
4. Filter stopwords (`the`, `a`, `an`, `is`, `are`, `in`, `on`, `at`, `to`, `for`, `of`, `and`, `or`)
5. Remove tokens shorter than 2 characters

```typescript
tokenize("Wireless Bluetooth Headphones v2.0")
// => ["wireless", "bluetooth", "headphones", "v2"]
```

See the `tokenize()` function in the [search service](../src/services/search-service.ts).

### Field Boosting

Product fields are indexed with different weights:

| Field | Boost | Rationale |
|-------|-------|-----------|
| `title` | 3x | Most important for relevance; users typically search by product name |
| `description` | 1x | Provides context but is often generic |
| `tags` | 1x | Useful for attribute-based search (e.g., "wireless") |
| `variant.name` | 1x | Enables searching by variant attributes |

Title boosting is implemented by repeating title terms 3 times in the term frequency map:

```typescript
const allTerms = [
  ...titleTerms, ...titleTerms, ...titleTerms,  // 3x boost
  ...descTerms,
  ...tagTerms,
  ...variantTerms,
];
```

### Index Maintenance

The search index is updated incrementally:

- **Product created** → `indexProduct()` adds to the index
- **Product updated** → `indexProduct()` overwrites the existing entry
- **Product deleted** → Entry removed from the index map

Average document length (`avgdl`) is recomputed after every index change to maintain accurate BM25 scoring.

## Faceted Search

Facets provide filter options derived from the search results. Two facet types are extracted:

### Category Facets

Aggregated from the `category` field of matching products:

```json
[
  { "value": "electronics", "count": 23 },
  { "value": "accessories", "count": 12 }
]
```

### Tag Facets

Aggregated from all `tags` across matching products:

```json
[
  { "value": "wireless", "count": 15 },
  { "value": "bluetooth", "count": 14 },
  { "value": "noise-cancelling", "count": 8 }
]
```

Facets are computed **after** applying search ranking but **before** pagination, so they always reflect the complete result set.

## Autocomplete

The autocomplete endpoint uses prefix matching against all indexed terms. Results are ranked by document frequency (how many products contain the term).

```typescript
autocomplete("wire")
// => ["wireless", "wired", "wire-free"]
```

### Performance Characteristics

| Operation | Time Complexity | Notes |
|-----------|-----------------|-------|
| Index product | O(terms) | Linear in the number of terms |
| Search query | O(N × Q) | N = total products, Q = query terms |
| Autocomplete | O(V) | V = vocabulary size |
| Facet extraction | O(R) | R = result set size |

For catalogs under 100K products, the in-memory BM25 index provides sub-50ms query latency. Beyond that scale, consider migrating to Elasticsearch — see [ADR-003](adr-003-search-engine.md) for the migration path.

## Relevance Tuning

Common adjustments for improving search quality:

1. **Increase title boost** (3x → 5x) if title matches are underweighted
2. **Add synonym expansion** for common product terms (e.g., "laptop" → "notebook")
3. **Adjust k1** higher (1.5) if long product descriptions should matter more
4. **Lower b** (0.5) if short product titles are being unfairly penalized
5. **Add category boosting** to prefer results from the user's current category context
