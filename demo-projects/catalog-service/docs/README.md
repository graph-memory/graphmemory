# Catalog Service

The Product Catalog service is one of the core microservices in the ShopFlow e-commerce platform. It manages the complete product lifecycle — from creation and categorization through search, reviews, inventory tracking, and pricing.

## Domain Model

The catalog service owns these primary entities:

- **Product** — The core entity with title, description, variants, images, SEO metadata, and lifecycle status (draft → active → archived)
- **Category** — Hierarchical tree structure using materialized paths for efficient navigation and filtering
- **Review** — Customer product reviews with moderation workflow and rating aggregation
- **Inventory** — Real-time stock tracking per SKU with reservation support for checkout sessions
- **Pricing** — Dynamic pricing engine supporting discounts, bulk tiers, and multi-currency conversion

## Features

### Product Management
- Full CRUD with slug generation and variant management
- Status lifecycle: `draft` → `active` → `archived` with validated transitions
- Multi-variant support (size, color, material combinations)
- SEO metadata auto-generation with customizable overrides
- Image management with CDN URL generation and responsive srcset

### Category Tree
- Hierarchical categories with unlimited nesting depth
- Materialized path storage for O(n) ancestor/descendant queries
- Breadcrumb generation for navigation
- Drag-and-drop reordering within parent groups
- See [ADR-004](adr-004-category-tree.md) for the design rationale

### Full-Text Search
- Custom BM25 ranking algorithm with title boosting
- Faceted search with real-time category and tag distributions
- Autocomplete suggestions from indexed terms
- See [Search Algorithm](search-algorithm.md) for technical details
- See [ADR-003](adr-003-search-engine.md) for why we chose custom BM25

### Reviews & Ratings
- Customer review submission with validation
- Moderation workflow (pending → approved/rejected)
- Verified purchase badges
- Rating aggregation with star distribution histograms

### Inventory
- Real-time stock levels per SKU
- Temporary reservations for checkout sessions (15-min TTL)
- Configurable low-stock alert thresholds
- Automatic stock decrement on order confirmation

### Pricing Engine
- Percentage and fixed-amount discounts
- Buy-X-Get-Y promotional rules
- Tiered bulk pricing schedules
- Multi-currency conversion with configurable exchange rates
- See [Pricing Rules](pricing-rules.md) for configuration details

## Quick Start

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Start in development mode
npm run dev

# Run the test suite
npm test
```

## API Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/products` | GET | List products with filters |
| `/api/products/:id` | GET | Get product details |
| `/api/products` | POST | Create a product |
| `/api/categories` | GET | List or tree view categories |
| `/api/search` | GET | Full-text product search |
| `/api/search/autocomplete` | GET | Search suggestions |
| `/api/products/:id/reviews` | GET/POST | List or submit reviews |

See the full [API Reference](api-reference.md) for request/response schemas and examples.

## Architecture

The service follows a layered architecture:

```
Controllers  →  Services  →  Models
     ↓              ↓           ↓
  HTTP I/O    Business Logic  Data + Factory
```

- **Controllers** handle HTTP request parsing, validation, and response formatting
- **Services** implement business rules, status transitions, and cross-entity operations
- **Models** define entity interfaces, factory functions, and validation rules
- **Utils** provide shared helpers (slug generation, pagination, image URLs)

## Related Documentation

- [API Reference](api-reference.md) — Full endpoint documentation with examples
- [Data Model](data-model.md) — Entity relationships and schema details
- [Search Algorithm](search-algorithm.md) — BM25 ranking and faceted search
- [Import Guide](import-guide.md) — Bulk product import from CSV/JSON
- [Pricing Rules](pricing-rules.md) — Discount and pricing configuration
