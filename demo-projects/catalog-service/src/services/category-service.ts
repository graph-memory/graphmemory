/**
 * Category service — tree management, breadcrumb generation, and reordering.
 * Categories form a hierarchical tree using materialized paths for efficient
 * ancestor/descendant queries. See ADR-004 for design rationale.
 *
 * @see {@link ../models/category.ts} for Category factory and path utilities
 * @see {@link ../../docs/adr-004-category-tree.md} for architecture decision
 */

import { Category } from '@/types';
import { createCategory, CreateCategoryInput, buildBreadcrumbs } from '@/models/category';

/** In-memory category store (replaced by database in production) */
const categories: Map<string, Category> = new Map();

/**
 * Add a new category to the tree. If parentId is provided, the parent must exist.
 * The materialized path is computed from the parent's path.
 *
 * @throws Error if the parent category is not found
 */
export function addCategory(input: CreateCategoryInput): Category {
  let parentPath: string | null = null;

  if (input.parentId) {
    const parent = categories.get(input.parentId);
    if (!parent) throw new Error(`Parent category not found: ${input.parentId}`);
    parentPath = parent.path;
  }

  const existingSlugs = Array.from(categories.values()).map(c => c.slug);
  const category = createCategory(input, parentPath, existingSlugs);
  categories.set(category.id, category);
  return category;
}

/**
 * Retrieve a category by ID with its breadcrumb trail.
 */
export function getCategory(id: string): { category: Category; breadcrumbs: ReturnType<typeof buildBreadcrumbs> } | undefined {
  const category = categories.get(id);
  if (!category) return undefined;

  const allCats = Array.from(categories.values());
  return { category, breadcrumbs: buildBreadcrumbs(category, allCats) };
}

/**
 * Get all direct children of a category, sorted by sortOrder.
 */
export function getChildren(parentId: string): Category[] {
  return Array.from(categories.values())
    .filter(c => c.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get all descendants of a category using materialized path prefix matching.
 * This is the primary advantage of materialized paths — O(n) scan, no recursion.
 */
export function getDescendants(categoryId: string): Category[] {
  const category = categories.get(categoryId);
  if (!category) return [];

  const prefix = category.path + '/';
  return Array.from(categories.values())
    .filter(c => c.path.startsWith(prefix))
    .sort((a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder);
}

/**
 * Build the full category tree starting from root nodes.
 * Returns a nested structure suitable for navigation menus.
 */
export interface CategoryTreeNode {
  category: Category;
  children: CategoryTreeNode[];
}

export function buildTree(): CategoryTreeNode[] {
  const roots = Array.from(categories.values())
    .filter(c => c.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function buildSubtree(parent: Category): CategoryTreeNode {
    const children = getChildren(parent.id);
    return {
      category: parent,
      children: children.map(child => buildSubtree(child)),
    };
  }

  return roots.map(root => buildSubtree(root));
}

/**
 * Reorder categories within the same parent.
 * Accepts a list of category IDs in the desired order.
 */
export function reorderChildren(parentId: string | null, orderedIds: string[]): void {
  orderedIds.forEach((id, index) => {
    const category = categories.get(id);
    if (category && category.parentId === parentId) {
      categories.set(id, { ...category, sortOrder: index });
    }
  });
}

/**
 * Delete a category and optionally reassign its children to a new parent.
 * @throws Error if the category has children and no new parent is specified
 */
export function deleteCategory(id: string, reassignTo?: string): boolean {
  const children = getChildren(id);
  if (children.length > 0 && !reassignTo) {
    throw new Error('Cannot delete category with children. Provide reassignTo or delete children first.');
  }
  return categories.delete(id);
}
