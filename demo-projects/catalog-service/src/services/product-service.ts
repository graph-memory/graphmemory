/**
 * Product service — business logic layer for product CRUD operations.
 * Handles validation, slug generation, status transitions, and
 * variant management. All mutations go through this service.
 *
 * @see {@link ../models/product.ts} for Product factory and helpers
 * @see {@link ../controllers/product-controller.ts} for HTTP layer
 */

import { Product, PaginationParams } from '@/types';
import { createProduct, CreateProductInput, getBasePrice } from '@/models/product';
import { applyOffsetPagination, normalizePagination } from '@/utils/pagination';

/** In-memory product store (replaced by database in production) */
const products: Map<string, Product> = new Map();

/** Product filter options for list endpoint */
export interface ProductFilter {
  category?: string;
  status?: Product['status'];
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
}

/**
 * Create a new product with validated input.
 * Generates a unique slug and initializes all defaults.
 *
 * @throws Error if title is empty or no variants are provided
 */
export function addProduct(input: CreateProductInput): Product {
  if (!input.title.trim()) throw new Error('Product title is required');
  if (input.variants.length === 0) throw new Error('At least one variant is required');

  const existingSlugs = Array.from(products.values()).map(p => p.slug);
  const product = createProduct(input, existingSlugs);
  products.set(product.id, product);
  return product;
}

/**
 * Retrieve a product by ID. Returns undefined if not found.
 */
export function getProduct(id: string): Product | undefined {
  return products.get(id);
}

/**
 * Update a product's mutable fields. Immutable fields (id, slug, createdAt)
 * cannot be changed after creation.
 */
export function updateProduct(id: string, updates: Partial<Pick<Product, 'title' | 'description' | 'tags' | 'images' | 'seo' | 'status'>>): Product {
  const product = products.get(id);
  if (!product) throw new Error(`Product not found: ${id}`);

  const updated: Product = {
    ...product,
    ...updates,
    updatedAt: new Date(),
  };
  products.set(id, updated);
  return updated;
}

/**
 * Transition a product's status with validation.
 * Allowed transitions: draft -> active, active -> archived, archived -> draft.
 */
export function transitionStatus(id: string, newStatus: Product['status']): Product {
  const product = products.get(id);
  if (!product) throw new Error(`Product not found: ${id}`);

  const allowed: Record<string, string[]> = {
    draft: ['active'],
    active: ['archived'],
    archived: ['draft'],
  };

  if (!allowed[product.status]?.includes(newStatus)) {
    throw new Error(`Cannot transition from ${product.status} to ${newStatus}`);
  }

  return updateProduct(id, { status: newStatus });
}

/**
 * List products with filtering and pagination.
 * Filters are applied in sequence; results are sorted by updatedAt descending.
 */
export function listProducts(filter: ProductFilter, pagination: Partial<PaginationParams> = {}) {
  const params = normalizePagination(pagination);
  let items = Array.from(products.values());

  if (filter.category) items = items.filter(p => p.category === filter.category);
  if (filter.status) items = items.filter(p => p.status === filter.status);
  if (filter.tags?.length) items = items.filter(p => filter.tags!.some(t => p.tags.includes(t)));
  if (filter.minPrice !== undefined) items = items.filter(p => getBasePrice(p) >= filter.minPrice!);
  if (filter.maxPrice !== undefined) items = items.filter(p => getBasePrice(p) <= filter.maxPrice!);

  items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return applyOffsetPagination(items, params.offset ?? 0, params.limit);
}

/**
 * Delete a product by ID. Returns true if deleted, false if not found.
 */
export function deleteProduct(id: string): boolean {
  return products.delete(id);
}
