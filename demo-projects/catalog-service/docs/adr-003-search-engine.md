# ADR-003: Custom BM25 Search Engine

**Status:** Accepted
**Date:** 2025-09-15
**Deciders:** Engineering team
**Supersedes:** None

## Context

The Catalog Service needs full-text product search with relevance ranking, faceted filtering, and autocomplete. We evaluated three approaches:

1. **Elasticsearch** — Dedicated search engine, industry standard for e-commerce
2. **PostgreSQL full-text search** — Built into the existing database, `tsvector`/`tsquery` with ranking
3. **Custom in-memory BM25** — Lightweight implementation in TypeScript, no external dependencies

### Requirements

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Full-text search with relevance ranking | Must have | BM25 or similar |
| Faceted search (category, tags, price) | Must have | Real-time facet counts |
| Autocomplete suggestions | Should have | Sub-50ms latency |
| Catalog size up to 50K products | Must have | Current scale |
| Catalog size up to 500K products | Nice to have | 2-year growth target |
| No additional infrastructure | Should have | Team is small |
| Sub-100ms query latency | Must have | UX requirement |

## Decision

We chose **Option 3: Custom in-memory BM25** for the initial implementation, with a defined migration path to Elasticsearch when the catalog exceeds 100K products.

## Rationale

### Why not Elasticsearch?

Elasticsearch is the gold standard for e-commerce search, but it introduces significant operational complexity:

- **Infrastructure cost** — Requires a separate cluster (minimum 3 nodes for production), monitoring, backups, and upgrades
- **Operational burden** — Index mapping management, shard tuning, cluster health monitoring, JVM tuning
- **Team expertise** — No one on the current team has production Elasticsearch experience
- **Overkill at current scale** — With 12K products, the full power of Elasticsearch is unnecessary

For a team of 4 engineers shipping a v1, the operational overhead of Elasticsearch is not justified.

### Why not PostgreSQL full-text search?

PostgreSQL FTS is a reasonable middle ground, but has limitations:

- **Ranking quality** — `ts_rank` is less sophisticated than BM25; no built-in title boosting or field weighting
- **Facets** — Requires separate aggregation queries or materialized views; not as natural as in-memory computation
- **Autocomplete** — Requires trigram indexes (`pg_trgm`) and careful tuning

PostgreSQL FTS would be acceptable, but the custom approach gives us more control over ranking quality with similar effort.

### Why custom BM25?

The custom implementation offers several advantages at our current scale:

- **Zero infrastructure** — Runs in the same Node.js process, no network calls
- **Full control** — Title boosting, custom tokenization, and facet logic are trivial to adjust
- **Fast iteration** — Relevance tuning is a code change, not an index reconfiguration
- **Sub-10ms queries** — In-memory operation eliminates network latency entirely
- **Simple codebase** — ~120 lines of TypeScript for the core BM25 + tokenizer

### Performance Benchmarks

Measured on a MacBook Pro M2, single-threaded:

| Catalog Size | Index Time | Query Latency | Memory |
|-------------|------------|---------------|--------|
| 1K products | 45ms | 2ms | 12MB |
| 10K products | 380ms | 8ms | 95MB |
| 50K products | 1.9s | 35ms | 450MB |
| 100K products | 4.1s | 72ms | 920MB |

Query latency stays under 100ms up to ~100K products. Beyond that, the linear scan over all documents becomes the bottleneck.

## Migration Path

When the catalog approaches 100K products, we will migrate to Elasticsearch. The migration plan:

1. **Abstract the search interface** — The search service already isolates BM25 behind `search()` and `indexProduct()` functions. Adding an Elasticsearch adapter requires implementing the same interface.

2. **Dual-write period** — During migration, both the in-memory index and Elasticsearch are updated on product changes. Search queries can be routed to either backend with a feature flag.

3. **Validation** — Compare search results between both backends using A/B testing. Measure ranking quality with click-through rate (CTR) and mean reciprocal rank (MRR).

4. **Cutover** — Once Elasticsearch results are validated, remove the in-memory index and the `search-service.ts` BM25 implementation.

### Estimated Migration Effort

- Elasticsearch cluster setup + Terraform: 2 days
- Search adapter implementation: 3 days
- Index mapping + analyzers: 2 days
- Dual-write + validation: 1 week
- **Total: ~2.5 weeks** for one engineer

## Consequences

### Positive

- No additional infrastructure for v1 launch
- Sub-10ms query latency at current scale
- Full control over relevance ranking and tokenization
- Simple debugging — search logic is plain TypeScript

### Negative

- Memory usage scales linearly with catalog size
- Not horizontally scalable (single-process)
- Must migrate before reaching ~100K products
- No built-in synonym support, stemming, or language analysis

### Neutral

- Faceted search is computed per-query rather than pre-aggregated
- Autocomplete is prefix-matching only (no fuzzy/typo tolerance)

## Related

- [Search Algorithm](search-algorithm.md) — Technical details of the BM25 implementation
- [ADR-004](adr-004-category-tree.md) — Category tree structure (affects faceted search)
