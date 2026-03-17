/**
 * Category controller — HTTP request handlers for category tree management.
 * Supports CRUD operations, tree traversal, and category reordering
 * for building navigation menus and product filtering hierarchies.
 *
 * Routes:
 *   GET    /api/categories           — List all categories (flat or tree)
 *   GET    /api/categories/:id       — Get category with breadcrumbs
 *   GET    /api/categories/:id/children — Get direct children
 *   POST   /api/categories           — Create a category
 *   PATCH  /api/categories/reorder   — Reorder sibling categories
 *   DELETE /api/categories/:id       — Delete a category
 *
 * @see {@link ../services/category-service.ts} for tree operations
 * @see {@link ../../docs/adr-004-category-tree.md} for tree structure rationale
 */

import { Request, Response } from 'express';
import { addCategory, getCategory, getChildren, getDescendants, buildTree, reorderChildren, deleteCategory } from '@/services/category-service';

/**
 * List categories. When `?format=tree` is specified, returns the nested tree
 * structure; otherwise returns a flat list sorted by path.
 */
export function handleListCategories(req: Request, res: Response): void {
  const format = req.query.format as string | undefined;

  if (format === 'tree') {
    const tree = buildTree();
    res.json({ tree });
    return;
  }

  // Flat list — useful for dropdowns and admin panels
  const tree = buildTree();
  const flat = flattenTree(tree);
  res.json({ categories: flat });
}

/** Recursively flatten a category tree into an array */
function flattenTree(nodes: ReturnType<typeof buildTree>): ReturnType<typeof buildTree>[0]['category'][] {
  const result: ReturnType<typeof buildTree>[0]['category'][] = [];
  for (const node of nodes) {
    result.push(node.category);
    result.push(...flattenTree(node.children));
  }
  return result;
}

/**
 * Get a single category by ID with its breadcrumb trail.
 * Returns 404 if the category does not exist.
 */
export function handleGetCategory(req: Request, res: Response): void {
  const result = getCategory(req.params.id);
  if (!result) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  res.json(result);
}

/**
 * Get direct children of a category, sorted by sortOrder.
 * Optionally includes descendants when `?depth=all` is specified.
 */
export function handleGetChildren(req: Request, res: Response): void {
  const depth = req.query.depth as string | undefined;

  if (depth === 'all') {
    const descendants = getDescendants(req.params.id);
    res.json({ categories: descendants });
    return;
  }

  const children = getChildren(req.params.id);
  res.json({ categories: children });
}

/**
 * Create a new category. Optionally specify parentId to nest under an
 * existing category. Returns 400 if the parent does not exist.
 */
export function handleCreateCategory(req: Request, res: Response): void {
  try {
    const category = addCategory(req.body);
    res.status(201).json(category);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid input';
    res.status(400).json({ error: message });
  }
}

/**
 * Reorder sibling categories within the same parent.
 * Body: { parentId: string | null, orderedIds: string[] }
 */
export function handleReorderCategories(req: Request, res: Response): void {
  const { parentId, orderedIds } = req.body;
  reorderChildren(parentId ?? null, orderedIds);
  res.json({ success: true });
}

/**
 * Delete a category. If the category has children, a `reassignTo` ID
 * must be provided to reparent them. Returns 400 if deletion is not safe.
 */
export function handleDeleteCategory(req: Request, res: Response): void {
  try {
    const reassignTo = req.query.reassignTo as string | undefined;
    const deleted = deleteCategory(req.params.id, reassignTo);
    if (!deleted) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    res.status(400).json({ error: message });
  }
}
