/**
 * Search controller — HTTP handlers for full-text search, faceted filtering,
 * and autocomplete suggestions. All search operations are read-only and
 * delegate to the search service which maintains an in-memory BM25 index.
 *
 * Routes:
 *   GET  /api/search              — Full-text product search with facets
 *   GET  /api/search/autocomplete — Prefix-based term suggestions
 *   POST /api/search/faceted      — Advanced faceted search with body params
 *
 * @see {@link ../services/search-service.ts} for BM25 implementation
 * @see {@link ../../docs/search-algorithm.md} for algorithm details
 * @see {@link ../../docs/adr-003-search-engine.md} for design rationale
 */

import { Request, Response } from 'express';
import { search, autocomplete, indexProduct } from '@/services/search-service';
import { SearchQuery, PriceRange } from '@/types';

/**
 * Full-text search endpoint. Accepts query string and optional filters
 * as query parameters. Returns ranked results with facet distributions.
 *
 * Query params: q (required), category, minPrice, maxPrice, currency,
 *               tags (comma-separated), inStock, offset, limit
 */
export function handleSearch(req: Request, res: Response): void {
  const q = req.query.q as string;
  if (!q || !q.trim()) {
    res.status(400).json({ error: 'Search query (q) is required' });
    return;
  }

  const priceRange: PriceRange | undefined = (req.query.minPrice || req.query.maxPrice)
    ? {
        min: Number(req.query.minPrice ?? 0),
        max: Number(req.query.maxPrice ?? Infinity),
        currency: (req.query.currency as string) ?? 'USD',
      }
    : undefined;

  const query: SearchQuery = {
    query: q.trim(),
    category: req.query.category as string | undefined,
    priceRange,
    tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
    inStock: req.query.inStock === 'true',
    page: {
      offset: req.query.offset ? Number(req.query.offset) : 0,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    },
  };

  const results = search(query);
  res.json(results);
}

/**
 * Autocomplete endpoint. Returns term suggestions matching a prefix.
 * Used by the search bar to provide type-ahead suggestions.
 *
 * Query params: prefix (required), limit (default 10)
 */
export function handleAutocomplete(req: Request, res: Response): void {
  const prefix = req.query.prefix as string;
  if (!prefix || prefix.length < 2) {
    res.status(400).json({ error: 'Prefix must be at least 2 characters' });
    return;
  }

  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const suggestions = autocomplete(prefix.trim(), limit);
  res.json({ suggestions });
}

/**
 * Advanced faceted search with full request body.
 * Supports complex filter combinations that are awkward as query params.
 * Body matches the SearchQuery interface directly.
 */
export function handleFacetedSearch(req: Request, res: Response): void {
  const body = req.body as SearchQuery;
  if (!body.query || !body.query.trim()) {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  const results = search(body);
  res.json(results);
}

/**
 * Trigger reindexing for a specific product. Called internally after
 * product create/update to keep the search index in sync.
 * This is not exposed as a public API endpoint.
 */
export function reindexProduct(req: Request, res: Response): void {
  const product = req.body;
  if (!product?.id) {
    res.status(400).json({ error: 'Product data with ID is required' });
    return;
  }

  indexProduct(product);
  res.json({ indexed: true, productId: product.id });
}
