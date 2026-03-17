# ShopFlow Admin Panel

The ShopFlow Admin Panel is the internal dashboard used by operations, support, and management teams to run the ShopFlow e-commerce platform. It provides real-time visibility into orders, products, users, and business analytics.

## Features at a Glance

- **Dashboard** — Live overview of revenue, orders, and customer activity with trend indicators
- **Order Management** — Sortable/filterable order table with bulk actions and status tracking
- **Product Editor** — Full product CRUD with variant management, image uploads, and SEO fields
- **User Management** — User list with role assignment, ban/unban controls, and activity logs
- **Analytics** — Revenue charts, order volume trends, top product rankings, and conversion funnel
- **CSV Export** — Export any entity to CSV with configurable columns and streaming for large datasets

## Access Control

The admin panel enforces role-based access. Only users with one of the following roles can log in:

| Role | Description |
|------|-------------|
| `admin` | Full access to all features and settings |
| `manager` | Access to orders, products, analytics, and user management (no system config) |
| `support` | Read-only access to orders and users, can update order status |

Two-factor authentication (2FA) is strongly recommended and can be enforced per-role through the server configuration. See [permissions.md](./permissions.md) for the full permission matrix.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 with TypeScript |
| Build | Vite with SWC plugin |
| State | React hooks + Context API |
| Styling | CSS Modules + design tokens |
| Charts | Custom lightweight bar/funnel components |
| API Client | Fetch-based with interceptors and auth token management |
| Testing | Vitest + React Testing Library |

## Project Structure

```
src/
  components/      # Page-level UI components
    Dashboard.tsx      — Overview stats, charts, activity feed
    OrderTable.tsx     — Sortable order table with bulk actions
    ProductEditor.tsx  — Product create/edit form
    UserManager.tsx    — User list, roles, ban/unban
    AnalyticsChart.tsx — Revenue/order charts, funnel
  hooks/           # Data fetching and state hooks
    useOrders.ts       — Order list with polling
    useAnalytics.ts    — Analytics with date ranges
    useUsers.ts        — User search and pagination
  services/        # API layer and utilities
    api-client.ts      — Centralized HTTP client
    auth.ts            — Authentication and session management
    csv-export.ts      — CSV generation and download
  types/           # Shared TypeScript interfaces
    index.ts           — All domain types
```

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (proxies /api to backend)
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_API_URL` | `/api/admin` | Base URL for the admin API |
| `REACT_APP_POLL_INTERVAL` | `15000` | Order polling interval in milliseconds |
| `REACT_APP_2FA_REQUIRED` | `false` | Enforce 2FA on login |

## Related Documentation

- [Features Catalog](./features.md) — Detailed feature descriptions
- [Permissions](./permissions.md) — Role-based access control matrix
- [Analytics](./analytics.md) — Analytics features and data pipeline
- [Deployment](./deployment.md) — Build, deploy, and configuration guide
- [ADR-007: Real-time Updates](./adr-007-realtime-updates.md) — Architecture decision on polling vs WebSocket
