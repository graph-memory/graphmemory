# State Management

The ShopFlow Web Store uses a hooks-based state management approach without external libraries. State is distributed across custom hooks, React Context for cross-cutting concerns, and localStorage for persistence.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│              React Components           │
│  (consume hooks, render UI)             │
├───────────┬───────────┬─────────────────┤
│  useCart   │ useAuth   │  useProducts    │
│  (Context) │ (Context) │  (local state)  │
├───────────┴───────────┴─────────────────┤
│          Services Layer                  │
│  api-client  │  auth  │  storage         │
├──────────────┴────────┴─────────────────┤
│  localStorage / fetch / JWT tokens       │
└──────────────────────────────────────────┘
```

## Hook Categories

### Global State Hooks
These hooks manage app-wide state and are provided via React Context so any component in the tree can access them:

- **`useAuth`** — User authentication state, login/logout/register actions
- **`useCart`** — Shopping cart items, quantities, add/remove/update operations

### Data Fetching Hooks
These hooks manage server data with caching and pagination. Each instance is local to the component that calls it:

- **`useProducts`** — Paginated product list with filters and infinite scroll
- **`useSearch`** — Search query, debounced suggestions, result caching

## Context Providers

### AuthProvider
Wraps the entire app to provide authentication state. Initializes on mount by checking for existing tokens in localStorage and attempting a silent refresh.

```typescript
function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Router />
      </CartProvider>
    </AuthProvider>
  );
}
```

### CartProvider
Provides cart state to all components. The cart is loaded from localStorage on mount and saved on every change. The Header reads `itemCount` for the badge, while the Cart drawer reads the full item list.

## Data Fetching Patterns

### Cache-First Strategy
Product data uses an in-memory cache keyed by serialized query parameters. Cached entries are served immediately while a background refresh is skipped until the TTL expires (5 minutes by default).

```typescript
const cacheKey = JSON.stringify({ ...filters, page });
const cached = cache.current.get(cacheKey);
if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
  return cached.data;
}
```

### Optimistic Updates
Cart mutations apply locally before the API call resolves. If the server rejects the change, the local state rolls back to the previous snapshot:

```typescript
const addItem = useCallback((product: Product) => {
  const snapshot = [...items];
  setItems(optimisticallyAdd(items, product));
  api.post('/cart/items', { productId: product.id })
    .catch(() => setItems(snapshot));
}, [items]);
```

### Pagination
Product listing uses cursor-based pagination with an IntersectionObserver sentinel. When the sentinel enters the viewport, the next page is fetched and appended to the existing results.

## Persistence Strategy

### localStorage Keys

| Key                        | Type            | Purpose                        |
|----------------------------|-----------------|--------------------------------|
| `shopflow_cart`            | `CartItem[]`    | Cart recovery across sessions  |
| `shopflow_access_token`    | `string`        | JWT access token               |
| `shopflow_refresh_token`   | `string`        | JWT refresh token              |
| `shopflow_token_expiry`    | `number`        | Token expiry timestamp (ms)    |
| `shopflow_search_history`  | `string[]`      | Recent search queries          |
| `shopflow_preferences`     | `UserPreferences` | Locale, currency, theme      |

### Typed Storage Wrapper
All localStorage access goes through the `storage.ts` service, which provides type-safe get/set with JSON serialization and optional TTL-based expiration. This prevents raw `JSON.parse` calls scattered across the codebase.

## State Flow Example: Add to Cart

1. User clicks "Add to Cart" on a `ProductCard`
2. `ProductCard` calls `onAddToCart(product)` prop
3. Parent page delegates to `useCart().addItem(product)`
4. Hook updates local state optimistically
5. Hook persists updated cart to localStorage via `saveCart()`
6. Header re-renders with new `itemCount` from context
7. Cart drawer (if open) shows the new item

## Error Handling

- **Network errors**: Caught in hooks, surfaced as `error` state strings
- **Auth errors (401)**: Trigger token refresh; if refresh fails, redirect to login
- **Validation errors (422)**: Displayed inline near the relevant form field
- **Server errors (5xx)**: Retried automatically by `api-client.ts` with backoff

## Testing State

In tests, hooks are wrapped with mock providers that inject controlled state. The `storage.ts` service is mocked to use an in-memory Map instead of real localStorage, avoiding cross-test pollution.
