# ShopFlow Web Store

The customer-facing storefront for the ShopFlow e-commerce platform. Built with React 19 and TypeScript, the web store delivers a fast, accessible shopping experience with server-side rendering support and progressive enhancement.

## Tech Stack

| Layer          | Technology                          |
|----------------|-------------------------------------|
| Framework      | React 19 + TypeScript 5.4           |
| Build          | Vite 6 with SWC                     |
| Styling        | CSS Modules + design tokens         |
| State          | React hooks + Context API           |
| Data fetching  | Custom hooks with fetch + caching   |
| Testing        | Vitest + React Testing Library      |
| E2E            | Playwright                          |
| Linting        | ESLint + Prettier                   |
| CI/CD          | GitHub Actions → Vercel             |

## Features

### Product Catalog
- Responsive grid/list view toggle
- Faceted filtering by category, price range, tags, and availability
- Sort by price, rating, newest, or relevance
- Infinite scroll with IntersectionObserver
- Lazy-loaded product images with blur-up placeholders

### Search
- Debounced search-as-you-type with autocomplete suggestions
- Recent search history stored in localStorage
- Highlighted search result snippets
- Keyboard navigation through suggestions (arrow keys + Enter)

### Shopping Cart
- Slide-in cart drawer with quantity controls
- Optimistic UI updates with rollback on failure
- localStorage persistence across sessions
- Real-time subtotal and item count in header badge

### Checkout
- Multi-step flow: Address → Shipping → Payment → Confirmation
- Saved address selection with default detection
- Three shipping tiers with live cost calculation
- Multiple payment methods (credit card, PayPal, Apple Pay, Google Pay)
- Order submission with loading state and error handling

### Authentication
- JWT-based auth with automatic token refresh
- Login/Register forms with validation
- Auth state persisted across page reloads
- Protected routes for account and order pages

### Accessibility
- Full keyboard navigation support
- ARIA landmarks, roles, and live regions
- Focus trapping in modal dialogs (cart drawer, modals)
- Screen reader announcements for dynamic content
- Respects `prefers-reduced-motion` and `prefers-color-scheme`

## Project Structure

```
src/
  components/     # UI components (ProductCard, Cart, Checkout, etc.)
  hooks/          # Custom React hooks (useCart, useProducts, useAuth, useSearch)
  services/       # API client, auth service, storage utilities
  types/          # TypeScript interfaces and type definitions
```

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

| Variable               | Description                    | Default                      |
|------------------------|--------------------------------|------------------------------|
| `VITE_API_BASE_URL`   | Backend API base URL           | `https://api.shopflow.dev`  |
| `VITE_CDN_URL`        | Image CDN prefix               | `https://cdn.shopflow.dev`  |
| `VITE_ANALYTICS_ID`   | Analytics tracking ID          | —                            |
| `VITE_SENTRY_DSN`     | Error tracking DSN             | —                            |

## Browser Support

- Chrome/Edge 90+
- Firefox 90+
- Safari 15+
- Mobile Safari / Chrome on iOS 15+

## Related Services

- **[ShopFlow API](../api/)** — Backend REST API powering the store
- **[ShopFlow Admin](../admin/)** — Merchant dashboard for managing products and orders
- **[ShopFlow Design System](../design-system/)** — Shared component library and tokens

## License

Private — ShopFlow Inc. All rights reserved.
