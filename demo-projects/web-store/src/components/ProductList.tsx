/**
 * Product listing component for the ShopFlow Web Store.
 *
 * Displays products in a responsive grid or list layout with sort/filter
 * controls and infinite scroll loading. Integrates with the useProducts
 * hook for data fetching and the ProductCard for item rendering.
 * @module components/ProductList
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductFilters } from '@/types';
import { ProductCard } from '@/components/ProductCard';
import { useProducts } from '@/hooks/useProducts';

/** Layout mode for the product grid */
type ViewMode = 'grid' | 'list';

/** Props for the ProductList component */
interface ProductListProps {
  initialFilters?: ProductFilters;
  onNavigate: (productId: string) => void;
  onAddToCart: (product: import('@/types').Product) => void;
}

/** Available sort options shown in the dropdown */
const SORT_OPTIONS: Array<{ value: ProductFilters['sortBy']; label: string }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
];

/**
 * ProductList renders a filterable, sortable, infinitely scrolling
 * catalog of products. Uses IntersectionObserver for scroll detection.
 */
export const ProductList: React.FC<ProductListProps> = ({
  initialFilters = {},
  onNavigate,
  onAddToCart,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filters, setFilters] = useState<ProductFilters>(initialFilters);
  const { products, isLoading, error, hasMore, loadMore, total } = useProducts(filters);
  const sentinelRef = useRef<HTMLDivElement>(null);

  /** Set up the IntersectionObserver to trigger loadMore on scroll */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  /** Handle sort dropdown changes */
  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters((prev) => ({ ...prev, sortBy: e.target.value as ProductFilters['sortBy'] }));
  }, []);

  /** Handle category filter changes */
  const handleCategoryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const category = e.target.value || undefined;
    setFilters((prev) => ({ ...prev, category }));
  }, []);

  return (
    <section className="product-list" aria-label="Product catalog">
      <div className="product-list__toolbar">
        <span className="product-list__count">{total} products</span>

        <div className="product-list__controls">
          <select
            value={filters.category ?? ''}
            onChange={handleCategoryChange}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            <option value="electronics">Electronics</option>
            <option value="clothing">Clothing</option>
            <option value="home">Home & Garden</option>
            <option value="books">Books</option>
          </select>

          <select
            value={filters.sortBy ?? 'relevance'}
            onChange={handleSortChange}
            aria-label="Sort products"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <div className="product-list__view-toggle" role="radiogroup" aria-label="View mode">
            <button
              role="radio"
              aria-checked={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
            >Grid</button>
            <button
              role="radio"
              aria-checked={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              aria-label="List view"
            >List</button>
          </div>
        </div>
      </div>

      {error && <div className="product-list__error" role="alert">{error}</div>}

      <div className={`product-list__items product-list__items--${viewMode}`}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAddToCart={onAddToCart}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {isLoading && <div className="product-list__loader" aria-busy="true">Loading...</div>}
      <div ref={sentinelRef} className="product-list__sentinel" aria-hidden="true" />
    </section>
  );
};
