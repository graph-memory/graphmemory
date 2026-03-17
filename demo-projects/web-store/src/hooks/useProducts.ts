/**
 * Product list fetching hook for the ShopFlow Web Store.
 *
 * Handles paginated product queries with filter support, result caching,
 * and infinite scroll integration. Uses a simple in-memory cache keyed
 * by serialized filter parameters to avoid redundant API calls.
 * @module hooks/useProducts
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Product, ProductFilters, PaginatedResponse } from '@/types';
import { get } from '@/services/api-client';

const PAGE_SIZE = 24;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Cache entry with timestamp for TTL-based invalidation */
interface CacheEntry {
  data: PaginatedResponse<Product>;
  timestamp: number;
}

/** Return type for the useProducts hook */
export interface UseProductsReturn {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  total: number;
}

/** Serialize filters into a stable cache key string */
function buildCacheKey(filters: ProductFilters, page: number): string {
  return JSON.stringify({ ...filters, page });
}

/**
 * Hook for fetching and managing a paginated product list.
 * Supports filtering, sorting, caching, and infinite scroll loading.
 */
export function useProducts(filters: ProductFilters = {}): UseProductsReturn {
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<Map<string, CacheEntry>>(new Map());

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const cacheKey = buildCacheKey(filters, pageNum);
      const cached = cache.current.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        if (append) {
          setProducts((prev) => [...prev, ...cached.data.items]);
        } else {
          setProducts(cached.data.items);
        }
        setTotal(cached.data.total);
        setHasMore(cached.data.hasMore);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {
          page: pageNum.toString(),
          pageSize: PAGE_SIZE.toString(),
        };
        if (filters.category) params.category = filters.category;
        if (filters.minPrice !== undefined) params.minPrice = filters.minPrice.toString();
        if (filters.maxPrice !== undefined) params.maxPrice = filters.maxPrice.toString();
        if (filters.sortBy) params.sortBy = filters.sortBy;
        if (filters.tags?.length) params.tags = filters.tags.join(',');

        const data = await get<PaginatedResponse<Product>>('/products', params);
        cache.current.set(cacheKey, { data, timestamp: Date.now() });

        if (append) {
          setProducts((prev) => [...prev, ...data.items]);
        } else {
          setProducts(data.items);
        }
        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load products');
      } finally {
        setIsLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    setPage(1);
    fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, true);
  }, [isLoading, hasMore, page, fetchPage]);

  const refresh = useCallback(() => {
    cache.current.clear();
    setPage(1);
    fetchPage(1, false);
  }, [fetchPage]);

  return { products, isLoading, error, hasMore, loadMore, refresh, total };
}
