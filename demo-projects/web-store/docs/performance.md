# Performance Optimization

This document covers the performance strategies used in the ShopFlow Web Store, including code splitting, image optimization, caching, bundle analysis, and Core Web Vitals targets.

## Core Web Vitals Targets

| Metric | Target  | Current | Description                        |
|--------|---------|---------|------------------------------------|
| LCP    | < 2.5s  | 1.8s    | Largest Contentful Paint           |
| INP    | < 200ms | 95ms    | Interaction to Next Paint          |
| CLS    | < 0.1   | 0.02    | Cumulative Layout Shift            |
| FCP    | < 1.8s  | 1.2s    | First Contentful Paint             |
| TTFB   | < 800ms | 320ms   | Time to First Byte                 |

Metrics are tracked in production via the Web Vitals library and reported to our analytics dashboard. Regressions trigger alerts in CI when Lighthouse scores drop below thresholds.

## Code Splitting

### Route-Based Splitting
Each page is loaded as a separate chunk using `React.lazy` and `Suspense`:

```typescript
const CatalogPage = React.lazy(() => import('./pages/Catalog'));
const CheckoutPage = React.lazy(() => import('./pages/Checkout'));
const AccountPage = React.lazy(() => import('./pages/Account'));
```

The initial bundle includes only the Header, SearchBar, and the landing page. Additional routes are fetched on navigation.

### Component-Level Splitting
Heavy components that are not immediately visible are split individually:

- **Cart drawer**: Loaded on first cart icon click
- **Checkout form**: Loaded when navigating to checkout
- **Product image gallery**: Loaded below the fold via intersection trigger

### Vendor Chunk Strategy
Vite's `manualChunks` configuration separates vendor dependencies:

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-intl': ['@formatjs/intl'],
      }
    }
  }
}
```

## Image Optimization

### Responsive Images
Product images use the `<picture>` element with multiple `srcset` entries:

```html
<picture>
  <source srcset="product-400.webp 400w, product-800.webp 800w" type="image/webp" />
  <source srcset="product-400.jpg 400w, product-800.jpg 800w" type="image/jpeg" />
  <img src="product-400.jpg" alt="Product name" loading="lazy" />
</picture>
```

### Lazy Loading
All product images below the fold use `loading="lazy"`. The first visible row of products (above the fold) uses `loading="eager"` and `fetchpriority="high"` for LCP optimization.

### Blur-Up Placeholders
Product cards display a tiny (20px wide) blurred placeholder inline as a base64 data URI while the full image loads. This eliminates layout shift and provides immediate visual feedback.

### CDN Configuration
Images are served from a dedicated CDN (`cdn.shopflow.dev`) with:
- Automatic WebP/AVIF format negotiation via `Accept` header
- On-the-fly resizing with width/height parameters
- Aggressive caching: `Cache-Control: public, max-age=31536000, immutable`
- Brotli compression for SVG assets

## Caching Strategy

### API Response Caching
The `useProducts` hook maintains an in-memory cache keyed by serialized query parameters:

| Cache Layer   | TTL      | Scope          | Invalidation               |
|---------------|----------|----------------|-----------------------------|
| In-memory     | 5 min    | Per hook       | Manual refresh or TTL expiry|
| HTTP cache    | 60s      | Browser        | `Cache-Control` header      |
| CDN cache     | 5 min    | Edge           | Purge API on product update |

### Search Result Caching
Search results and autocomplete suggestions are cached in a bounded LRU map (50 entries max). Older entries are evicted when the limit is reached.

### Static Asset Caching
Vite produces content-hashed filenames (`ProductCard-a1b2c3.js`) enabling immutable caching:
- JS/CSS bundles: `Cache-Control: public, max-age=31536000, immutable`
- HTML entry point: `Cache-Control: no-cache` (always revalidated)

## Bundle Analysis

### Size Budget

| Chunk          | Budget | Actual | Status |
|----------------|--------|--------|--------|
| Initial JS     | 150 KB | 112 KB | Pass   |
| Initial CSS    | 30 KB  | 22 KB  | Pass   |
| Vendor React   | 45 KB  | 42 KB  | Pass   |
| Catalog page   | 25 KB  | 18 KB  | Pass   |
| Checkout page  | 35 KB  | 28 KB  | Pass   |
| Total (all)    | 400 KB | 310 KB | Pass   |

All sizes are gzipped. The `bundlesize` CI check enforces these limits on every pull request.

### Monitoring
- **`vite-plugin-bundle-visualizer`**: Generates a treemap of the bundle on every build
- **`source-map-explorer`**: Analyzes actual production source maps for dependency tracking
- **Lighthouse CI**: Runs performance audits on every PR with score thresholds

## Runtime Optimizations

### Virtualization
The product grid does not use virtualization by default because infinite scroll keeps the DOM size bounded (24 items per page). If a user scrolls through 10+ pages, a virtual window activates to cap the rendered DOM nodes at ~100.

### Debounced Search
Search input is debounced at 300ms to limit API calls during fast typing. Suggestions are fetched asynchronously and do not block the main thread.

### Memoization
- `useMemo` for computed values: cart subtotal, formatted prices, filtered product lists
- `useCallback` for all event handlers passed as props
- `React.memo` on `ProductCard` since it receives stable props from the memoized product list

### Intersection Observer
Infinite scroll uses a single `IntersectionObserver` instance with a 200px `rootMargin` to prefetch the next page before the user reaches the bottom.

## Prefetching

### Link Prefetching
Navigation links in the header use `<link rel="prefetch">` hints for likely next pages. The product detail page is prefetched when a product card enters the viewport.

### DNS Prefetching
External origins are hinted early in the document `<head>`:

```html
<link rel="dns-prefetch" href="https://api.shopflow.dev" />
<link rel="dns-prefetch" href="https://cdn.shopflow.dev" />
<link rel="preconnect" href="https://api.shopflow.dev" crossorigin />
```

## Performance Testing

- **Lighthouse CI**: Automated on every PR, blocks merge if performance score < 90
- **WebPageTest**: Weekly scheduled tests from multiple geographic locations
- **Real User Monitoring**: Web Vitals data collected from production users via the analytics pipeline
- **Load testing**: k6 scripts simulate 1000 concurrent users browsing and purchasing
