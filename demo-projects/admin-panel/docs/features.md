# Feature Catalog

This document describes every feature in the ShopFlow Admin Panel, organized by functional area.

## Dashboard

The dashboard is the landing page after login. It provides an at-a-glance overview of platform health.

### Stats Cards

Four key metrics are displayed as cards at the top of the dashboard:

- **Total Revenue** — Sum of all completed order amounts in the selected period, with percentage change versus the previous period
- **Total Orders** — Count of orders placed, with trend indicator
- **Average Order Value** — Revenue divided by order count
- **New Customers** — Unique customers who placed their first order in the period

Each card shows a positive (green) or negative (red) trend arrow based on period-over-period comparison.

### Recent Activity Feed

A real-time feed of the last 10 events across the platform:

- New orders placed
- Order status changes (shipped, delivered, cancelled)
- New user registrations
- Product inventory warnings

The feed auto-refreshes on a 15-second polling interval.

## Order Management

### Order Table

The order table is the primary view for managing orders. Features include:

- **Sorting** — Click any column header to sort ascending/descending. Supported columns: order number, total amount, status, date
- **Status Filter** — Dropdown to filter by order status (pending, confirmed, processing, shipped, delivered, cancelled, refunded)
- **Date Range Filter** — Start and end date pickers to narrow results
- **Pagination** — 20 orders per page with previous/next navigation and page indicator
- **Bulk Actions** — Select multiple orders via checkboxes, then apply bulk status changes or export

### Status Badges

Each order status has a color-coded badge for quick visual scanning:

| Status | Color | Meaning |
|--------|-------|---------|
| Pending | Amber | Order placed, awaiting confirmation |
| Confirmed | Blue | Payment confirmed |
| Processing | Purple | Being prepared for shipment |
| Shipped | Cyan | In transit |
| Delivered | Green | Successfully delivered |
| Cancelled | Red | Order cancelled |
| Refunded | Gray | Payment refunded |

## Product Editor

The product editor supports both creating new products and editing existing ones.

### Basic Fields

- **Title** — Product name (required, max 200 characters)
- **Description** — Rich text product description
- **Price** — Base price in store currency (required, minimum 0.01)
- **Compare-at Price** — Optional original price for showing discounts
- **SKU** — Stock keeping unit identifier (required, must be unique)
- **Published** — Toggle to control storefront visibility

### Variants

Products can have multiple variants (e.g., size, color combinations):

- Each variant has its own SKU, price, and inventory count
- Variant options are stored as key-value pairs (e.g., `size: "XL"`, `color: "Blue"`)
- Add/remove variants dynamically in the editor

### SEO Fields

- **SEO Title** — Custom page title for search engines (max 60 characters)
- **SEO Description** — Meta description (max 160 characters)

### Tags

Free-form tags for categorization and filtering. Tags are lowercase, deduplicated, and searchable.

## User Management

### User List

Displays all admin panel users with:

- Name, email, role, 2FA status, and account status (active/banned)
- Search bar with 300ms debounce for filtering by name or email
- Role filter dropdown
- Pagination (25 users per page)

### Role Assignment

Admins can change any user's role via an inline dropdown. Role changes take effect immediately and are logged in the audit trail.

### Ban/Unban

- Banning a user immediately revokes their session and prevents login
- A confirmation dialog is shown before banning
- Unbanning restores login access but does not create a new session

### Activity Log

Clicking "Activity" on a user row opens a side panel showing the last 50 actions by that user, including timestamps and IP addresses.

## Analytics

See [analytics.md](./analytics.md) for detailed analytics documentation.

Summary of analytics features:
- Revenue trend chart (bar chart by day/week/month)
- Order volume chart
- Top products by units sold and revenue
- Conversion funnel (visit → cart → checkout → purchase)
- Date range presets (7d, 30d, 90d, 12m) and custom ranges

## CSV Export

### Export Capabilities

Any entity (orders, products, users) can be exported to CSV:

- **Column selection** — Choose which fields to include
- **Delimiter** — Comma, semicolon, or tab
- **Headers** — Optional header row
- **Date range** — Filter exported data by date
- **Streaming** — Large datasets are fetched in 500-row pages to avoid memory issues

### Presets

Three one-click export presets are available:
- All Orders (order number, customer, status, amount, date)
- All Products (title, SKU, price, inventory, published status)
- All Users (name, email, role, ban status, 2FA, last login)

Files are downloaded as `{entity}-export-{timestamp}.csv`.
