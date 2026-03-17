# API Reference

Complete endpoint documentation for the ShopFlow Catalog Service. All endpoints return JSON and accept `Content-Type: application/json` for request bodies.

## Base URL

```
https://api.shopflow.io/catalog/v1
```

## Authentication

All endpoints require a valid JWT bearer token in the `Authorization` header. Admin endpoints (moderation, delete) require the `catalog:admin` scope.

## Products

### List Products

```http
GET /api/products?category=electronics&status=active&limit=20&offset=0
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | — | Filter by category slug |
| `status` | string | — | Filter by status: `draft`, `active`, `archived` |
| `tags` | string | — | Comma-separated tag filter |
| `minPrice` | number | — | Minimum base price filter |
| `maxPrice` | number | — | Maximum base price filter |
| `offset` | number | 0 | Pagination offset |
| `limit` | number | 20 | Results per page (max 100) |

**Response:**

```json
{
  "items": [
    {
      "id": "prod_abc123",
      "slug": "wireless-bluetooth-headphones",
      "title": "Wireless Bluetooth Headphones",
      "status": "active",
      "variants": [{ "sku": "WIRELESS-BLK", "price": 79.99 }]
    }
  ],
  "pageInfo": {
    "hasNextPage": true,
    "totalCount": 142
  }
}
```

### Get Product

```http
GET /api/products/:id
```

Returns the full product with all variants, images, and SEO metadata. See the [data model](data-model.md) for the complete Product schema.

### Create Product

```http
POST /api/products
```

**Request Body:**

```json
{
  "title": "Organic Cotton T-Shirt",
  "description": "Premium organic cotton, available in 5 colors",
  "category": "clothing",
  "tags": ["organic", "cotton", "sustainable"],
  "variants": [
    {
      "name": "Small / White",
      "price": 29.99,
      "attributes": { "size": "S", "color": "White" },
      "stockQuantity": 150
    }
  ],
  "images": ["/products/tshirt-white-front.jpg"]
}
```

**Response:** `201 Created` with the full product object including generated `id`, `slug`, and `seo` fields.

### Update Product

```http
PUT /api/products/:id
```

Only mutable fields can be updated: `title`, `description`, `tags`, `images`, `seo`, `status`. The `slug`, `id`, and `createdAt` fields are immutable.

### Transition Status

```http
PATCH /api/products/:id/status
```

```json
{ "status": "active" }
```

Allowed transitions: `draft` → `active`, `active` → `archived`, `archived` → `draft`. Invalid transitions return `400 Bad Request`. See the [product service](../src/services/product-service.ts) for transition logic.

### Delete Product

```http
DELETE /api/products/:id
```

Returns `204 No Content` on success, `404 Not Found` if the product does not exist.

## Categories

### List Categories

```http
GET /api/categories?format=tree
```

When `format=tree`, returns nested category tree. Otherwise returns a flat sorted list. See the [category model](../src/models/category.ts) for the tree node structure.

### Get Category

```http
GET /api/categories/:id
```

Returns the category with a breadcrumb trail from root to the current node, useful for navigation. See [data model](data-model.md) for breadcrumb schema.

### Create Category

```http
POST /api/categories
```

```json
{
  "name": "Smartphones",
  "description": "Mobile phones and accessories",
  "parentId": "cat_electronics"
}
```

### Reorder Categories

```http
PATCH /api/categories/reorder
```

```json
{
  "parentId": "cat_electronics",
  "orderedIds": ["cat_phones", "cat_tablets", "cat_laptops"]
}
```

## Search

### Full-Text Search

```http
GET /api/search?q=wireless+headphones&category=electronics&inStock=true
```

Returns BM25-ranked results with facet distributions. See the [search algorithm](search-algorithm.md) for ranking details.

**Response:**

```json
{
  "results": [
    { "product": { "id": "prod_abc", "title": "..." }, "score": 8.42, "highlights": {} }
  ],
  "facets": {
    "category": [{ "value": "electronics", "count": 23 }],
    "tag": [{ "value": "wireless", "count": 15 }]
  },
  "pageInfo": { "totalCount": 23, "hasNextPage": false },
  "queryTime": 12
}
```

### Autocomplete

```http
GET /api/search/autocomplete?prefix=wire&limit=5
```

```json
{ "suggestions": ["wireless", "wired", "wire-free"] }
```

## Reviews

### List Reviews

```http
GET /api/products/:productId/reviews?status=approved&sortBy=rating
```

### Get Ratings

```http
GET /api/products/:productId/ratings
```

```json
{
  "averageRating": 4.3,
  "totalReviews": 87,
  "distribution": { "1": 2, "2": 5, "3": 10, "4": 30, "5": 40 }
}
```

### Submit Review

```http
POST /api/products/:productId/reviews
```

```json
{
  "userId": "user_xyz",
  "rating": 5,
  "title": "Excellent sound quality",
  "body": "Best headphones I've owned. The noise cancellation is impressive.",
  "verifiedPurchase": true
}
```

### Moderate Review

```http
PATCH /api/reviews/:id/moderate
```

```json
{ "status": "approved" }
```

Requires `catalog:admin` scope. Only pending reviews can be moderated.

## Error Responses

All error responses follow this format:

```json
{
  "error": "Human-readable error message",
  "errors": [{ "field": "rating", "message": "Rating must be between 1 and 5" }]
}
```

| Status Code | Meaning |
|-------------|---------|
| 400 | Validation error or invalid state transition |
| 404 | Resource not found |
| 401 | Missing or invalid authentication |
| 403 | Insufficient permissions |
| 500 | Internal server error |
