/**
 * Shared types for the ShopFlow Catalog Service.
 * All domain entities, query parameters, and result types are defined here
 * to ensure consistency across controllers, services, and models.
 */

/** Sort direction for list endpoints */
export type SortOrder = 'asc' | 'desc';

/** Price range filter for product search */
export interface PriceRange {
  min: number;
  max: number;
  currency: string;
}

/** Pagination parameters supporting both cursor and offset modes */
export interface PaginationParams {
  cursor?: string;
  offset?: number;
  limit: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

/** Page info returned with paginated results */
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  totalCount: number;
  cursor?: string;
}

/** Product variant (e.g., size/color combination) */
export interface ProductVariant {
  sku: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  attributes: Record<string, string>;
  stockQuantity: number;
  weight?: number;
}

/** SEO metadata for product pages */
export interface SeoMetadata {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string;
  ogImage?: string;
}

/** Full product entity */
export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  variants: ProductVariant[];
  images: string[];
  seo: SeoMetadata;
  status: 'draft' | 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

/** Category tree node */
export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  parentId: string | null;
  path: string;
  depth: number;
  sortOrder: number;
  productCount: number;
  image?: string;
}

/** Product review with moderation */
export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  verifiedPurchase: boolean;
  createdAt: Date;
}

/** Rating aggregation for a product */
export interface RatingAggregation {
  averageRating: number;
  totalReviews: number;
  distribution: Record<number, number>;
}

/** Search query parameters */
export interface SearchQuery {
  query: string;
  category?: string;
  priceRange?: PriceRange;
  tags?: string[];
  inStock?: boolean;
  page?: PaginationParams;
}

/** A single search result with relevance score */
export interface SearchResult {
  product: Product;
  score: number;
  highlights: Record<string, string[]>;
}

/** Facet bucket for search refinement */
export interface FacetBucket {
  value: string;
  count: number;
}

/** Faceted search response */
export interface FacetedSearchResponse {
  results: SearchResult[];
  facets: Record<string, FacetBucket[]>;
  pageInfo: PageInfo;
  queryTime: number;
}
