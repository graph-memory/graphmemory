# Data Model

Entity relationships, schemas, and storage design for the ShopFlow Catalog Service. This document covers the core domain entities and how they relate to each other.

## Entity Relationship Diagram

```
┌──────────────┐     has many     ┌──────────────────┐
│   Category   │◄────────────────►│     Product      │
│              │                  │                  │
│ - id         │                  │ - id             │
│ - slug       │     belongs to   │ - slug           │
│ - name       │  ───────────────►│ - title          │
│ - parentId   │                  │ - description    │
│ - path       │                  │ - category       │
│ - depth      │                  │ - tags[]         │
│ - sortOrder  │                  │ - status         │
└──────┬───────┘                  │ - seo            │
       │ parent                   └────────┬─────────┘
       │                                   │ has many
       ▼                                   ▼
┌──────────────┐                  ┌──────────────────┐
│   Category   │                  │  ProductVariant   │
│   (parent)   │                  │                  │
└──────────────┘                  │ - sku            │
                                  │ - name           │
                                  │ - price          │
                                  │ - compareAtPrice │
                                  │ - attributes{}   │
                                  │ - stockQuantity  │
                                  └──────────────────┘

┌──────────────────┐   references  ┌──────────────────┐
│     Review       │──────────────►│     Product      │
│                  │               └──────────────────┘
│ - id             │
│ - productId      │
│ - userId         │
│ - rating (1-5)   │
│ - title          │
│ - body           │
│ - status         │
│ - verifiedPurchase│
└──────────────────┘
```

## Product

Products are the central entity of the catalog. Each product has a unique slug derived from its title (see [slug utility](../src/utils/slug.ts)) and can exist in one of three lifecycle states.

### Status Lifecycle

```
draft ──► active ──► archived
  ▲                      │
  └──────────────────────┘
```

- **draft** — Initial state. Not visible to customers. Can be edited freely.
- **active** — Published and visible in search results and category pages.
- **archived** — Removed from active listings but retained for order history.

### Variants

Products support multiple variants, each with its own SKU, price, and stock quantity. Variants are defined by a set of attribute key-value pairs:

```typescript
{
  sku: "TSHIRT-ORG-SM-WHT",
  name: "Small / White",
  price: 29.99,
  compareAtPrice: 39.99,  // Original price for "sale" display
  attributes: { size: "S", color: "White" },
  stockQuantity: 150,
  weight: 0.2  // kg, for shipping calculation
}
```

SKUs are auto-generated from the product slug and variant attributes using the `generateSku()` function in the [product model](../src/models/product.ts).

### SEO Metadata

Every product has SEO metadata for search engine optimization:

| Field | Description | Auto-generated |
|-------|-------------|----------------|
| `metaTitle` | Page title tag | `{title} \| ShopFlow` |
| `metaDescription` | Meta description (max 160 chars) | Truncated from description |
| `canonicalUrl` | Canonical URL path | `/products/{slug}` |
| `ogImage` | Open Graph image | — (manual) |

## Category Tree

Categories form a hierarchical tree using **materialized paths**. This design choice is documented in [ADR-004](adr-004-category-tree.md).

### Materialized Path Example

```
electronics                          (depth: 0)
electronics/phones                   (depth: 1)
electronics/phones/smartphones       (depth: 2)
electronics/phones/accessories       (depth: 2)
electronics/laptops                  (depth: 1)
```

### Path Operations

| Operation | Method | Complexity |
|-----------|--------|------------|
| Get children | Filter by `parentId` | O(n) |
| Get descendants | Prefix match on `path` | O(n) |
| Get ancestors | Split path + lookup | O(depth) |
| Move subtree | Update all descendant paths | O(descendants) |

Breadcrumb generation resolves each path segment against the category list. See `buildBreadcrumbs()` in the [category model](../src/models/category.ts).

## Review & Rating Aggregation

Reviews follow a moderation workflow before appearing on product pages.

### Moderation States

```
pending ──► approved
    │
    └──► rejected
```

### Rating Aggregation

Ratings are computed from approved reviews only. The aggregation includes:

- **averageRating** — Weighted average, rounded to 1 decimal place
- **totalReviews** — Count of approved reviews
- **distribution** — Histogram: `{ 1: count, 2: count, ..., 5: count }`

The `aggregateRatings()` function in the [review model](../src/models/review.ts) handles the computation.

## Inventory

Stock is tracked per SKU (variant level), not per product. See the [inventory service](../src/services/inventory-service.ts) for the reservation system.

### Stock Reservation Flow

```
1. Customer adds to cart  →  reserveStock(sku, qty, sessionId)
2. Reservation created    →  15-minute TTL
3a. Order placed          →  confirmReservation(id)  →  stock decremented
3b. Cart abandoned        →  TTL expires             →  stock released
```

## Pricing

Pricing is computed dynamically based on base variant price, bulk tiers, and discount rules. The [pricing service](../src/services/pricing-service.ts) applies the best available discount (discounts do not stack).

### Discount Priority

1. Bulk pricing tier (quantity-based unit price)
2. Best applicable discount rule (percentage, fixed, or buy-X-get-Y)

See [Pricing Rules](pricing-rules.md) for full configuration documentation.
