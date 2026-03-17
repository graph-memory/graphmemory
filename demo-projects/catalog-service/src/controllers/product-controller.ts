/**
 * Product controller — HTTP request handlers for product CRUD operations.
 * Maps Express routes to product service methods with input validation,
 * error handling, and response formatting.
 *
 * Routes:
 *   GET    /api/products          — List products with filters
 *   GET    /api/products/:id      — Get product by ID
 *   POST   /api/products          — Create a new product
 *   PUT    /api/products/:id      — Update a product
 *   PATCH  /api/products/:id/status — Transition product status
 *   DELETE /api/products/:id      — Delete a product
 *
 * @see {@link ../services/product-service.ts} for business logic
 * @see {@link ../../docs/api-reference.md} for full API documentation
 */

import { Request, Response } from 'express';
import { addProduct, getProduct, updateProduct, listProducts, deleteProduct, transitionStatus, ProductFilter } from '@/services/product-service';

/**
 * List products with optional filtering and pagination.
 * Query params: category, status, minPrice, maxPrice, tags, offset, limit
 */
export function handleListProducts(req: Request, res: Response): void {
  const filter: ProductFilter = {
    category: req.query.category as string | undefined,
    status: req.query.status as ProductFilter['status'],
    minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
    maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
    tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
  };

  const pagination = {
    offset: req.query.offset ? Number(req.query.offset) : 0,
    limit: req.query.limit ? Number(req.query.limit) : 20,
  };

  const result = listProducts(filter, pagination);
  res.json(result);
}

/**
 * Get a single product by ID. Returns 404 if not found.
 */
export function handleGetProduct(req: Request, res: Response): void {
  const product = getProduct(req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json(product);
}

/**
 * Create a new product from the request body.
 * Returns 400 for validation errors, 201 with the created product on success.
 */
export function handleCreateProduct(req: Request, res: Response): void {
  try {
    const product = addProduct(req.body);
    res.status(201).json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid input';
    res.status(400).json({ error: message });
  }
}

/**
 * Update mutable fields on an existing product. Returns 404 if not found.
 */
export function handleUpdateProduct(req: Request, res: Response): void {
  try {
    const product = updateProduct(req.params.id, req.body);
    res.json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    res.status(404).json({ error: message });
  }
}

/**
 * Transition a product's lifecycle status (draft -> active -> archived).
 * Validates allowed transitions and returns 400 for invalid ones.
 */
export function handleTransitionStatus(req: Request, res: Response): void {
  try {
    const product = transitionStatus(req.params.id, req.body.status);
    res.json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status transition failed';
    res.status(400).json({ error: message });
  }
}

/**
 * Delete a product by ID. Returns 204 on success, 404 if not found.
 */
export function handleDeleteProduct(req: Request, res: Response): void {
  const deleted = deleteProduct(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.status(204).send();
}
