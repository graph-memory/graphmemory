# Deployment Guide

This document covers the build process, deployment strategy, environment configuration, and feature flags for the ShopFlow Admin Panel.

## Build Process

The admin panel is built with Vite and produces a static SPA bundle.

### Build Commands

```bash
# Development build with hot reload
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview

# Type checking only (no emit)
npm run typecheck
```

### Build Output

Production builds output to the `dist/` directory:

```
dist/
  index.html           # SPA entry point
  assets/
    index-[hash].js    # Main application bundle
    index-[hash].css   # Compiled styles
    vendor-[hash].js   # Third-party dependencies
```

The build process:
1. TypeScript compilation with strict type checking
2. JSX transformation via SWC (faster than Babel)
3. CSS Modules scoping and minification
4. Tree-shaking and dead code elimination
5. Code splitting for vendor chunk
6. Asset hashing for cache busting

### Build Size Budget

| Asset | Budget | Action |
|-------|--------|--------|
| Main JS | < 150 KB gzip | Warning at 120 KB, error at 150 KB |
| Vendor JS | < 80 KB gzip | Warning at 60 KB |
| CSS | < 30 KB gzip | Warning at 25 KB |
| Total | < 260 KB gzip | CI fails if exceeded |

## CDN Deployment

The admin panel is deployed to a CDN for global low-latency access.

### Deployment Pipeline

```
Push to main → CI Tests → Build → Upload to S3 → Invalidate CDN → Smoke Tests
```

### S3 Configuration

```yaml
bucket: shopflow-admin-panel
region: us-east-1
cache_control:
  index.html: "no-cache, no-store, must-revalidate"
  assets/*: "public, max-age=31536000, immutable"
```

`index.html` is never cached to ensure users always get the latest version. Asset files use content hashing and are cached indefinitely.

### CDN Settings

| Setting | Value |
|---------|-------|
| Provider | CloudFront |
| Origins | S3 bucket (static assets), API Gateway (backend) |
| SSL | ACM certificate, TLS 1.2+ |
| Compression | Brotli + gzip |
| Cache TTL | 1 year for hashed assets, 0 for index.html |

### SPA Routing

CloudFront is configured with a custom error response that redirects all 404s to `index.html` with a 200 status code. This enables client-side routing.

## Environment Configuration

Environment variables are injected at build time via Vite's `import.meta.env` mechanism. All variables must be prefixed with `REACT_APP_`.

### Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `REACT_APP_API_URL` | `https://api.shopflow.io/admin` | Admin API base URL |
| `REACT_APP_ENV` | `production` | Current environment name |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_POLL_INTERVAL` | `15000` | Order polling interval (ms) |
| `REACT_APP_2FA_REQUIRED` | `false` | Enforce 2FA globally |
| `REACT_APP_SENTRY_DSN` | — | Sentry error tracking DSN |
| `REACT_APP_ANALYTICS_KEY` | — | Internal analytics tracking key |
| `REACT_APP_MAX_EXPORT_ROWS` | `50000` | Maximum rows for CSV export |

### Environment Files

```
.env                # Shared defaults (committed)
.env.local          # Local overrides (gitignored)
.env.development    # Development defaults
.env.production     # Production values (set in CI)
```

## Feature Flags

Feature flags allow enabling/disabling features without redeployment. Flags are fetched from the API on app initialization and cached in memory.

### Available Flags

| Flag | Default | Description |
|------|---------|-------------|
| `ANALYTICS_V2` | `false` | Enable the new analytics dashboard with cohort analysis |
| `BULK_ORDER_EXPORT` | `true` | Allow bulk order CSV export |
| `USER_ACTIVITY_LOG` | `true` | Show activity log panel in user management |
| `PRODUCT_SEO_FIELDS` | `true` | Show SEO fields in product editor |
| `PRODUCT_VARIANTS` | `true` | Enable product variant management |
| `DARK_MODE` | `false` | Enable dark mode toggle |

### Flag Evaluation

```typescript
// Flags are loaded on app init and stored in context
const { isEnabled } = useFeatureFlags();

// Check a flag before rendering
if (isEnabled('ANALYTICS_V2')) {
  return <AnalyticsV2 />;
}
```

### Flag Override

For testing, flags can be overridden via URL parameters:

```
https://admin.shopflow.io?ff_ANALYTICS_V2=true&ff_DARK_MODE=true
```

## Health Checks

### Client-Side

The app pings the API health endpoint on load:

```
GET /api/admin/health → { status: "ok", version: "1.2.3" }
```

If the health check fails, a banner is shown warning of degraded service.

### Monitoring

- **Error tracking** — Sentry captures unhandled exceptions and API errors
- **Performance** — Core Web Vitals (LCP, FID, CLS) reported to analytics
- **Uptime** — CloudFront origin health checks with automatic failover

## Rollback

To rollback to a previous version:

1. Identify the target version's S3 prefix in the deployment log
2. Copy the previous `dist/` contents to the active S3 prefix
3. Invalidate the CloudFront distribution
4. Verify the rollback via the health check endpoint version

Rollbacks typically complete within 2-3 minutes including CDN propagation.
