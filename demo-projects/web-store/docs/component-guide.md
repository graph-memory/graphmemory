# Component Architecture Guide

This document describes the component architecture, naming conventions, prop patterns, and composition strategies used in the ShopFlow Web Store.

## Component Organization

Components are organized by responsibility and scope:

```
src/components/
  Header.tsx          # App-level navigation shell
  SearchBar.tsx       # Search with autocomplete
  ProductCard.tsx     # Single product display
  ProductList.tsx     # Product catalog with filters
  Cart.tsx            # Shopping cart drawer
  Checkout.tsx        # Multi-step checkout flow
```

Each component file is self-contained: it exports a single named component and may include private helper components that are only used within that file.

## Naming Conventions

### Files and Components
- **PascalCase** for component files and exports: `ProductCard.tsx` exports `ProductCard`
- **camelCase** for hooks: `useCart.ts` exports `useCart`
- **kebab-case** for services: `api-client.ts` exports named functions

### Props Interfaces
- Named as `{ComponentName}Props` and defined directly above the component
- Callback props use the `on` prefix: `onAddToCart`, `onNavigate`, `onClose`
- Boolean props use `is` or `has` prefix: `isOpen`, `hasDiscount`, `isLoading`

```typescript
interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  onNavigate: (productId: string) => void;
}
```

## Composition Patterns

### Container / Presentational Split
Top-level page components act as containers — they connect hooks to presentational components:

```typescript
function CatalogPage() {
  const products = useProducts(filters);
  const { addItem } = useCart();

  return <ProductList products={products} onAddToCart={addItem} />;
}
```

### Compound Components
Complex components like `Checkout` use internal step components that share state through the parent. Each step is a private component within the same file, receiving state via props rather than context.

### Render Delegation
Components that need flexible rendering accept children or render props:

```typescript
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
}
```

## Event Handling

### Callback Memoization
All event handlers passed as props are wrapped in `useCallback` to prevent unnecessary re-renders in child components:

```typescript
const handleAddToCart = useCallback(
  (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToCart(product);
  },
  [product, onAddToCart]
);
```

### Keyboard Support
Interactive elements that are not native buttons or links receive `onKeyDown` handlers for Enter and Space key activation:

```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigate(product.id);
    }
  },
  [product.id, onNavigate]
);
```

## Styling Approach

### BEM-Inspired Class Names
CSS classes follow a BEM-like convention scoped to the component:

```
.product-card              // Block
.product-card__title       // Element
.product-card__badge--sale // Modifier
```

### CSS Modules
Each component can have an optional `.module.css` file. Class names are imported as objects to avoid global collisions:

```typescript
import styles from './ProductCard.module.css';
<div className={styles.card}>
```

## Performance Guidelines

- Use `React.memo` only for components that receive stable props and render frequently
- Prefer `useMemo` for expensive computations (price formatting, filtering)
- Avoid inline object/array literals in JSX props — extract to constants or memoize
- Images should always include `loading="lazy"` and explicit `width`/`height`

## Error Boundaries

Wrap major page sections in error boundaries to prevent a single component failure from crashing the entire app. The `Cart` and `Checkout` components each have their own boundary since they handle critical user flows.

## Testing Strategy

- **Unit tests**: Test components in isolation with React Testing Library
- **Integration tests**: Test hook + component combinations (e.g., `useCart` + `Cart`)
- **Visual regression**: Storybook snapshots for each component variant
- **E2E tests**: Playwright scripts covering the full purchase flow
