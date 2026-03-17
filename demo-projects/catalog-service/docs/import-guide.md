# Product Import Guide

This guide explains how to bulk import products into the ShopFlow Catalog Service from CSV and JSON files. Imports are processed transactionally — either all products in a batch succeed or the entire batch is rolled back.

## Supported Formats

### CSV Import

CSV files must include a header row with the following columns:

```csv
title,description,category,tags,variant_name,variant_price,variant_sku,variant_stock,image_url
"Wireless Mouse","Ergonomic wireless mouse with USB receiver","electronics","wireless,ergonomic,mouse","Default",29.99,"WMOUSE-DEF",500,"/products/wireless-mouse.jpg"
"Wireless Mouse","","","","Large",34.99,"WMOUSE-LG",200,""
```

**Multi-variant products** are represented as multiple rows with the same title. The first row must include all product-level fields; subsequent rows only need variant fields.

### JSON Import

JSON format supports the full product schema in a single object:

```json
[
  {
    "title": "Wireless Mouse",
    "description": "Ergonomic wireless mouse with USB receiver",
    "category": "electronics",
    "tags": ["wireless", "ergonomic", "mouse"],
    "variants": [
      {
        "name": "Default",
        "price": 29.99,
        "attributes": { "size": "standard" },
        "stockQuantity": 500
      },
      {
        "name": "Large",
        "price": 34.99,
        "attributes": { "size": "large" },
        "stockQuantity": 200
      }
    ],
    "images": ["/products/wireless-mouse.jpg"]
  }
]
```

## Import API

### Start Import

```http
POST /api/import/products
Content-Type: multipart/form-data

file: products.csv
format: csv
dryRun: false
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `file` | file | required | CSV or JSON file |
| `format` | string | auto-detect | `csv` or `json` |
| `dryRun` | boolean | false | Validate without persisting |
| `onConflict` | string | `skip` | `skip`, `update`, or `fail` |

### Import Response

```json
{
  "importId": "imp_abc123",
  "status": "completed",
  "stats": {
    "total": 150,
    "created": 142,
    "updated": 5,
    "skipped": 2,
    "failed": 1
  },
  "errors": [
    {
      "row": 47,
      "field": "variant_price",
      "message": "Price must be a positive number",
      "value": "-5.00"
    }
  ],
  "duration": 2340
}
```

## Validation Rules

All imported products are validated against the same rules as the create API:

### Product-Level

| Field | Rule | Error |
|-------|------|-------|
| `title` | Non-empty, max 200 chars | `Title is required` |
| `description` | Max 5000 chars | `Description too long` |
| `category` | Must match existing category slug | `Category not found: {value}` |
| `tags` | Array of strings, max 20 tags | `Too many tags (max 20)` |

### Variant-Level

| Field | Rule | Error |
|-------|------|-------|
| `name` | Non-empty, max 100 chars | `Variant name is required` |
| `price` | Positive number | `Price must be positive` |
| `stockQuantity` | Non-negative integer | `Stock must be non-negative` |
| `attributes` | Non-empty object | `At least one attribute required` |

### Cross-Row Validation

- **Duplicate titles** are resolved with slug suffixes (e.g., `wireless-mouse-2`)
- **Duplicate SKUs** within the import file cause a validation error
- **Missing variants** — products with zero variants are rejected

## Bulk Operations

### Bulk Status Transition

Transition multiple products in a single request:

```http
POST /api/products/bulk/status
```

```json
{
  "productIds": ["prod_abc", "prod_def", "prod_ghi"],
  "status": "active"
}
```

### Bulk Delete

```http
POST /api/products/bulk/delete
```

```json
{
  "productIds": ["prod_abc", "prod_def"],
  "permanently": false
}
```

When `permanently` is false, products are archived instead of deleted.

## Error Handling

### Partial Failures

When `onConflict` is set to `skip`, the import continues past validation errors and reports them in the response. Failed rows do not affect successfully imported products.

### Dry Run

Set `dryRun: true` to validate the entire file without persisting any changes. The response includes the same stats and errors as a real import, making it useful for pre-flight checks.

```bash
# Validate a CSV file before importing
curl -X POST /api/import/products \
  -F "file=@products.csv" \
  -F "dryRun=true"
```

### Rate Limits

Imports are limited to 10,000 products per request and 5 concurrent imports per account. Larger datasets should be split into batches. See the [pricing service](../src/services/pricing-service.ts) for how imported product prices are validated against discount rules.

## Best Practices

1. **Always dry-run first** — catch validation errors before committing
2. **Use JSON for complex products** — CSV struggles with multi-variant, multi-image products
3. **Import in category order** — ensure parent categories exist before importing child products
4. **Set status to draft** — review imported products before publishing to active
5. **Back up before bulk updates** — use the export API to create a snapshot first
