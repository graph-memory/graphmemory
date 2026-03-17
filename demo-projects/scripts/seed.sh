#!/usr/bin/env bash
# =============================================================================
# ShopFlow Demo — Seed Script
# Creates 50+ notes, 60+ tasks, 25+ skills, and cross-graph relations
# across backend workspace (api-gateway, catalog-service, order-service),
# frontend workspace (web-store, admin-panel), and standalone infra project.
#
# Usage: ./scripts/seed.sh [BASE_URL]
# Default BASE_URL: http://localhost:3000
# =============================================================================

set -euo pipefail

BASE="${1:-http://localhost:3000}"

# Workspace project IDs
BACKEND_PROJECTS=("api-gateway" "catalog-service" "order-service")
FRONTEND_PROJECTS=("web-store" "admin-panel")

# Helper: POST JSON (ignores 400 errors for idempotent re-runs)
post() {
  local project="$1" path="$2" data="$3"
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/projects/$project/$path" \
    -H 'Content-Type: application/json' \
    -d "$data")
  if [[ "$status" -ge 500 ]]; then
    echo "ERROR: POST $path returned $status" >&2
    return 1
  fi
  return 0
}

# Helper: DELETE
del() {
  local project="$1" path="$2"
  curl -sf -X DELETE "$BASE/api/projects/$project/$path" > /dev/null 2>&1 || true
}

echo "=== ShopFlow Demo Seed ==="
echo "Base URL: $BASE"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# CLEANUP — remove existing seed data
# ─────────────────────────────────────────────────────────────────────────────
echo "Cleaning up existing data..."

for proj in "${BACKEND_PROJECTS[@]}" "${FRONTEND_PROJECTS[@]}" "infra"; do
  # Delete all notes
  for id in $(curl -sf "$BASE/api/projects/$proj/knowledge/notes?limit=500" | jq -r '.results[].noteId // empty' 2>/dev/null); do
    del "$proj" "knowledge/notes/$id"
  done
  # Delete all tasks
  for id in $(curl -sf "$BASE/api/projects/$proj/tasks?limit=500" | jq -r '.results[].taskId // empty' 2>/dev/null); do
    del "$proj" "tasks/$id"
  done
  # Delete all skills
  for id in $(curl -sf "$BASE/api/projects/$proj/skills?limit=500" | jq -r '.results[].skillId // empty' 2>/dev/null); do
    del "$proj" "skills/$id"
  done
done

echo "Cleanup done."
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# NOTES — Knowledge Graph (50+ notes)
# Using api-gateway as entry point for backend workspace (shared graphs)
# Using web-store as entry point for frontend workspace (shared graphs)
# ─────────────────────────────────────────────────────────────────────────────
echo "Creating notes..."
BE="api-gateway"    # backend workspace entry
FE="web-store"      # frontend workspace entry
INF="infra"         # standalone

# --- Backend workspace notes (30) ---

post "$BE" "knowledge/notes" '{
  "title": "Architecture Decision: Microservices Split",
  "content": "We split the monolith into three backend services: api-gateway, catalog-service, and order-service. The gateway handles auth and routing, catalog owns product data, and order-service manages the purchase flow. Communication between services is synchronous HTTP for now, with plans to add async messaging via Redis Streams.",
  "tags": ["architecture", "adr", "microservices"]
}'

post "$BE" "knowledge/notes" '{
  "title": "JWT Token Strategy",
  "content": "Access tokens are short-lived (15 min) JWTs containing userId and roles. Refresh tokens are opaque, stored server-side in session store, rotated on each use. Token blacklist checked on every request via auth-guard middleware. We chose this hybrid approach over pure stateless JWT because we need instant revocation for security incidents.",
  "tags": ["security", "auth", "jwt"]
}'

post "$BE" "knowledge/notes" '{
  "title": "API Gateway Rate Limiting Design",
  "content": "Token bucket algorithm with two tiers: per-IP (100 req/min for anonymous) and per-user (500 req/min for authenticated). Implemented in rate-limiter middleware. Headers X-RateLimit-Remaining and X-RateLimit-Reset returned on every response. 429 response includes Retry-After header. Rate limit state stored in-memory (will migrate to Redis for multi-instance).",
  "tags": ["rate-limiting", "gateway", "performance"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Circuit Breaker Pattern for Service Calls",
  "content": "The proxy-controller uses a circuit breaker when forwarding requests to catalog and order services. States: closed (normal), open (all calls fail-fast for 30s), half-open (one probe request). Thresholds: 5 failures in 60s to open. This prevents cascade failures when a downstream service is degraded.",
  "tags": ["resilience", "gateway", "adr"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Product Search Algorithm",
  "content": "Search uses BM25 ranking with field-level boosting: title (3x), description (1x), tags (2x). Results are post-filtered by category, price range, and stock availability. Autocomplete uses prefix matching on a separate trigram index. We chose custom BM25 over Elasticsearch to avoid operational complexity for the current scale (<100K products).",
  "tags": ["search", "catalog", "algorithm"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Category Tree Implementation",
  "content": "Categories use materialized path pattern: each category stores its full path (e.g., electronics/phones/smartphones). This enables O(1) ancestor queries and efficient subtree listing with LIKE prefix match. Trade-off: moves require updating all descendants paths. Since category structure changes rarely, this is acceptable.",
  "tags": ["catalog", "data-model", "adr"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Inventory Reservation Strategy",
  "content": "When a user adds items to cart, we create soft reservations (10 min TTL). On checkout, reservations become hard locks until payment completes. If payment fails or times out, locks are released. This prevents overselling while allowing cart abandonment to free stock. Reservation state tracked in inventory-service.",
  "tags": ["inventory", "catalog", "order"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Pricing Engine Rules",
  "content": "Price calculation follows: base_price → apply bulk discount tiers → apply promo codes → add tax → add shipping. Bulk discounts: 5% for 10+, 10% for 50+, 15% for 100+ units. Promo codes support percentage and fixed amount types. Tax calculated by region using tax-service lookup. All prices stored and computed in cents to avoid floating point issues.",
  "tags": ["pricing", "catalog", "order"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Order State Machine",
  "content": "Order lifecycle: pending → confirmed → processing → shipped → delivered → completed. Side transitions: any → cancelled (before shipped), delivered → returned. Each transition triggers notifications and inventory updates. State machine enforced in order-service.ts with explicit allowed transitions map. Invalid transitions return 409 Conflict.",
  "tags": ["order", "state-machine", "domain"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Payment Integration Architecture",
  "content": "Payment processing via Stripe-like interface in payment-service. Key design: idempotency keys prevent duplicate charges (key = orderId + attempt number). Webhook callbacks confirm payment status asynchronously. We store payment intent on creation, then update status via webhook. Refunds go through same flow in reverse. All amounts in smallest currency unit (cents).",
  "tags": ["payment", "order", "integration"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Shipping Rate Calculation",
  "content": "Shipping cost based on: destination zone (3 zones), total weight, package dimensions, and shipping speed (standard/express/overnight). Rates stored in config, updated quarterly. Free shipping threshold: $50 for standard, $100 for express. International shipping adds customs handling fee. Rate calculation happens in shipping-service with caching (1 hour TTL).",
  "tags": ["shipping", "order", "pricing"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Service Communication Patterns",
  "content": "Current: synchronous HTTP between services via api-gateway proxy. Gateway adds correlation ID to all forwarded requests for distributed tracing. Timeouts: 5s for catalog reads, 10s for order writes, 30s for payment operations. Future: add Redis Streams for async events (order placed, payment confirmed, shipment updated) to decouple services.",
  "tags": ["architecture", "communication", "gateway"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Database Strategy per Service",
  "content": "Each service owns its database (database-per-service pattern). Catalog: PostgreSQL (relational, good for product attributes and search). Orders: PostgreSQL (ACID for financial transactions). Gateway: Redis (session store, rate limit counters). No cross-service database queries — all data accessed via APIs. This enables independent scaling and deployment.",
  "tags": ["database", "architecture", "adr"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Error Handling Convention",
  "content": "All services follow consistent error response format: { error: string, code: string, details?: object }. HTTP status codes: 400 (validation), 401 (auth), 403 (forbidden), 404 (not found), 409 (conflict/state), 429 (rate limit), 500 (internal). Error handler middleware catches all unhandled errors, logs stack trace, returns sanitized response.",
  "tags": ["error-handling", "convention", "api"]
}'

post "$BE" "knowledge/notes" '{
  "title": "API Versioning Strategy",
  "content": "URL path versioning: /api/v1/products. Breaking changes get new version. Non-breaking additions (new optional fields) stay in current version. Gateway routes to correct service version. Deprecation: old versions supported for 6 months with Sunset header. Currently only v1 exists.",
  "tags": ["api", "versioning", "gateway"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Logging and Observability",
  "content": "Structured JSON logging via logger utility in each service. Fields: timestamp, level, service, correlationId, method, path, statusCode, durationMs. Log levels: error (alerts), warn (degradation), info (requests), debug (internal). Logs shipped to CloudWatch. Metrics: request count, latency p50/p95/p99, error rate per endpoint. Prometheus scrape endpoint at /metrics.",
  "tags": ["observability", "logging", "monitoring"]
}'

post "$BE" "knowledge/notes" '{
  "title": "CORS Configuration",
  "content": "CORS configured in api-gateway cors-middleware. Allowed origins: web-store domain, admin-panel domain, localhost for dev. Methods: GET, POST, PUT, DELETE, PATCH. Headers: Content-Type, Authorization, X-Request-ID. Credentials: true (for cookie-based session fallback). Max-age: 86400 (24h preflight cache). No wildcard origins in production.",
  "tags": ["security", "cors", "gateway"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Product Import Pipeline",
  "content": "Bulk product import supports CSV and JSON formats. Pipeline: upload → validate schema → check duplicates (by SKU) → enrich (generate slugs, compute prices) → batch insert. Validation rules: required fields (title, price, SKU), price > 0, unique SKU. Errors collected per row, partial import supported. Max batch size: 10,000 products.",
  "tags": ["catalog", "import", "pipeline"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Review Moderation System",
  "content": "Product reviews go through moderation pipeline: submitted → pending_review → approved/rejected. Auto-approve if user has 5+ approved reviews. Flag for manual review if: contains URLs, profanity filter triggered, or rating is 1 star. Approved reviews update product average rating (weighted moving average). Rating displayed as 1-5 stars with 0.5 precision.",
  "tags": ["catalog", "reviews", "moderation"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Tax Calculation Rules",
  "content": "Tax rates by region: US states have varying rates (0-10.25%), EU uses VAT (17-27% by country), UK 20% standard. Tax-exempt categories: books (some US states), children clothing (UK). Digital goods: taxed at buyer location (EU MOSS rules). Tax calculated in order-service using tax utility, rates updated monthly from external tax API.",
  "tags": ["tax", "order", "compliance"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Cart Merge Strategy",
  "content": "When anonymous user logs in, their anonymous cart merges with their saved cart. Rules: if same product in both carts, take higher quantity (max 10). If merged cart exceeds 50 items, keep most recently added. Cart expiration: anonymous 24h, authenticated 30 days. Merge happens in cart-service on login event.",
  "tags": ["cart", "order", "ux"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Webhook Delivery System",
  "content": "Order events (placed, paid, shipped, delivered) can trigger webhooks to external systems. Delivery: POST with HMAC-SHA256 signature in X-Signature header. Retry: exponential backoff (1s, 4s, 16s, 64s, 256s) with max 5 attempts. Dead letter queue after max retries. Webhook management API: register URL, select events, view delivery logs.",
  "tags": ["webhooks", "integration", "order"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Session Management Details",
  "content": "Sessions stored in Redis (via session-service in gateway). Session contains: userId, roles, cartId, lastActivity, deviceInfo. TTL: 24h sliding window (extended on each request). Max sessions per user: 5 (oldest evicted). Session rotation on privilege escalation (e.g., after payment). Cookie: HttpOnly, Secure, SameSite=Strict.",
  "tags": ["session", "security", "gateway"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Image Handling Pipeline",
  "content": "Product images uploaded to S3, processed via image-resize utility. Generated sizes: thumbnail (150x150), medium (600x600), large (1200x1200), zoom (2400x2400). Format: WebP with JPEG fallback. CDN (CloudFront) serves all images. URL pattern: /images/{productId}/{size}.webp. Lazy loading in web-store with blur placeholder (LQIP).",
  "tags": ["images", "catalog", "cdn"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Currency Handling Convention",
  "content": "All monetary values stored as integers in smallest unit (cents for USD, pence for GBP). Display formatting handled by frontend. Supported currencies: USD, EUR, GBP, JPY. Exchange rates fetched daily from ECB API, cached in pricing-service. Multi-currency: products priced in USD, converted at checkout based on user locale.",
  "tags": ["currency", "pricing", "convention"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Notification System Architecture",
  "content": "Notification service in order-service sends emails via SendGrid API. Templates: order confirmation, shipping update, delivery confirmation, refund processed, review request (7 days after delivery). Template rendering: Handlebars with order/user data. Queue: notifications enqueued on order state transitions, processed async. Rate limit: max 10 emails per user per day.",
  "tags": ["notifications", "order", "email"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Refund Processing Flow",
  "content": "Refund flow: customer requests → support reviews → approved/rejected → payment refund initiated → refund confirmed (webhook) → inventory restocked (if returned). Partial refunds supported (per line item). Refund window: 30 days from delivery. Auto-approve for orders under $50 if customer has good history (no prior abuse).",
  "tags": ["refund", "order", "payment"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Load Balancing Strategy",
  "content": "API Gateway sits behind AWS ALB with round-robin. Each backend service runs 2-4 instances behind internal NLB. Health checks: /health endpoint every 10s, 3 consecutive failures to remove instance. Sticky sessions not used (stateless services). Connection draining: 30s on scale-down. Future: consider service mesh (Istio) for more sophisticated routing.",
  "tags": ["load-balancing", "infrastructure", "scaling"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Data Validation Approach",
  "content": "Input validation at two layers: 1) controller level — schema validation (required fields, types, formats) using Zod-like validators. 2) service level — business validation (e.g., price > 0, valid category path, stock available). Controller validation returns 400, service validation returns 409 or domain-specific errors. Never trust client input.",
  "tags": ["validation", "security", "convention"]
}'

post "$BE" "knowledge/notes" '{
  "title": "Slug Generation Strategy",
  "content": "URL slugs for products and categories: lowercase, spaces to hyphens, strip special chars, max 80 chars. Dedup with numeric suffix (-2, -3). Slug immutable after creation (changing would break URLs/SEO). Old slugs stored as redirects. Implementation in catalog slug utility, shared by product and category services.",
  "tags": ["slug", "catalog", "seo"]
}'

# --- Frontend workspace notes (12) ---

post "$FE" "knowledge/notes" '{
  "title": "Component Architecture Guidelines",
  "content": "React components follow atomic design: atoms (Button, Input), molecules (SearchBar, ProductCard), organisms (Header, Cart), templates (ProductListPage), pages (routes). Props interface defined per component. No prop drilling beyond 2 levels — use context or hooks. Components are pure/presentational where possible, hooks contain logic.",
  "tags": ["components", "architecture", "react"]
}'

post "$FE" "knowledge/notes" '{
  "title": "State Management Strategy",
  "content": "No Redux — hooks-based state management. Local state: useState for component-specific. Shared state: custom hooks (useCart, useAuth) with Context underneath. Server state: custom hooks with fetch + cache (similar to React Query patterns). Cart persisted to localStorage, synced on login. Auth state in memory + localStorage token.",
  "tags": ["state", "hooks", "architecture"]
}'

post "$FE" "knowledge/notes" '{
  "title": "API Client Design",
  "content": "Shared api-client in both web-store and admin-panel. Features: base URL from env, auto-attach Authorization header, retry on 5xx (3 attempts, exponential backoff), refresh token on 401, request/response interceptors. Error normalization: all errors converted to { message, code, status } format. TypeScript generics for typed responses.",
  "tags": ["api-client", "http", "typescript"]
}'

post "$FE" "knowledge/notes" '{
  "title": "Accessibility Standards",
  "content": "Target: WCAG 2.1 AA compliance. Key areas: semantic HTML, ARIA labels on interactive elements, keyboard navigation (tab order, focus management), color contrast ratio > 4.5:1, screen reader testing with NVDA/VoiceOver. Checkout flow fully keyboard-accessible. Product images have alt text from product title + key attributes. Error messages announced via aria-live.",
  "tags": ["a11y", "accessibility", "standards"]
}'

post "$FE" "knowledge/notes" '{
  "title": "Performance Optimization Checklist",
  "content": "Core Web Vitals targets: LCP < 2.5s, FID < 100ms, CLS < 0.1. Techniques: code splitting per route, lazy loading below-fold components, image optimization (WebP + LQIP), font subsetting, critical CSS inline, prefetch on hover. Bundle analysis: keep main chunk < 100KB gzipped. Lighthouse CI in PR checks.",
  "tags": ["performance", "web-vitals", "optimization"]
}'

post "$FE" "knowledge/notes" '{
  "title": "Internationalization Setup",
  "content": "i18n via react-intl. Default locale: en-US. Supported: en-US, es-ES, fr-FR, de-DE, ja-JP. Translation keys in JSON files per locale. Number/currency formatting via Intl API. Date formatting: relative for recent (2 hours ago), absolute for older. RTL support prepared but not yet needed. Translation workflow: developers add en-US keys, translation team fills others.",
  "tags": ["i18n", "localization", "frontend"]
}'

post "$FE" "knowledge/notes" '{
  "title": "Checkout Flow Design",
  "content": "Multi-step checkout: 1) Cart review 2) Shipping address (saved addresses + new) 3) Shipping method selection 4) Payment (card form via Stripe Elements) 5) Order confirmation. Progress indicator at top. Back navigation preserves state. Validation per step before advancing. Guest checkout supported (creates account after payment with email). Mobile: single column, sticky CTA.",
  "tags": ["checkout", "ux", "web-store"]
}'

post "$FE" "knowledge/notes" '{
  "title": "Search UX Patterns",
  "content": "Search bar in header with instant suggestions (debounce 300ms). Suggestion types: products (image + title + price), categories (icon + name), recent searches. Results page: faceted filters (category, price range, rating, availability) in sidebar, sort options (relevance, price asc/desc, newest, rating). Infinite scroll with skeleton loading. No results: suggest alternative terms.",
  "tags": ["search", "ux", "web-store"]
}'

post "$FE" "knowledge/notes" '{
  "title": "Admin Dashboard Design",
  "content": "Dashboard shows: today revenue, total orders, new users, pending orders. Charts: revenue trend (7/30/90 days), orders by status (pie), top products (bar). Recent activity feed: last 20 events (new order, payment, review). Auto-refresh every 60s. Responsive: cards stack on mobile, charts resize. Dark mode support via CSS variables.",
  "tags": ["dashboard", "admin", "ux"]
}'

post "$FE" "knowledge/notes" '{
  "title": "Admin Permissions Matrix",
  "content": "Roles: admin (full access), manager (orders + products, no user management), support (view orders, process refunds, no product editing), viewer (read-only dashboards). Permission check via useAuth hook role field. API enforces same permissions server-side. Role assignment: only admin can change roles. Audit log tracks all admin actions.",
  "tags": ["permissions", "admin", "security"]
}'

post "$FE" "knowledge/notes" '{
  "title": "CSV Export Implementation",
  "content": "Admin panel CSV export for orders, products, and users. Implementation: client-side generation for small datasets (<1000 rows), server-side streaming for large. Columns configurable per export type. Date range filter for orders. Export includes all filters currently applied in UI. Filename: {type}_{date}_{filters}.csv. Progress indicator for large exports.",
  "tags": ["export", "admin", "data"]
}'

post "$FE" "knowledge/notes" '{
  "title": "Real-time Updates Strategy",
  "content": "Admin panel uses polling (30s interval) for order status updates. Web-store uses polling (60s) for cart sync. Considered WebSocket but polling is simpler and sufficient for our scale. SSE evaluated but poor proxy support. Future: add WebSocket for admin when real-time becomes critical (e.g., live order dashboard during flash sales).",
  "tags": ["real-time", "polling", "adr"]
}'

# --- Infra standalone notes (10) ---

post "$INF" "knowledge/notes" '{
  "title": "AWS Infrastructure Overview",
  "content": "ShopFlow runs on AWS us-east-1 (primary) with us-west-2 (DR). Core: EKS cluster (3 nodes, m5.xlarge), RDS PostgreSQL (db.r6g.large, Multi-AZ), ElastiCache Redis (cache.r6g.large), S3 (product images), CloudFront CDN. Networking: VPC with public/private subnets, NAT Gateway, VPN for admin access. Cost: ~$2500/month at current scale.",
  "tags": ["aws", "infrastructure", "overview"]
}'

post "$INF" "knowledge/notes" '{
  "title": "Terraform Module Structure",
  "content": "Terraform code organized as modules: vpc, eks, rds, redis, s3, cloudfront, iam, monitoring. State stored in S3 with DynamoDB locking. Workspaces: dev, staging, prod. Variables per workspace in tfvars files. CI/CD runs terraform plan on PR, terraform apply on merge to main. Drift detection weekly via scheduled pipeline.",
  "tags": ["terraform", "iac", "modules"]
}'

post "$INF" "knowledge/notes" '{
  "title": "Kubernetes Namespace Strategy",
  "content": "Namespaces: backend (api-gateway, catalog, order services), frontend (web-store, admin-panel static serving), monitoring (prometheus, grafana, alertmanager), ingress (nginx ingress controller). Resource quotas per namespace. Network policies: backend services can communicate with each other, frontend only reaches backend via ingress. Secrets managed via External Secrets Operator + AWS Secrets Manager.",
  "tags": ["kubernetes", "namespaces", "networking"]
}'

post "$INF" "knowledge/notes" '{
  "title": "CI/CD Pipeline Design",
  "content": "GitHub Actions workflows per service. Stages: lint → test → build Docker image → push to ECR → deploy to dev (auto) → deploy to staging (auto) → deploy to prod (manual approval). Branch strategy: feature/* → PR → main. Rollback: revert to previous ECR image tag via kubectl set image. Canary deployments for prod (10% → 50% → 100%).",
  "tags": ["ci-cd", "deployment", "github-actions"]
}'

post "$INF" "knowledge/notes" '{
  "title": "Monitoring and Alerting Setup",
  "content": "Prometheus scrapes all services /metrics every 15s. Key metrics: request_duration_seconds, request_total, error_total, active_connections. Grafana dashboards per service + overview. Alert rules: error rate > 5% (warn), > 10% (critical), p99 latency > 2s (warn), > 5s (critical), pod restarts > 3 in 10min. PagerDuty integration for critical alerts. On-call rotation: weekly.",
  "tags": ["monitoring", "prometheus", "alerting"]
}'

post "$INF" "knowledge/notes" '{
  "title": "Incident Response Procedure",
  "content": "Severity levels: SEV1 (full outage, page immediately), SEV2 (partial degradation, page during business hours), SEV3 (minor issue, next business day). Response: 1) acknowledge 2) assess impact 3) communicate status 4) mitigate 5) resolve 6) post-mortem within 48h. Communication: Slack #incidents channel, status page update for SEV1/SEV2. Blameless post-mortems mandatory for SEV1.",
  "tags": ["incident", "runbook", "process"]
}'

post "$INF" "knowledge/notes" '{
  "title": "Database Backup Strategy",
  "content": "RDS automated backups: daily snapshots, 7-day retention. Point-in-time recovery: 5-minute granularity. Monthly manual snapshots kept for 1 year. Cross-region replication to us-west-2 for DR. Recovery RTO: 1 hour, RPO: 5 minutes. Backup verification: monthly restore test to staging. Redis: AOF persistence + hourly RDB snapshots.",
  "tags": ["database", "backup", "disaster-recovery"]
}'

post "$INF" "knowledge/notes" '{
  "title": "Scaling Policies",
  "content": "HPA (Horizontal Pod Autoscaler) on all services. Metrics: CPU > 70% target, custom metric: request_queue_depth > 100. Min replicas: 2 (prod), 1 (staging/dev). Max replicas: 10 (api-gateway), 8 (catalog), 6 (order). Scale-up: 60s cooldown. Scale-down: 300s cooldown. Node autoscaler: 3-10 nodes based on pod pressure. Load testing: monthly with k6, target 1000 RPS.",
  "tags": ["scaling", "hpa", "performance"]
}'

post "$INF" "knowledge/notes" '{
  "title": "Secrets Management",
  "content": "All secrets in AWS Secrets Manager. External Secrets Operator syncs to K8s Secrets every 60s. Rotation: database passwords quarterly, API keys on compromise. JWT secret: rotated monthly with 2-key overlap (old key valid for 24h after rotation). CI/CD secrets: GitHub Environments with required reviewers for prod. Never commit secrets — pre-commit hook checks for patterns.",
  "tags": ["secrets", "security", "aws"]
}'

post "$INF" "knowledge/notes" '{
  "title": "Cost Optimization Findings",
  "content": "Monthly cost breakdown: EKS $400, RDS $600, ElastiCache $300, EC2 (nodes) $800, S3+CloudFront $150, other $250. Optimizations applied: Reserved Instances for RDS (35% saving), Spot Instances for dev/staging nodes (60% saving), S3 Intelligent-Tiering for old images. Potential savings: right-size catalog-service (currently over-provisioned), consolidate dev databases.",
  "tags": ["cost", "optimization", "aws"]
}'

echo "Notes created: 52"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# TASKS (60+ tasks)
# ─────────────────────────────────────────────────────────────────────────────
echo "Creating tasks..."

# --- Backend workspace tasks (40) ---

# Critical
post "$BE" "tasks" '{"title": "Fix Payment Webhook Double Processing", "description": "Stripe webhook occasionally fires twice for same event. Need idempotency check on payment callback. Currently causing duplicate order confirmations and double inventory decrement.", "status": "in_progress", "priority": "critical", "tags": ["bug", "payment", "order-service"]}'
post "$BE" "tasks" '{"title": "Implement Rate Limit Redis Backend", "description": "Current in-memory rate limiter doesnt work with multiple gateway instances. Migrate to Redis-based counter with MULTI/EXEC for atomicity.", "status": "todo", "priority": "critical", "tags": ["gateway", "rate-limiting", "scaling"]}'
post "$BE" "tasks" '{"title": "Fix Inventory Overselling on High Concurrency", "description": "Under load testing, found race condition in inventory reservation. Two concurrent checkouts can reserve same last item. Need pessimistic locking or compare-and-swap.", "status": "todo", "priority": "critical", "tags": ["bug", "inventory", "catalog-service"]}'

# High
post "$BE" "tasks" '{"title": "Implement Product Full-Text Search", "description": "Add BM25-based search across product title, description, and tags. Include faceted filtering by category, price range, and rating. Autocomplete for search suggestions.", "status": "in_progress", "priority": "high", "tags": ["feature", "search", "catalog-service"]}'
post "$BE" "tasks" '{"title": "Add Shipping Rate Calculator", "description": "Implement shipping cost calculation based on destination zone, weight, dimensions, and speed. Include free shipping threshold logic.", "status": "in_progress", "priority": "high", "tags": ["feature", "shipping", "order-service"]}'
post "$BE" "tasks" '{"title": "Circuit Breaker for Downstream Services", "description": "Add circuit breaker pattern to proxy-controller for catalog and order service calls. Prevent cascade failures during service degradation.", "status": "review", "priority": "high", "tags": ["resilience", "gateway", "feature"]}'
post "$BE" "tasks" '{"title": "Product Import CSV Pipeline", "description": "Build bulk product import from CSV/JSON. Include validation, dedup by SKU, slug generation, batch insert. Max 10K products per import.", "status": "todo", "priority": "high", "tags": ["feature", "import", "catalog-service"]}'
post "$BE" "tasks" '{"title": "Implement Refresh Token Rotation", "description": "Rotate refresh tokens on each use. Store token family to detect reuse (potential theft). Invalidate entire family on reuse detection.", "status": "done", "priority": "high", "tags": ["security", "auth", "gateway"]}'
post "$BE" "tasks" '{"title": "Add Order Cancellation Flow", "description": "Allow order cancellation before shipping. Cancel reverses payment (refund), releases inventory reservation, sends notification. State machine transition: confirmed/processing → cancelled.", "status": "in_progress", "priority": "high", "tags": ["feature", "order", "order-service"]}'
post "$BE" "tasks" '{"title": "Webhook Delivery System", "description": "Implement webhook delivery for order events. HMAC-SHA256 signatures, exponential backoff retry, dead letter queue. Admin API for webhook management.", "status": "todo", "priority": "high", "tags": ["feature", "webhooks", "order-service"]}'
post "$BE" "tasks" '{"title": "Multi-Currency Support", "description": "Add currency conversion at checkout. Fetch exchange rates from ECB API daily. Display prices in user locale currency. Store all amounts in USD internally.", "status": "backlog", "priority": "high", "tags": ["feature", "pricing", "catalog-service"]}'
post "$BE" "tasks" '{"title": "Review Moderation Pipeline", "description": "Implement review moderation: auto-approve for trusted users, flag for manual review based on content analysis, profanity filter.", "status": "todo", "priority": "high", "tags": ["feature", "reviews", "catalog-service"]}'

# Medium
post "$BE" "tasks" '{"title": "Add Request Correlation IDs", "description": "Generate unique correlation ID per request in gateway, propagate to all downstream service calls via X-Correlation-ID header. Include in all log entries.", "status": "done", "priority": "medium", "tags": ["observability", "logging", "gateway"]}'
post "$BE" "tasks" '{"title": "Implement Cart Merge on Login", "description": "When anonymous user logs in, merge anonymous cart with saved cart. Handle conflicts (same product in both carts).", "status": "todo", "priority": "medium", "tags": ["feature", "cart", "order-service"]}'
post "$BE" "tasks" '{"title": "Add Prometheus Metrics Endpoint", "description": "Expose /metrics endpoint on all services with request duration histograms, error counters, and active connection gauges.", "status": "done", "priority": "medium", "tags": ["monitoring", "observability"]}'
post "$BE" "tasks" '{"title": "Implement Bulk Pricing Tiers", "description": "Add quantity-based discount tiers to pricing engine. 5% for 10+, 10% for 50+, 15% for 100+ units. Configured per product.", "status": "review", "priority": "medium", "tags": ["feature", "pricing", "catalog-service"]}'
post "$BE" "tasks" '{"title": "Add Health Check Endpoints", "description": "Implement /health (basic), /ready (dependencies checked), /live (process alive) endpoints on all services for K8s probes.", "status": "done", "priority": "medium", "tags": ["infrastructure", "health"]}'
post "$BE" "tasks" '{"title": "Product Variant Support", "description": "Add product variants (size, color, material). Each variant has own SKU, price, stock. Parent product aggregates variant data for display.", "status": "backlog", "priority": "medium", "tags": ["feature", "catalog", "data-model"]}'
post "$BE" "tasks" '{"title": "Implement Promo Code System", "description": "Support percentage and fixed-amount promo codes. Codes have: usage limit, expiry date, minimum order value, applicable categories. Validation in order-service.", "status": "backlog", "priority": "medium", "tags": ["feature", "pricing", "order-service"]}'
post "$BE" "tasks" '{"title": "Add Structured Logging", "description": "Replace console.log with structured JSON logger. Include service name, correlation ID, timestamp, log level. Configure log level via environment variable.", "status": "done", "priority": "medium", "tags": ["logging", "observability"]}'
post "$BE" "tasks" '{"title": "Database Connection Pooling", "description": "Configure connection pool for PostgreSQL in catalog and order services. Min 5, max 20 connections. Health check interval 30s. Connection timeout 5s.", "status": "done", "priority": "medium", "tags": ["database", "performance"]}'
post "$BE" "tasks" '{"title": "Tax Calculation by Region", "description": "Implement tax lookup service supporting US state taxes, EU VAT, and UK VAT. Tax-exempt categories for certain product types.", "status": "in_progress", "priority": "medium", "tags": ["feature", "tax", "order-service"]}'
post "$BE" "tasks" '{"title": "API Response Pagination", "description": "Standardize pagination across all list endpoints. Support both cursor-based (default) and offset pagination. Include totalCount, hasNext, nextCursor in response.", "status": "done", "priority": "medium", "tags": ["api", "convention"]}'
post "$BE" "tasks" '{"title": "Add Request Validation Middleware", "description": "Create reusable validation middleware using schema definitions. Validate body, query params, and path params. Return detailed 400 errors.", "status": "done", "priority": "medium", "tags": ["validation", "middleware", "gateway"]}'

# Low
post "$BE" "tasks" '{"title": "Add OpenAPI Spec Generation", "description": "Auto-generate OpenAPI 3.0 spec from route definitions. Serve at /api/docs. Include request/response schemas, auth requirements, examples.", "status": "backlog", "priority": "low", "tags": ["documentation", "api"]}'
post "$BE" "tasks" '{"title": "Implement Graceful Shutdown", "description": "Handle SIGTERM: stop accepting new requests, drain existing connections (30s timeout), close database pools, flush logs. For zero-downtime K8s rolling updates.", "status": "todo", "priority": "low", "tags": ["infrastructure", "reliability"]}'
post "$BE" "tasks" '{"title": "Add Product SEO Metadata", "description": "Include SEO fields on products: meta title, meta description, canonical URL, Open Graph tags. Auto-generate defaults from product title and description.", "status": "backlog", "priority": "low", "tags": ["seo", "catalog-service"]}'
post "$BE" "tasks" '{"title": "Refactor Service Communication to Events", "description": "Replace some synchronous HTTP calls between services with async events via Redis Streams. Starting with: order.placed → inventory update, payment.confirmed → order status.", "status": "backlog", "priority": "low", "tags": ["architecture", "events", "refactor"]}'

# --- Frontend workspace tasks (15) ---

post "$FE" "tasks" '{"title": "Implement Checkout Flow", "description": "Build multi-step checkout: cart review → address → shipping method → payment (Stripe Elements) → confirmation. Mobile-responsive, keyboard accessible.", "status": "in_progress", "priority": "critical", "tags": ["feature", "checkout", "web-store"]}'
post "$FE" "tasks" '{"title": "Build Product Search with Autocomplete", "description": "Search bar in header with debounced suggestions. Show product results with images, category suggestions, and recent searches. Results page with faceted filters.", "status": "in_progress", "priority": "high", "tags": ["feature", "search", "web-store"]}'
post "$FE" "tasks" '{"title": "Admin Order Management Table", "description": "Sortable/filterable data table for orders. Columns: order ID, customer, total, status, date. Bulk actions: mark shipped, export CSV. Real-time status updates.", "status": "review", "priority": "high", "tags": ["feature", "orders", "admin-panel"]}'
post "$FE" "tasks" '{"title": "Product Editor Form", "description": "Admin product creation/edit form. Fields: title, description (rich text), price, images (drag-drop upload), variants, category, tags, SEO. Live preview.", "status": "todo", "priority": "high", "tags": ["feature", "products", "admin-panel"]}'
post "$FE" "tasks" '{"title": "Shopping Cart Persistence", "description": "Save cart to localStorage for anonymous users. Sync with server cart on login. Handle merge conflicts. Show cart count in header icon.", "status": "done", "priority": "high", "tags": ["feature", "cart", "web-store"]}'
post "$FE" "tasks" '{"title": "Implement Dark Mode", "description": "CSS custom properties based theme. Toggle in header. Persist preference in localStorage. Respect prefers-color-scheme media query. Test all components in both modes.", "status": "todo", "priority": "medium", "tags": ["feature", "theme", "web-store"]}'
post "$FE" "tasks" '{"title": "Add Loading Skeletons", "description": "Replace spinners with skeleton loading screens for product list, product detail, cart, and dashboard. Improves perceived performance.", "status": "todo", "priority": "medium", "tags": ["ux", "performance", "web-store"]}'
post "$FE" "tasks" '{"title": "Analytics Dashboard Charts", "description": "Revenue trend line chart, orders by status pie chart, top products bar chart, conversion funnel. Responsive, dark mode compatible. Date range selector.", "status": "in_progress", "priority": "medium", "tags": ["feature", "analytics", "admin-panel"]}'
post "$FE" "tasks" '{"title": "Implement Infinite Scroll for Products", "description": "Replace pagination with infinite scroll on product list. Use Intersection Observer for trigger. Show skeleton rows while loading. Maintain scroll position on back navigation.", "status": "done", "priority": "medium", "tags": ["feature", "ux", "web-store"]}'
post "$FE" "tasks" '{"title": "Accessibility Audit and Fixes", "description": "Run Lighthouse and axe-core audits. Fix issues: missing alt texts, focus management in modals, ARIA labels on icon buttons, color contrast on status badges.", "status": "in_progress", "priority": "medium", "tags": ["a11y", "quality"]}'
post "$FE" "tasks" '{"title": "Add Error Boundary Components", "description": "Wrap major sections (header, product list, cart, checkout) in error boundaries. Show friendly error message with retry button. Log errors to monitoring.", "status": "todo", "priority": "medium", "tags": ["error-handling", "ux"]}'
post "$FE" "tasks" '{"title": "Bundle Size Optimization", "description": "Analyze bundle with webpack-bundle-analyzer. Targets: main chunk < 100KB gzip. Actions: lazy load routes, tree-shake unused MUI components, optimize lodash imports.", "status": "backlog", "priority": "low", "tags": ["performance", "build"]}'
post "$FE" "tasks" '{"title": "Add Storybook for Components", "description": "Set up Storybook. Create stories for all shared components (ProductCard, SearchBar, Cart, etc.). Include variants, states, and responsive viewports.", "status": "backlog", "priority": "low", "tags": ["documentation", "components"]}'
post "$FE" "tasks" '{"title": "Add E2E Tests for Checkout", "description": "Cypress E2E tests covering full checkout flow: browse → add to cart → checkout → mock payment → confirmation. Test both logged-in and guest flows.", "status": "backlog", "priority": "low", "tags": ["testing", "e2e", "checkout"]}'
post "$FE" "tasks" '{"title": "User Manager Role Assignment", "description": "Admin panel: list users with role badges, change role via dropdown, confirm action, audit log entry. Only admin role can modify roles.", "status": "todo", "priority": "medium", "tags": ["feature", "permissions", "admin-panel"]}'

# --- Infra standalone tasks (8) ---

post "$INF" "tasks" '{"title": "Set Up Staging Environment", "description": "Create staging Terraform workspace. Deploy all services to staging namespace. Configure staging database (smaller instance). Set up staging URL and SSL cert.", "status": "in_progress", "priority": "critical", "tags": ["infrastructure", "staging"]}'
post "$INF" "tasks" '{"title": "Configure Prometheus Alerting Rules", "description": "Set up alert rules for: error rate > 5%, p99 latency > 2s, pod restarts > 3, disk usage > 80%, certificate expiry < 30 days. PagerDuty integration for critical.", "status": "todo", "priority": "high", "tags": ["monitoring", "alerting"]}'
post "$INF" "tasks" '{"title": "Implement Canary Deployments", "description": "Set up canary deployment for production. Route 10% traffic to canary, monitor error rate, auto-promote or rollback after 10 minutes.", "status": "backlog", "priority": "high", "tags": ["deployment", "ci-cd"]}'
post "$INF" "tasks" '{"title": "Database Backup Verification", "description": "Create monthly automated restore test. Restore latest RDS snapshot to temporary instance, run data integrity checks, send report, tear down.", "status": "todo", "priority": "high", "tags": ["database", "backup", "reliability"]}'
post "$INF" "tasks" '{"title": "Set Up WAF Rules", "description": "Configure AWS WAF on CloudFront and ALB. Rules: SQL injection, XSS, rate limiting, geo-blocking for sanctioned countries, bot detection.", "status": "todo", "priority": "medium", "tags": ["security", "waf", "networking"]}'
post "$INF" "tasks" '{"title": "Optimize AWS Costs", "description": "Review and implement: Reserved Instances for RDS, Spot Instances for non-prod nodes, S3 lifecycle policies for old images, right-size over-provisioned services.", "status": "in_progress", "priority": "medium", "tags": ["cost", "optimization"]}'
post "$INF" "tasks" '{"title": "Create Disaster Recovery Runbook", "description": "Document full DR procedure: detect outage, failover DNS to DR region, verify service health, data consistency check, failback procedure.", "status": "todo", "priority": "medium", "tags": ["disaster-recovery", "runbook"]}'
post "$INF" "tasks" '{"title": "Add Network Policies to K8s", "description": "Implement K8s NetworkPolicies: backend services can only talk to each other and Redis. Frontend pods can only reach ingress. Monitoring has read access to all.", "status": "backlog", "priority": "low", "tags": ["security", "kubernetes", "networking"]}'

echo "Tasks created: 63"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# SKILLS (25+ skills)
# ─────────────────────────────────────────────────────────────────────────────
echo "Creating skills..."

# --- Backend workspace skills (15) ---

post "$BE" "skills" '{
  "title": "Add REST Endpoint",
  "description": "Step-by-step procedure for adding a new REST API endpoint to any backend service.",
  "steps": ["Define route in controller file (HTTP method, path, handler)", "Add request/response types in types/index.ts", "Create validation schema if needed", "Implement service method with business logic", "Add error handling (try/catch, appropriate status codes)", "Write unit test for service method", "Write integration test for endpoint", "Update API documentation in docs/"],
  "triggers": ["new endpoint", "add API", "create route", "REST API"],
  "inputHints": ["service name", "HTTP method", "endpoint path", "request body schema"],
  "filePatterns": ["src/controllers/*.ts", "src/services/*.ts", "src/types/index.ts"],
  "tags": ["api", "backend", "procedure"],
  "source": "user",
  "confidence": 0.95
}'

post "$BE" "skills" '{
  "title": "Debug Authentication Issues",
  "description": "Diagnostic steps for troubleshooting authentication failures in the gateway.",
  "steps": ["Check auth-guard middleware logs for token validation errors", "Verify JWT secret matches between gateway and token-service", "Check token expiry — access tokens last 15 min, refresh 7 days", "Inspect token payload: userId, roles, iat, exp fields", "Check session-service — is session valid and not expired?", "Verify CORS allows Authorization header from client origin", "Check rate-limiter — is the user hitting rate limits (429)?", "Test with curl: copy token, call endpoint directly"],
  "triggers": ["401 error", "auth failed", "token invalid", "login not working", "unauthorized"],
  "inputHints": ["error message", "endpoint URL", "user ID"],
  "filePatterns": ["src/middleware/auth-guard.ts", "src/services/token-service.ts", "src/services/session-service.ts"],
  "tags": ["debug", "auth", "gateway"],
  "source": "learned",
  "confidence": 0.9
}'

post "$BE" "skills" '{
  "title": "Deploy Service to Staging",
  "description": "Full deployment procedure for any backend service to the staging environment.",
  "steps": ["Ensure all tests pass: npm test", "Build Docker image: docker build -t shopflow/{service}:latest .", "Tag with git SHA: docker tag shopflow/{service}:latest {ecr}/{service}:{sha}", "Push to ECR: docker push {ecr}/{service}:{sha}", "Update K8s deployment: kubectl set image deployment/{service} {service}={ecr}/{service}:{sha} -n backend-staging", "Watch rollout: kubectl rollout status deployment/{service} -n backend-staging", "Verify health: curl https://staging.shopflow.dev/health", "Run smoke tests against staging"],
  "triggers": ["deploy to staging", "release to staging", "push to staging"],
  "inputHints": ["service name", "git SHA or version tag"],
  "filePatterns": [],
  "tags": ["deployment", "staging", "devops"],
  "source": "user",
  "confidence": 0.95
}'

post "$BE" "skills" '{
  "title": "Add Database Migration",
  "description": "Procedure for creating and running database schema migrations.",
  "steps": ["Create migration file: migrations/{timestamp}_{name}.sql", "Write UP migration (create/alter table, add index)", "Write DOWN migration (reverse of UP)", "Test locally: apply migration to dev database", "Verify: run service tests against migrated schema", "Commit migration file", "Migration auto-runs on service startup in staging/prod", "Monitor: check migration log and service health after deploy"],
  "triggers": ["add migration", "change schema", "alter table", "new table", "add column"],
  "inputHints": ["table name", "column name", "change description"],
  "filePatterns": ["migrations/*.sql"],
  "tags": ["database", "migration", "schema"],
  "source": "user",
  "confidence": 0.9
}'

post "$BE" "skills" '{
  "title": "Troubleshoot Service Communication",
  "description": "Diagnose issues when services cant reach each other through the gateway.",
  "steps": ["Check if target service is running: kubectl get pods -n backend", "Verify K8s service endpoint: kubectl get endpoints {service} -n backend", "Check gateway routing-service config for correct service URL", "Test direct call: kubectl exec -it gateway-pod -- curl http://{service}:3000/health", "Check circuit breaker state in gateway logs (open = calls blocked)", "Verify network policy allows traffic between pods", "Check DNS resolution: kubectl exec -it gateway-pod -- nslookup {service}", "Review gateway proxy-controller timeout settings"],
  "triggers": ["service unreachable", "502 error", "gateway timeout", "connection refused", "ECONNREFUSED"],
  "inputHints": ["target service name", "error message", "HTTP status code"],
  "filePatterns": ["src/services/routing-service.ts", "src/controllers/proxy-controller.ts"],
  "tags": ["debug", "networking", "gateway"],
  "source": "learned",
  "confidence": 0.85
}'

post "$BE" "skills" '{
  "title": "Implement Search Feature",
  "description": "Steps to add a new searchable entity to the catalog search system.",
  "steps": ["Define searchable fields and their BM25 boost weights", "Add entity to search-service index build", "Implement search query parsing (tokenize, normalize)", "Add facet extraction for filterable fields", "Create search controller endpoint with query/filter/sort params", "Add pagination (cursor-based) to results", "Write tests with known test data", "Update search documentation"],
  "triggers": ["add search", "implement search", "searchable", "full-text search"],
  "inputHints": ["entity name", "searchable fields", "filter fields"],
  "filePatterns": ["src/services/search-service.ts", "src/controllers/search-controller.ts"],
  "tags": ["search", "feature", "catalog"],
  "source": "user",
  "confidence": 0.9
}'

post "$BE" "skills" '{
  "title": "Handle Payment Webhook",
  "description": "Process incoming payment provider webhook callbacks safely.",
  "steps": ["Verify webhook signature (HMAC-SHA256 with webhook secret)", "Parse event type from payload (payment_intent.succeeded, etc.)", "Check idempotency: has this event ID been processed before?", "Look up order by payment intent ID", "Update order status based on event type", "Trigger side effects (inventory update, notification)", "Return 200 immediately (process async if needed)", "Log webhook event for audit trail"],
  "triggers": ["payment webhook", "stripe callback", "payment notification"],
  "inputHints": ["webhook event type", "order ID"],
  "filePatterns": ["src/controllers/payment-controller.ts", "src/services/payment-service.ts"],
  "tags": ["payment", "webhook", "order"],
  "source": "user",
  "confidence": 0.9
}'

post "$BE" "skills" '{
  "title": "Performance Profile an Endpoint",
  "description": "Steps to identify and fix performance bottlenecks in API endpoints.",
  "steps": ["Identify slow endpoint from Prometheus p99 latency metrics", "Add timing logs at each major step (DB query, external call, computation)", "Check database query plans with EXPLAIN ANALYZE", "Look for N+1 queries — add batch loading or joins", "Check if response can be cached (Redis with appropriate TTL)", "Profile memory usage for large result sets (pagination helps)", "Load test with k6: ramp to expected traffic, measure", "Compare before/after metrics, document findings"],
  "triggers": ["slow endpoint", "performance issue", "latency high", "optimize", "slow query"],
  "inputHints": ["endpoint path", "current p99 latency", "expected latency"],
  "filePatterns": [],
  "tags": ["performance", "profiling", "optimization"],
  "source": "learned",
  "confidence": 0.85
}'

post "$BE" "skills" '{
  "title": "Add Product Variant",
  "description": "Add a new variant type (size, color, etc.) to the product catalog.",
  "steps": ["Add variant type to Product model variant types enum", "Create variant attributes schema (e.g., size: S/M/L/XL)", "Update product-service to handle variants in create/update", "Each variant gets: own SKU, price override (optional), stock count", "Update product-controller to include variants in response", "Update search indexing to include variant attributes", "Update inventory-service to track stock per variant", "Add tests for variant CRUD and search"],
  "triggers": ["product variant", "add variant", "size options", "color options"],
  "inputHints": ["variant type name", "variant values"],
  "filePatterns": ["src/models/product.ts", "src/services/product-service.ts", "src/services/inventory-service.ts"],
  "tags": ["catalog", "variants", "feature"],
  "source": "user",
  "confidence": 0.85
}'

post "$BE" "skills" '{
  "title": "Configure CORS for New Origin",
  "description": "Add a new allowed origin to the gateway CORS configuration.",
  "steps": ["Identify the new origin domain and protocol (https://)", "Add origin to CORS_ALLOWED_ORIGINS env variable", "Update cors-middleware.ts if using hardcoded origins", "Verify: test preflight OPTIONS request from new origin", "Check: cookies/credentials still work (SameSite, Secure flags)", "Update deployment config (K8s ConfigMap) for staging and prod"],
  "triggers": ["CORS error", "blocked by CORS", "add origin", "cross-origin"],
  "inputHints": ["origin URL"],
  "filePatterns": ["src/middleware/cors-middleware.ts", "src/config/index.ts"],
  "tags": ["cors", "gateway", "config"],
  "source": "user",
  "confidence": 0.95
}'

post "$BE" "skills" '{
  "title": "Add New Notification Template",
  "description": "Create a new email notification template for order events.",
  "steps": ["Define template name and trigger event (e.g., order.shipped)", "Create Handlebars template with order/user/product data", "Add template to notification-service template registry", "Wire trigger: listen for event in order state machine transition", "Add email rate limit check (max 10/user/day)", "Test: trigger event, verify email content and delivery", "Add template preview endpoint for admin testing"],
  "triggers": ["add notification", "email template", "new email", "notification"],
  "inputHints": ["event name", "template variables needed"],
  "filePatterns": ["src/services/notification-service.ts"],
  "tags": ["notifications", "email", "order"],
  "source": "user",
  "confidence": 0.9
}'

post "$BE" "skills" '{
  "title": "Investigate Memory Leak",
  "description": "Diagnose and fix memory leaks in Node.js backend services.",
  "steps": ["Check Grafana: is memory usage growing linearly over time?", "Identify affected service from pod memory metrics", "Enable heap profiling: --inspect flag on Node.js process", "Take heap snapshots at intervals (Chrome DevTools)", "Compare snapshots: look for growing object counts", "Common causes: event listener leaks, unclosed DB connections, growing caches without eviction", "Fix: add cleanup, use WeakRef/WeakMap, bound cache size", "Verify: deploy fix, monitor memory for 24h"],
  "triggers": ["memory leak", "OOM", "out of memory", "memory growing", "pod restart"],
  "inputHints": ["service name", "memory growth rate"],
  "filePatterns": [],
  "tags": ["debug", "memory", "performance"],
  "source": "learned",
  "confidence": 0.8
}'

post "$BE" "skills" '{
  "title": "Set Up Integration Test Suite",
  "description": "Create integration tests that test service with real database.",
  "steps": ["Create test database (Docker Compose with PostgreSQL)", "Set up test fixtures: seed minimum required data", "Create test helper: database setup/teardown between tests", "Write tests that call service methods directly (not HTTP)", "Assert database state after operations", "Run migrations before test suite starts", "Add to CI pipeline: start test DB, run tests, stop DB", "Keep tests fast: each test cleans up its own data"],
  "triggers": ["integration test", "test with database", "test setup"],
  "inputHints": ["service name", "features to test"],
  "filePatterns": [],
  "tags": ["testing", "integration", "database"],
  "source": "user",
  "confidence": 0.9
}'

post "$BE" "skills" '{
  "title": "Implement Idempotent Endpoint",
  "description": "Make a write endpoint idempotent using idempotency keys.",
  "steps": ["Accept Idempotency-Key header (client-generated UUID)", "Check if key exists in idempotency store (Redis, 24h TTL)", "If exists: return cached response (same status code and body)", "If not: process request normally", "Store response with key after successful processing", "Handle concurrent requests with same key: use Redis SETNX as lock", "Return 409 if request body differs for same key", "Add to API documentation: which endpoints support idempotency"],
  "triggers": ["idempotent", "idempotency key", "prevent duplicate", "retry safe"],
  "inputHints": ["endpoint path"],
  "filePatterns": [],
  "tags": ["api", "idempotency", "reliability"],
  "source": "user",
  "confidence": 0.9
}'

post "$BE" "skills" '{
  "title": "Add Feature Flag",
  "description": "Add a feature flag to gradually roll out new functionality.",
  "steps": ["Define flag name in config (e.g., FEATURE_MULTI_CURRENCY=false)", "Create feature flag check utility: isEnabled(flagName)", "Wrap new code path with flag check", "Add flag to all environment configs (dev=true, staging=true, prod=false)", "Test both paths: flag on and flag off", "Deploy to prod with flag off", "Enable for percentage of users or specific user IDs", "Remove flag and old code path after full rollout"],
  "triggers": ["feature flag", "feature toggle", "gradual rollout", "canary feature"],
  "inputHints": ["feature name", "rollout strategy"],
  "filePatterns": ["src/config/index.ts"],
  "tags": ["feature-flag", "deployment", "config"],
  "source": "user",
  "confidence": 0.85
}'

# --- Frontend workspace skills (7) ---

post "$FE" "skills" '{
  "title": "Create React Component",
  "description": "Standard procedure for creating a new React component in web-store or admin-panel.",
  "steps": ["Create component file: src/components/{Name}.tsx", "Define Props interface with JSDoc descriptions", "Implement component as function component with hooks", "Add ARIA attributes for accessibility", "Create Storybook story if applicable", "Write unit test: render, user interactions, edge cases", "Export from component index if shared"],
  "triggers": ["new component", "create component", "add component", "react component"],
  "inputHints": ["component name", "props description", "parent component"],
  "filePatterns": ["src/components/*.tsx"],
  "tags": ["react", "component", "frontend"],
  "source": "user",
  "confidence": 0.95
}'

post "$FE" "skills" '{
  "title": "Create Custom Hook",
  "description": "Build a custom React hook for shared state or logic.",
  "steps": ["Create hook file: src/hooks/use{Name}.ts", "Define return type interface", "Implement hook with useState/useEffect/useCallback", "Handle loading, error, and success states", "Add cleanup in useEffect return (abort controller, timers)", "Write unit test with renderHook from testing-library", "Document usage with JSDoc and examples"],
  "triggers": ["custom hook", "new hook", "shared state", "reusable logic"],
  "inputHints": ["hook name", "data source", "state shape"],
  "filePatterns": ["src/hooks/*.ts"],
  "tags": ["hooks", "react", "frontend"],
  "source": "user",
  "confidence": 0.95
}'

post "$FE" "skills" '{
  "title": "Debug Rendering Performance",
  "description": "Identify and fix unnecessary re-renders in React components.",
  "steps": ["Open React DevTools Profiler, record interaction", "Look for components with high render count or long render time", "Check: is parent re-rendering unnecessarily? (props unchanged)", "Fix: wrap component with React.memo if props are stable", "Fix: memoize callbacks with useCallback, values with useMemo", "Fix: split large components into smaller ones", "Verify: profile again, compare render counts", "Check bundle: lazy load heavy components below the fold"],
  "triggers": ["slow render", "re-render", "performance", "laggy UI", "jank"],
  "inputHints": ["component name", "interaction that is slow"],
  "filePatterns": ["src/components/*.tsx"],
  "tags": ["performance", "react", "profiling"],
  "source": "learned",
  "confidence": 0.85
}'

post "$FE" "skills" '{
  "title": "Add Internationalization for Feature",
  "description": "Internationalize a new feature or component.",
  "steps": ["Identify all user-visible strings in the component", "Add translation keys to en-US.json: {feature}.{key}", "Replace hardcoded strings with useIntl().formatMessage()", "Use FormattedNumber for prices, FormattedDate for dates", "Add keys to other locale files (es-ES, fr-FR, etc.)", "Test: switch locale, verify all strings change", "Handle plurals with ICU message format"],
  "triggers": ["internationalize", "i18n", "translate", "localize"],
  "inputHints": ["feature/component name", "number of strings"],
  "filePatterns": ["src/components/*.tsx"],
  "tags": ["i18n", "localization", "frontend"],
  "source": "user",
  "confidence": 0.9
}'

post "$FE" "skills" '{
  "title": "Fix Accessibility Issue",
  "description": "Diagnose and fix common accessibility problems.",
  "steps": ["Run axe-core or Lighthouse accessibility audit", "Identify violation: missing label, low contrast, no keyboard nav, etc.", "For missing labels: add aria-label or htmlFor + label element", "For low contrast: adjust colors to meet 4.5:1 ratio (AA)", "For keyboard nav: add tabIndex, onKeyDown handlers, focus management", "For screen readers: add aria-live for dynamic content, role attributes", "Test: keyboard-only navigation through the feature", "Test: VoiceOver/NVDA reads content correctly"],
  "triggers": ["accessibility", "a11y", "screen reader", "keyboard navigation", "WCAG"],
  "inputHints": ["component name", "violation type", "audit tool output"],
  "filePatterns": ["src/components/*.tsx"],
  "tags": ["a11y", "accessibility", "quality"],
  "source": "learned",
  "confidence": 0.85
}'

post "$FE" "skills" '{
  "title": "Set Up E2E Test",
  "description": "Create an end-to-end test with Cypress for a user flow.",
  "steps": ["Create test file: cypress/e2e/{feature}.cy.ts", "Set up test data: seed via API or fixtures", "Write test: visit page, interact with elements, assert results", "Use data-testid attributes for selectors (not CSS classes)", "Handle async: use cy.intercept for API calls, cy.wait for responses", "Test both happy path and error scenarios", "Add to CI pipeline: start dev server, run Cypress headless"],
  "triggers": ["e2e test", "cypress test", "end to end", "integration test UI"],
  "inputHints": ["user flow to test", "pages involved"],
  "filePatterns": [],
  "tags": ["testing", "e2e", "cypress"],
  "source": "user",
  "confidence": 0.9
}'

post "$FE" "skills" '{
  "title": "Optimize Bundle Size",
  "description": "Reduce JavaScript bundle size for better load performance.",
  "steps": ["Run bundle analyzer: npx webpack-bundle-analyzer dist/stats.json", "Identify largest dependencies (check for unused imports)", "Replace heavy libraries with lighter alternatives (date-fns vs moment)", "Configure tree shaking: use named imports, avoid barrel files", "Lazy load routes: React.lazy + Suspense for each page", "Split vendor chunk: separate stable deps from app code", "Set budget: main < 100KB gzip, fail CI if exceeded", "Verify: compare Lighthouse score before and after"],
  "triggers": ["bundle size", "large bundle", "slow load", "webpack", "code splitting"],
  "inputHints": ["current bundle size", "target size"],
  "filePatterns": [],
  "tags": ["performance", "build", "optimization"],
  "source": "learned",
  "confidence": 0.85
}'

# --- Infra standalone skills (4) ---

post "$INF" "skills" '{
  "title": "Deploy to Production",
  "description": "Full production deployment procedure with canary rollout.",
  "steps": ["Verify staging is green: all tests pass, no alerts", "Create release tag: git tag v{version}", "Build and push production Docker images to ECR", "Deploy canary (10% traffic): kubectl set image with canary label", "Monitor canary for 10 minutes: error rate, latency, logs", "If canary healthy: promote to 50%, wait 5 min, then 100%", "If canary unhealthy: rollback immediately: kubectl rollout undo", "Announce deployment in #deployments Slack channel", "Monitor for 1 hour post-deployment"],
  "triggers": ["deploy to prod", "production release", "release", "go live"],
  "inputHints": ["version tag", "services to deploy"],
  "filePatterns": [],
  "tags": ["deployment", "production", "canary"],
  "source": "user",
  "confidence": 0.95
}'

post "$INF" "skills" '{
  "title": "Respond to SEV1 Incident",
  "description": "Immediate response procedure for critical production incidents.",
  "steps": ["Acknowledge alert in PagerDuty within 5 minutes", "Join #incidents Slack channel, post initial assessment", "Check dashboards: Grafana overview, error rates, pod status", "Identify affected service and scope of impact", "Decide: can we mitigate quickly (restart, rollback) or need investigation?", "If rollback viable: kubectl rollout undo deployment/{service}", "Update status page for customer visibility", "Once mitigated: communicate resolution in Slack", "Schedule post-mortem within 48 hours"],
  "triggers": ["SEV1", "production down", "outage", "incident", "pager"],
  "inputHints": ["alert source", "affected service", "error description"],
  "filePatterns": [],
  "tags": ["incident", "response", "production"],
  "source": "user",
  "confidence": 0.9
}'

post "$INF" "skills" '{
  "title": "Scale Service for Traffic Spike",
  "description": "Manually scale services in preparation for expected high traffic.",
  "steps": ["Estimate expected traffic: RPS, concurrent users", "Calculate required replicas: current_rps / rps_per_pod * safety_factor(1.5)", "Pre-scale services: kubectl scale deployment/{service} --replicas={n}", "Pre-warm caches: run common queries to populate Redis", "Verify node capacity: kubectl top nodes (need headroom for pods)", "If nodes full: increase node group max in EKS autoscaler config", "Monitor during event: watch Grafana real-time dashboard", "Scale back after event: reset to normal replica counts"],
  "triggers": ["traffic spike", "flash sale", "scale up", "high traffic", "prepare for load"],
  "inputHints": ["expected RPS", "duration", "affected services"],
  "filePatterns": [],
  "tags": ["scaling", "performance", "operations"],
  "source": "learned",
  "confidence": 0.85
}'

post "$INF" "skills" '{
  "title": "Restore Database from Backup",
  "description": "Procedure to restore PostgreSQL from RDS backup.",
  "steps": ["Identify restore point: latest snapshot or point-in-time", "Create restore: aws rds restore-db-instance-from-db-snapshot", "Wait for instance to become available (10-30 min)", "Update security group to allow access from K8s nodes", "Verify data: connect and run integrity checks", "If replacing primary: update service DATABASE_URL config", "Restart affected services to pick up new connection string", "Run application health checks", "Clean up: delete old instance after verification"],
  "triggers": ["restore database", "database recovery", "data loss", "rollback data"],
  "inputHints": ["restore point (timestamp or snapshot ID)", "database name"],
  "filePatterns": [],
  "tags": ["database", "backup", "disaster-recovery"],
  "source": "user",
  "confidence": 0.9
}'

echo "Skills created: 26"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# RELATIONS — note-to-note (40+)
# ─────────────────────────────────────────────────────────────────────────────
echo "Creating note-to-note relations..."

# Backend workspace relations
post "$BE" "knowledge/relations" '{"fromId": "jwt-token-strategy", "toId": "session-management-details", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "jwt-token-strategy", "toId": "cors-configuration", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "architecture-decision-microservices-split", "toId": "service-communication-patterns", "kind": "supports", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "architecture-decision-microservices-split", "toId": "database-strategy-per-service", "kind": "supports", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "circuit-breaker-pattern-for-service-calls", "toId": "service-communication-patterns", "kind": "depends_on", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "circuit-breaker-pattern-for-service-calls", "toId": "load-balancing-strategy", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "product-search-algorithm", "toId": "category-tree-implementation", "kind": "depends_on", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "product-search-algorithm", "toId": "slug-generation-strategy", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "pricing-engine-rules", "toId": "tax-calculation-rules", "kind": "depends_on", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "pricing-engine-rules", "toId": "currency-handling-convention", "kind": "depends_on", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "pricing-engine-rules", "toId": "shipping-rate-calculation", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "order-state-machine", "toId": "payment-integration-architecture", "kind": "depends_on", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "order-state-machine", "toId": "inventory-reservation-strategy", "kind": "depends_on", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "order-state-machine", "toId": "notification-system-architecture", "kind": "triggers", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "order-state-machine", "toId": "refund-processing-flow", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "payment-integration-architecture", "toId": "webhook-delivery-system", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "inventory-reservation-strategy", "toId": "cart-merge-strategy", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "product-import-pipeline", "toId": "data-validation-approach", "kind": "depends_on", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "product-import-pipeline", "toId": "slug-generation-strategy", "kind": "depends_on", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "review-moderation-system", "toId": "notification-system-architecture", "kind": "triggers", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "error-handling-convention", "toId": "data-validation-approach", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "error-handling-convention", "toId": "logging-and-observability", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "api-versioning-strategy", "toId": "api-gateway-rate-limiting-design", "kind": "relates_to", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "image-handling-pipeline", "toId": "product-import-pipeline", "kind": "relates_to", "projectId": "api-gateway"}'

# Frontend workspace relations
post "$FE" "knowledge/relations" '{"fromId": "component-architecture-guidelines", "toId": "state-management-strategy", "kind": "relates_to", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "state-management-strategy", "toId": "api-client-design", "kind": "depends_on", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "checkout-flow-design", "toId": "accessibility-standards", "kind": "depends_on", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "checkout-flow-design", "toId": "internationalization-setup", "kind": "depends_on", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "search-ux-patterns", "toId": "performance-optimization-checklist", "kind": "relates_to", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "admin-dashboard-design", "toId": "admin-permissions-matrix", "kind": "depends_on", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "admin-dashboard-design", "toId": "real-time-updates-strategy", "kind": "depends_on", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "csv-export-implementation", "toId": "admin-permissions-matrix", "kind": "depends_on", "projectId": "web-store"}'

# Infra standalone relations
post "$INF" "knowledge/relations" '{"fromId": "aws-infrastructure-overview", "toId": "terraform-module-structure", "kind": "supports", "projectId": "infra"}'
post "$INF" "knowledge/relations" '{"fromId": "aws-infrastructure-overview", "toId": "kubernetes-namespace-strategy", "kind": "supports", "projectId": "infra"}'
post "$INF" "knowledge/relations" '{"fromId": "aws-infrastructure-overview", "toId": "cost-optimization-findings", "kind": "relates_to", "projectId": "infra"}'
post "$INF" "knowledge/relations" '{"fromId": "ci-cd-pipeline-design", "toId": "monitoring-and-alerting-setup", "kind": "depends_on", "projectId": "infra"}'
post "$INF" "knowledge/relations" '{"fromId": "incident-response-procedure", "toId": "monitoring-and-alerting-setup", "kind": "depends_on", "projectId": "infra"}'
post "$INF" "knowledge/relations" '{"fromId": "incident-response-procedure", "toId": "database-backup-strategy", "kind": "relates_to", "projectId": "infra"}'
post "$INF" "knowledge/relations" '{"fromId": "scaling-policies", "toId": "cost-optimization-findings", "kind": "relates_to", "projectId": "infra"}'
post "$INF" "knowledge/relations" '{"fromId": "secrets-management", "toId": "kubernetes-namespace-strategy", "kind": "depends_on", "projectId": "infra"}'

echo "Note relations created: 40"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# CROSS-GRAPH LINKS — notes → code, tasks → files, skills → docs (30+)
# ─────────────────────────────────────────────────────────────────────────────
echo "Creating cross-graph links..."

# Backend workspace: notes → code
post "$BE" "knowledge/relations" '{"fromId": "jwt-token-strategy", "toId": "src/services/token-service.ts::TokenService", "kind": "implemented_in", "targetGraph": "code", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "jwt-token-strategy", "toId": "src/middleware/auth-guard.ts::authGuard", "kind": "implemented_in", "targetGraph": "code", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "api-gateway-rate-limiting-design", "toId": "src/middleware/rate-limiter.ts::RateLimiter", "kind": "implemented_in", "targetGraph": "code", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "circuit-breaker-pattern-for-service-calls", "toId": "src/services/routing-service.ts::RoutingService", "kind": "implemented_in", "targetGraph": "code", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "product-search-algorithm", "toId": "src/services/search-service.ts::SearchService", "kind": "implemented_in", "targetGraph": "code", "projectId": "catalog-service"}'
post "$BE" "knowledge/relations" '{"fromId": "category-tree-implementation", "toId": "src/models/category.ts::Category", "kind": "implemented_in", "targetGraph": "code", "projectId": "catalog-service"}'
post "$BE" "knowledge/relations" '{"fromId": "slug-generation-strategy", "toId": "src/utils/slug.ts::generateSlug", "kind": "implemented_in", "targetGraph": "code", "projectId": "catalog-service"}'
post "$BE" "knowledge/relations" '{"fromId": "order-state-machine", "toId": "src/services/order-service.ts::OrderService", "kind": "implemented_in", "targetGraph": "code", "projectId": "order-service"}'
post "$BE" "knowledge/relations" '{"fromId": "payment-integration-architecture", "toId": "src/services/payment-service.ts::PaymentService", "kind": "implemented_in", "targetGraph": "code", "projectId": "order-service"}'
post "$BE" "knowledge/relations" '{"fromId": "pricing-engine-rules", "toId": "src/utils/price-calc.ts::calculateOrderTotal", "kind": "implemented_in", "targetGraph": "code", "projectId": "order-service"}'
post "$BE" "knowledge/relations" '{"fromId": "tax-calculation-rules", "toId": "src/utils/tax.ts::TaxCalculator", "kind": "implemented_in", "targetGraph": "code", "projectId": "order-service"}'
post "$BE" "knowledge/relations" '{"fromId": "inventory-reservation-strategy", "toId": "src/services/inventory-service.ts::InventoryService", "kind": "implemented_in", "targetGraph": "code", "projectId": "catalog-service"}'
post "$BE" "knowledge/relations" '{"fromId": "cors-configuration", "toId": "src/middleware/cors-middleware.ts::corsMiddleware", "kind": "implemented_in", "targetGraph": "code", "projectId": "api-gateway"}'
post "$BE" "knowledge/relations" '{"fromId": "session-management-details", "toId": "src/services/session-service.ts::SessionService", "kind": "implemented_in", "targetGraph": "code", "projectId": "api-gateway"}'

# Backend workspace: notes → docs
post "$BE" "knowledge/relations" '{"fromId": "order-state-machine", "toId": "docs/order-state-machine.md", "kind": "documented_in", "targetGraph": "docs", "projectId": "order-service"}'
post "$BE" "knowledge/relations" '{"fromId": "product-search-algorithm", "toId": "docs/search-algorithm.md", "kind": "documented_in", "targetGraph": "docs", "projectId": "catalog-service"}'
post "$BE" "knowledge/relations" '{"fromId": "payment-integration-architecture", "toId": "docs/payment-integration.md", "kind": "documented_in", "targetGraph": "docs", "projectId": "order-service"}'

# Backend workspace: tasks → code
post "$BE" "tasks/links" '{"fromId": "fix-payment-webhook-double-processing", "toId": "src/controllers/payment-controller.ts::PaymentController", "kind": "fixes", "targetGraph": "code", "projectId": "order-service"}'
post "$BE" "tasks/links" '{"fromId": "fix-payment-webhook-double-processing", "toId": "src/services/payment-service.ts::PaymentService", "kind": "fixes", "targetGraph": "code", "projectId": "order-service"}'
post "$BE" "tasks/links" '{"fromId": "implement-rate-limit-redis-backend", "toId": "src/middleware/rate-limiter.ts::RateLimiter", "kind": "modifies", "targetGraph": "code", "projectId": "api-gateway"}'
post "$BE" "tasks/links" '{"fromId": "fix-inventory-overselling-on-high-concurrency", "toId": "src/services/inventory-service.ts::InventoryService", "kind": "fixes", "targetGraph": "code", "projectId": "catalog-service"}'
post "$BE" "tasks/links" '{"fromId": "implement-product-full-text-search", "toId": "src/services/search-service.ts::SearchService", "kind": "implements", "targetGraph": "code", "projectId": "catalog-service"}'
post "$BE" "tasks/links" '{"fromId": "add-shipping-rate-calculator", "toId": "src/services/shipping-service.ts::ShippingService", "kind": "implements", "targetGraph": "code", "projectId": "order-service"}'

# Frontend workspace: notes → code
post "$FE" "knowledge/relations" '{"fromId": "checkout-flow-design", "toId": "src/components/Checkout.tsx::Checkout", "kind": "implemented_in", "targetGraph": "code", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "state-management-strategy", "toId": "src/hooks/useCart.ts::useCart", "kind": "implemented_in", "targetGraph": "code", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "search-ux-patterns", "toId": "src/components/SearchBar.tsx::SearchBar", "kind": "implemented_in", "targetGraph": "code", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "api-client-design", "toId": "src/services/api-client.ts::ApiClient", "kind": "implemented_in", "targetGraph": "code", "projectId": "web-store"}'
post "$FE" "knowledge/relations" '{"fromId": "admin-dashboard-design", "toId": "src/components/Dashboard.tsx::Dashboard", "kind": "implemented_in", "targetGraph": "code", "projectId": "admin-panel"}'
post "$FE" "knowledge/relations" '{"fromId": "csv-export-implementation", "toId": "src/services/csv-export.ts::CsvExporter", "kind": "implemented_in", "targetGraph": "code", "projectId": "admin-panel"}'

# Skill links
post "$BE" "skills/links" '{"fromId": "add-rest-endpoint", "toId": "docs/api-reference.md", "kind": "references", "targetGraph": "docs", "projectId": "api-gateway"}'
post "$BE" "skills/links" '{"fromId": "debug-authentication-issues", "toId": "src/middleware/auth-guard.ts::authGuard", "kind": "inspects", "targetGraph": "code", "projectId": "api-gateway"}'
post "$BE" "skills/links" '{"fromId": "debug-authentication-issues", "toId": "src/services/token-service.ts::TokenService", "kind": "inspects", "targetGraph": "code", "projectId": "api-gateway"}'
post "$BE" "skills/links" '{"fromId": "handle-payment-webhook", "toId": "src/controllers/payment-controller.ts::PaymentController", "kind": "modifies", "targetGraph": "code", "projectId": "order-service"}'
post "$BE" "skills/links" '{"fromId": "implement-search-feature", "toId": "src/services/search-service.ts::SearchService", "kind": "references", "targetGraph": "code", "projectId": "catalog-service"}'

# Skill-to-skill links
post "$BE" "skills/links" '{"fromId": "deploy-service-to-staging", "toId": "add-rest-endpoint", "kind": "related_to"}'
post "$BE" "skills/links" '{"fromId": "performance-profile-an-endpoint", "toId": "add-rest-endpoint", "kind": "related_to"}'
post "$BE" "skills/links" '{"fromId": "add-database-migration", "toId": "set-up-integration-test-suite", "kind": "depends_on"}'
post "$FE" "skills/links" '{"fromId": "create-custom-hook", "toId": "create-react-component", "kind": "related_to"}'
post "$FE" "skills/links" '{"fromId": "debug-rendering-performance", "toId": "optimize-bundle-size", "kind": "related_to"}'
post "$INF" "skills/links" '{"fromId": "respond-to-sev1-incident", "toId": "restore-database-from-backup", "kind": "may_require"}'
post "$INF" "skills/links" '{"fromId": "deploy-to-production", "toId": "respond-to-sev1-incident", "kind": "related_to"}'
post "$INF" "skills/links" '{"fromId": "scale-service-for-traffic-spike", "toId": "deploy-to-production", "kind": "related_to"}'

# Task-to-task links
post "$BE" "tasks/links" '{"fromId": "implement-product-full-text-search", "toId": "api-response-pagination", "kind": "depends_on"}'
post "$BE" "tasks/links" '{"fromId": "webhook-delivery-system", "toId": "fix-payment-webhook-double-processing", "kind": "related_to"}'
post "$BE" "tasks/links" '{"fromId": "multi-currency-support", "toId": "implement-bulk-pricing-tiers", "kind": "related_to"}'
post "$BE" "tasks/links" '{"fromId": "implement-promo-code-system", "toId": "implement-bulk-pricing-tiers", "kind": "depends_on"}'
post "$BE" "tasks/links" '{"fromId": "add-order-cancellation-flow", "toId": "fix-payment-webhook-double-processing", "kind": "blocks"}'
post "$FE" "tasks/links" '{"fromId": "build-product-search-with-autocomplete", "toId": "implement-infinite-scroll-for-products", "kind": "related_to"}'
post "$FE" "tasks/links" '{"fromId": "implement-checkout-flow", "toId": "shopping-cart-persistence", "kind": "depends_on"}'
post "$FE" "tasks/links" '{"fromId": "analytics-dashboard-charts", "toId": "admin-order-management-table", "kind": "related_to"}'

echo "Cross-graph links created: 45+"
echo ""

echo "=== Seed complete ==="
echo "Notes: 52 | Tasks: 63 | Skills: 26"
echo "Note relations: 40 | Cross-graph links: 45+"
echo ""
echo "Backend workspace: shared knowledge/tasks/skills across api-gateway, catalog-service, order-service"
echo "Frontend workspace: shared knowledge/tasks/skills across web-store, admin-panel"
echo "Infra: standalone project with its own knowledge/tasks/skills"
