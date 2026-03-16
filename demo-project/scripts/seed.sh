#!/usr/bin/env bash
# Seed demo data — notes, tasks, and skills — via the Graph Memory REST API
#
# Usage:
#   ./scripts/seed.sh [base_url] [project_id]
#
# Default:
#   ./scripts/seed.sh http://localhost:3000 demo-taskflow

set -euo pipefail

BASE="${1:-http://localhost:3000}"
PROJECT="${2:-demo-taskflow}"
API="$BASE/api/projects/$PROJECT"

c() { curl -sf -X POST "$1" -H 'Content-Type: application/json' -d "$2" > /dev/null || echo "  FAIL: $1"; }
d() { curl -sf -X DELETE "$1" > /dev/null 2>&1 || true; }

echo "=== Seeding project: $PROJECT at $BASE ==="

# ── Cleanup existing data ─────────────────────────────────────

echo "Cleaning up existing data..."

# Delete skills (also removes skill relations and cross-graph links)
for id in $(curl -s "$API/skills?limit=500" | python3 -c "import json,sys; [print(s['id']) for s in json.load(sys.stdin).get('results',[])]" 2>/dev/null); do
  d "$API/skills/$id"
done

# Delete tasks
for id in $(curl -s "$API/tasks?limit=500" | python3 -c "import json,sys; [print(s['id']) for s in json.load(sys.stdin).get('results',[])]" 2>/dev/null); do
  d "$API/tasks/$id"
done

# Delete notes (also removes relations)
for id in $(curl -s "$API/knowledge/notes?limit=500" | python3 -c "import json,sys; [print(s['id']) for s in json.load(sys.stdin).get('results',[])]" 2>/dev/null); do
  d "$API/knowledge/notes/$id"
done

echo "  ✓ cleanup done"

# ── Notes ──────────────────────────────────────────────────────

echo "Creating notes..."

c "$API/knowledge/notes" '{
  "title": "Architecture Decision: Layered Services",
  "content": "We chose a layered architecture (Controller → Service → Store) to decouple HTTP concerns from business logic. Services depend on abstract store interfaces, making them testable without a database. This pattern also allows us to swap storage backends without changing business logic.",
  "tags": ["architecture", "design-decision"]
}'

c "$API/knowledge/notes" '{
  "title": "Why Token Bucket for Rate Limiting",
  "content": "We evaluated three rate limiting strategies: fixed window, sliding window, and token bucket. Token bucket was chosen because it handles burst traffic gracefully while maintaining a steady average rate. The sliding window counter is used as a secondary check for auth endpoints.",
  "tags": ["architecture", "rate-limiting", "design-decision"]
}'

c "$API/knowledge/notes" '{
  "title": "JWT vs Session Tokens",
  "content": "After evaluating JWT-only vs server-side sessions, we went with a hybrid approach: short-lived JWTs (15min) for API access + server-side refresh tokens (7 days). This gives us stateless request validation while maintaining the ability to revoke sessions. Password changes invalidate all sessions.",
  "tags": ["auth", "security", "design-decision"]
}'

c "$API/knowledge/notes" '{
  "title": "Webhook Retry Strategy",
  "content": "Webhooks use exponential backoff: 1s, 5s, 30s, 2min, 10min. After 5 consecutive failures the webhook is auto-deactivated (circuit breaker pattern). This prevents overwhelming failing endpoints while giving transient errors time to recover. Reactivation is manual via API.",
  "tags": ["webhooks", "reliability"]
}'

c "$API/knowledge/notes" '{
  "title": "Task Priority Sorting Convention",
  "content": "Task priorities are mapped to numeric values for sorting: critical=0, high=1, medium=2, low=3. This allows simple numeric comparison in sort functions. Combined with due date as secondary sort (nulls last), this gives a natural urgency ordering.",
  "tags": ["tasks", "sorting", "convention"]
}'

c "$API/knowledge/notes" '{
  "title": "EventBus for Domain Events",
  "content": "We use an in-process EventBus (pub/sub) for domain events rather than a message queue. This keeps the architecture simple for a single-process deployment. Events drive notifications, webhook delivery, and activity logging. If we need multi-process support later, we can swap to Redis pub/sub.",
  "tags": ["architecture", "events", "design-decision"]
}'

c "$API/knowledge/notes" '{
  "title": "Slug Generation Strategy",
  "content": "Project slugs are auto-generated from names using lowercase + hyphen normalization. Duplicate slugs are rejected at creation time. We considered auto-appending numbers (my-project-2) but decided explicit naming is clearer. Task IDs use UUIDs, not slugs, since task titles change frequently.",
  "tags": ["convention", "naming"]
}'

c "$API/knowledge/notes" '{
  "title": "Validation Approach",
  "content": "We built lightweight composable validators instead of using Zod or Joi. Each validator is a function returning {valid, errors}. They compose via validate(value, ...validators). This keeps the bundle small and validators are trivially testable. For complex schemas (API input), we may add Zod later.",
  "tags": ["validation", "design-decision"]
}'

c "$API/knowledge/notes" '{
  "title": "LRU Cache Design",
  "content": "The LRU cache uses a Map (insertion-ordered) for O(1) get/set with TTL expiry. On access, entries are deleted and re-inserted at the end. Eviction removes the first entry (least recently used). Hit rate tracking is built in for monitoring. The cache is generic and used for user sessions, project lookups, and search results.",
  "tags": ["caching", "performance"]
}'

c "$API/knowledge/notes" '{
  "title": "Error Handling Strategy",
  "content": "All errors extend a base AppError with statusCode and code fields. Controllers catch service errors and map them to HTTP responses. Internal errors (5xx) are logged with stack traces but return generic messages to clients. Client errors (4xx) return specific error codes for programmatic handling.",
  "tags": ["error-handling", "convention"]
}'

c "$API/knowledge/notes" '{
  "title": "Database Migration Strategy",
  "content": "Migrations are SQL files in the migrations/ directory, numbered sequentially. We use a simple migration runner that tracks applied migrations in a migrations table. Rollbacks are manual SQL. We considered an ORM (Prisma, TypeORM) but raw SQL gives us more control over indexes and complex queries.",
  "tags": ["database", "migrations"]
}'

c "$API/knowledge/notes" '{
  "title": "WIP Limits Rationale",
  "content": "WIP (Work In Progress) limits on kanban columns prevent team overload. When a column reaches its limit, no new tasks can be moved in. This encourages finishing work before starting new items. The default limits are: in_progress=5, review=3. Limits are configurable per project.",
  "tags": ["kanban", "workflow", "tasks"]
}'

c "$API/knowledge/notes" '{
  "title": "OAuth Implementation Notes",
  "content": "OAuth users (Google, GitHub) are created with a generated password hash. They can optionally set a password later for direct login. OAuth tokens are exchanged server-side (authorization code flow). The callback URL must match exactly. We store the OAuth provider ID for account linking.",
  "tags": ["auth", "oauth"]
}'

c "$API/knowledge/notes" '{
  "title": "Performance Baseline",
  "content": "Current benchmarks on a 2-core instance:\n- Task list (20 items): ~15ms\n- Task create: ~25ms\n- Search (full-text): ~40ms\n- Auth login: ~120ms (bcrypt dominant)\n\nTarget p99 latency: <200ms for reads, <500ms for writes. Bcrypt rounds may need reduction if login latency becomes an issue.",
  "tags": ["performance", "benchmarks"]
}'

c "$API/knowledge/notes" '{
  "title": "Team Ownership Model",
  "content": "Each team has a single owner who can transfer ownership to another member. Owners cannot be removed from the team. Members can be added/removed by the owner or admins. The guest access feature (disabled by default) allows external collaborators with read-only access.",
  "tags": ["teams", "authorization"]
}'

echo "  ✓ 15 notes created"

# ── Tasks ──────────────────────────────────────────────────────

echo "Creating tasks..."

c "$API/tasks" '{
  "title": "Implement OAuth Google Login",
  "description": "Add Google OAuth 2.0 authorization code flow. Include callback handling, user creation/linking, and session management. Follow the existing auth patterns in auth-service.ts.",
  "status": "in_progress",
  "priority": "high",
  "tags": ["auth", "oauth", "google"]
}'

c "$API/tasks" '{
  "title": "Implement OAuth GitHub Login",
  "description": "Add GitHub OAuth similar to Google implementation. Share the OAuth callback infrastructure and token exchange logic.",
  "status": "todo",
  "priority": "high",
  "tags": ["auth", "oauth", "github"]
}'

c "$API/tasks" '{
  "title": "Add Task Attachments",
  "description": "Allow users to attach files to tasks. Store files via the configurable storage provider (local/S3/GCS). Add file type and size validation. Include thumbnail generation for images.",
  "status": "backlog",
  "priority": "medium",
  "tags": ["tasks", "files", "storage"]
}'

c "$API/tasks" '{
  "title": "Implement Full-Text Search",
  "description": "Add PostgreSQL full-text search for tasks and projects. Create GIN indexes on title and description. Implement search ranking and highlighting. Support field-specific search (title:keyword).",
  "status": "todo",
  "priority": "high",
  "tags": ["search", "database", "performance"]
}'

c "$API/tasks" '{
  "title": "Add Email Notification Templates",
  "description": "Create HTML email templates for: task assignment, deadline approaching (24h), comment reply, weekly digest. Use a template engine for variable substitution. Support both SMTP and SendGrid.",
  "status": "backlog",
  "priority": "medium",
  "tags": ["notifications", "email"]
}'

c "$API/tasks" '{
  "title": "Set Up CI/CD Pipeline",
  "description": "Configure GitHub Actions for:\n- Run tests on every PR\n- Build Docker image on merge to main\n- Deploy to staging automatically\n- Deploy to production on release tag\n\nInclude test coverage reporting and build artifact caching.",
  "status": "in_progress",
  "priority": "critical",
  "tags": ["devops", "ci-cd", "infrastructure"]
}'

c "$API/tasks" '{
  "title": "Add API Rate Limiting Middleware",
  "description": "Apply rate limiting middleware to all API routes. Use stricter limits for auth endpoints (5/min) vs general endpoints (100/min). Include rate limit headers in responses (X-RateLimit-Remaining, X-RateLimit-Reset).",
  "status": "done",
  "priority": "high",
  "tags": ["security", "middleware", "rate-limiting"]
}'

c "$API/tasks" '{
  "title": "Implement Task Comments API",
  "description": "CRUD for task comments with nested replies. Support markdown in comment body. Track edit history. Emit events for notification service. Include @mention parsing.",
  "status": "in_progress",
  "priority": "medium",
  "tags": ["tasks", "comments", "api"]
}'

c "$API/tasks" '{
  "title": "Add Database Connection Pooling Monitoring",
  "description": "Expose database pool metrics: active connections, idle connections, wait queue size. Add health check that verifies database connectivity. Alert when pool utilization exceeds 80%.",
  "status": "todo",
  "priority": "medium",
  "tags": ["database", "monitoring", "observability"]
}'

c "$API/tasks" '{
  "title": "Fix Task Ordering on Status Change",
  "description": "Bug: when a task is moved to a new column, its position is set to max+1 but this ignores the visual position the user dragged to. Need to accept target position in the move request and shift other tasks accordingly.",
  "status": "todo",
  "priority": "high",
  "tags": ["bug", "tasks", "kanban"]
}'

c "$API/tasks" '{
  "title": "Add Project Analytics Dashboard API",
  "description": "Create endpoints for:\n- Task completion rate over time (weekly/monthly)\n- Velocity chart data (story points per sprint)\n- Burndown chart data\n- Team member workload distribution\n- Cycle time and lead time metrics",
  "status": "backlog",
  "priority": "medium",
  "tags": ["analytics", "api", "dashboard"]
}'

c "$API/tasks" '{
  "title": "Implement Webhook Signature Verification",
  "description": "Replace the placeholder signature with proper HMAC-SHA256. Include timestamp in signature to prevent replay attacks. Document verification in the webhooks API reference.",
  "status": "in_progress",
  "priority": "critical",
  "tags": ["webhooks", "security"]
}'

c "$API/tasks" '{
  "title": "Add Redis Caching Layer",
  "description": "Integrate Redis for caching frequently accessed data: user sessions, project settings, task counts. Implement cache invalidation on writes. Add cache-aside pattern to services.",
  "status": "todo",
  "priority": "medium",
  "tags": ["caching", "redis", "performance"]
}'

c "$API/tasks" '{
  "title": "Write Integration Tests for Auth Flow",
  "description": "End-to-end tests covering: register → login → access protected endpoint → refresh token → logout → verify token invalid. Use test database with automatic cleanup.",
  "status": "done",
  "priority": "high",
  "tags": ["testing", "auth"]
}'

c "$API/tasks" '{
  "title": "Implement Soft Delete for Tasks",
  "description": "Instead of hard-deleting tasks, move them to cancelled status with a deletedAt timestamp. Add a restore endpoint. Auto-purge soft-deleted tasks after 30 days. Update list queries to exclude deleted by default.",
  "status": "backlog",
  "priority": "low",
  "tags": ["tasks", "data-model"]
}'

c "$API/tasks" '{
  "title": "Add Swagger/OpenAPI Documentation",
  "description": "Generate OpenAPI 3.0 spec from code annotations. Serve Swagger UI at /docs. Include request/response examples for all endpoints. Auto-generate TypeScript client SDK from spec.",
  "status": "backlog",
  "priority": "low",
  "tags": ["documentation", "api", "dx"]
}'

c "$API/tasks" '{
  "title": "Implement Task Import/Export",
  "description": "Support CSV and JSON import/export for tasks. Include bulk create endpoint (max 100 tasks per request). Handle duplicate detection by title+project. Export supports all filter options.",
  "status": "backlog",
  "priority": "low",
  "tags": ["tasks", "import-export", "api"]
}'

c "$API/tasks" '{
  "title": "Add Request Logging and Tracing",
  "description": "Implement structured request logging with correlation IDs. Each request gets a unique ID passed via X-Request-ID header. Log request method, path, status, duration, and user. Forward correlation ID to downstream services.",
  "status": "done",
  "priority": "medium",
  "tags": ["observability", "logging", "middleware"]
}'

c "$API/tasks" '{
  "title": "Implement MFA (TOTP) Support",
  "description": "Add optional TOTP-based MFA for user accounts. Generate QR code for authenticator apps. Require TOTP on login when enabled. Include recovery codes (10 one-time codes). Admin can require MFA for all team members.",
  "status": "backlog",
  "priority": "medium",
  "tags": ["auth", "security", "mfa"]
}'

c "$API/tasks" '{
  "title": "Optimize Task List Query Performance",
  "description": "Profile and optimize the task list endpoint for large projects (10k+ tasks). Add database indexes for common filter combinations. Implement cursor-based pagination for better performance with large offsets. Consider materialized views for project stats.",
  "status": "todo",
  "priority": "high",
  "tags": ["performance", "database", "optimization"]
}'

echo "  ✓ 20 tasks created"

# ── Skills ─────────────────────────────────────────────────────

echo "Creating skills..."

c "$API/skills" '{
  "title": "Add REST Endpoint",
  "description": "How to add a new REST API endpoint to the TaskFlow project. Covers route creation, validation, service layer, and tests.",
  "steps": ["Create route handler in src/controllers/", "Add Zod validation schema in src/validators/", "Implement service method in src/services/", "Register route in src/routes/index.ts", "Write integration test in tests/"],
  "triggers": ["add endpoint", "new API route", "create REST handler", "add API"],
  "inputHints": ["endpoint path", "HTTP method", "request/response schema"],
  "filePatterns": ["src/controllers/*.ts", "src/routes/*.ts", "src/validators/*.ts"],
  "tags": ["api", "rest", "backend"],
  "source": "user",
  "confidence": 1
}'

c "$API/skills" '{
  "title": "Debug Authentication Issues",
  "description": "Step-by-step guide for diagnosing and fixing authentication problems in the TaskFlow auth system.",
  "steps": ["Check JWT token expiry in request headers", "Verify token signature with AUTH_SECRET env var", "Check refresh token in database (sessions table)", "Inspect auth middleware logs for rejection reason", "Test with curl: POST /api/auth/login with valid credentials", "If OAuth: verify callback URL matches config"],
  "triggers": ["auth broken", "login not working", "401 error", "token invalid", "session expired"],
  "inputHints": ["error message", "HTTP status code", "user email"],
  "filePatterns": ["src/services/auth-service.ts", "src/middleware/auth.ts", "src/controllers/auth-controller.ts"],
  "tags": ["auth", "debugging", "security"],
  "source": "user",
  "confidence": 1
}'

c "$API/skills" '{
  "title": "Run and Debug Tests",
  "description": "How to run the test suite, debug failing tests, and write new tests for the TaskFlow project.",
  "steps": ["Run all tests: npm test", "Run specific suite: npm test -- --testPathPatterns=auth", "Debug with inspector: node --inspect-brk node_modules/.bin/jest --testPathPatterns=auth", "Check test database connection in .env.test", "Reset test database: npm run db:test:reset"],
  "triggers": ["run tests", "test failing", "write test", "debug test"],
  "inputHints": ["test file or pattern", "error output"],
  "filePatterns": ["tests/**/*.test.ts", "jest.config.ts"],
  "tags": ["testing", "debugging"],
  "source": "user",
  "confidence": 1
}'

c "$API/skills" '{
  "title": "Deploy to Staging",
  "description": "Process for deploying the TaskFlow application to the staging environment.",
  "steps": ["Ensure all tests pass: npm test", "Build Docker image: docker build -t taskflow:staging .", "Push to registry: docker push registry/taskflow:staging", "SSH into staging server", "Pull new image: docker pull registry/taskflow:staging", "Run migrations: npm run db:migrate", "Restart service: docker-compose up -d", "Verify health endpoint: curl https://staging.taskflow.dev/health"],
  "triggers": ["deploy staging", "push to staging", "staging deployment"],
  "inputHints": ["branch name", "version tag"],
  "filePatterns": ["Dockerfile", "docker-compose.yml", ".github/workflows/deploy.yml"],
  "tags": ["devops", "deployment", "staging"],
  "source": "user",
  "confidence": 1
}'

c "$API/skills" '{
  "title": "Add Database Migration",
  "description": "How to create and apply database migrations for schema changes in the TaskFlow project.",
  "steps": ["Create migration file: npm run migration:create -- --name=description", "Write UP SQL (schema change) in migrations/NNN_description.up.sql", "Write DOWN SQL (rollback) in migrations/NNN_description.down.sql", "Test locally: npm run db:migrate", "Verify with: npm run db:status", "Test rollback: npm run db:rollback"],
  "triggers": ["add migration", "change schema", "alter table", "new column", "database change"],
  "inputHints": ["table name", "column details", "change description"],
  "filePatterns": ["migrations/*.sql"],
  "tags": ["database", "migrations"],
  "source": "user",
  "confidence": 1
}'

c "$API/skills" '{
  "title": "Configure Rate Limiting",
  "description": "How to configure and tune rate limiting for API endpoints.",
  "steps": ["Edit rate limit config in src/config/rate-limits.ts", "Set limits per endpoint group (auth: 5/min, api: 100/min, webhooks: 50/min)", "Test with bombardment: npx autocannon -c 10 -d 5 http://localhost:3000/api/tasks", "Check response headers: X-RateLimit-Remaining, X-RateLimit-Reset", "Monitor 429 responses in logs"],
  "triggers": ["rate limit", "too many requests", "429 error", "throttle"],
  "inputHints": ["endpoint path", "desired limit"],
  "filePatterns": ["src/config/rate-limits.ts", "src/middleware/rate-limiter.ts"],
  "tags": ["security", "rate-limiting", "middleware"],
  "source": "user",
  "confidence": 1
}'

c "$API/skills" '{
  "title": "Troubleshoot Database Connection",
  "description": "Diagnose and fix database connectivity issues.",
  "steps": ["Check DATABASE_URL in .env", "Verify PostgreSQL is running: pg_isready", "Test connection: psql DATABASE_URL with SELECT 1", "Check connection pool stats in /health endpoint", "If pool exhausted: restart service and check for connection leaks", "Review slow query log for blocking queries"],
  "triggers": ["database down", "connection refused", "pool exhausted", "db timeout", "cannot connect to database"],
  "inputHints": ["error message", "database host"],
  "filePatterns": ["src/config/database.ts", ".env"],
  "tags": ["database", "debugging", "ops"],
  "source": "user",
  "confidence": 1
}'

c "$API/skills" '{
  "title": "Add Webhook Event Handler",
  "description": "How to add a new webhook event type to the TaskFlow webhook system.",
  "steps": ["Define event type in src/events/event-types.ts", "Create event payload interface", "Emit event from the service layer: eventBus.emit(EVENT_TYPE, payload)", "Register webhook delivery in src/services/webhook-service.ts", "Add event to webhook configuration UI", "Write test for event emission and delivery"],
  "triggers": ["add webhook", "new event", "webhook event"],
  "inputHints": ["event name", "payload shape"],
  "filePatterns": ["src/events/*.ts", "src/services/webhook-service.ts"],
  "tags": ["webhooks", "events", "api"],
  "source": "user",
  "confidence": 1
}'

c "$API/skills" '{
  "title": "Performance Profiling",
  "description": "How to profile and identify performance bottlenecks in the TaskFlow API.",
  "steps": ["Enable request timing middleware (already active in dev)", "Check /health for avg response times", "Profile specific endpoint: autocannon -c 50 -d 10 http://localhost:3000/api/tasks", "Analyze slow queries: SET log_min_duration_statement = 100 in PostgreSQL", "Use clinic.js for Node.js profiling: npx clinic doctor -- node dist/index.js", "Check LRU cache hit rates in logs"],
  "triggers": ["slow endpoint", "performance issue", "high latency", "optimize", "profiling"],
  "inputHints": ["endpoint path", "expected vs actual latency"],
  "filePatterns": ["src/middleware/timing.ts", "src/services/cache.ts"],
  "tags": ["performance", "profiling", "debugging"],
  "source": "learned",
  "confidence": 0.85
}'

c "$API/skills" '{
  "title": "Handle OAuth Callback Errors",
  "description": "Troubleshoot common OAuth callback failures for Google and GitHub providers.",
  "steps": ["Check callback URL matches exactly in OAuth provider console", "Verify OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in .env", "Check server logs for token exchange errors", "Test with curl: simulate authorization code exchange", "Verify redirect_uri encoding (no double-encoding)", "Check if user already exists with same email (account linking)"],
  "triggers": ["oauth callback failed", "oauth error", "google login broken", "github login broken"],
  "inputHints": ["OAuth provider", "error code from callback"],
  "filePatterns": ["src/controllers/auth-controller.ts", "src/services/oauth-service.ts"],
  "tags": ["auth", "oauth", "debugging"],
  "source": "learned",
  "confidence": 0.9
}'

echo "  ✓ 10 skills created"

# ── Skill Relations ───────────────────────────────────────────

echo "Creating skill relations..."

c "$API/skills/links" '{
  "fromId": "deploy-to-staging",
  "toId": "run-and-debug-tests",
  "kind": "depends_on"
}'

c "$API/skills/links" '{
  "fromId": "debug-authentication-issues",
  "toId": "handle-oauth-callback-errors",
  "kind": "related_to"
}'

c "$API/skills/links" '{
  "fromId": "add-rest-endpoint",
  "toId": "run-and-debug-tests",
  "kind": "related_to"
}'

c "$API/skills/links" '{
  "fromId": "configure-rate-limiting",
  "toId": "performance-profiling",
  "kind": "related_to"
}'

echo "  ✓ 4 skill relations created"

# ── Cross-graph links (skills → notes/tasks) ─────────────────

echo "Creating cross-graph skill links..."

c "$API/skills/links" '{
  "fromId": "debug-authentication-issues",
  "toId": "jwt-vs-session-tokens",
  "kind": "references",
  "targetGraph": "knowledge"
}'

c "$API/skills/links" '{
  "fromId": "configure-rate-limiting",
  "toId": "why-token-bucket-for-rate-limiting",
  "kind": "references",
  "targetGraph": "knowledge"
}'

echo "  ✓ 2 cross-graph skill links created"

# ── Relations ──────────────────────────────────────────────────

echo "Creating relations between notes..."

c "$API/knowledge/relations" '{
  "fromId": "architecture-decision-layered-services",
  "toId": "eventbus-for-domain-events",
  "kind": "relates_to"
}'

c "$API/knowledge/relations" '{
  "fromId": "why-token-bucket-for-rate-limiting",
  "toId": "performance-baseline",
  "kind": "relates_to"
}'

c "$API/knowledge/relations" '{
  "fromId": "jwt-vs-session-tokens",
  "toId": "oauth-implementation-notes",
  "kind": "relates_to"
}'

c "$API/knowledge/relations" '{
  "fromId": "error-handling-strategy",
  "toId": "validation-approach",
  "kind": "depends_on"
}'

c "$API/knowledge/relations" '{
  "fromId": "lru-cache-design",
  "toId": "performance-baseline",
  "kind": "supports"
}'

c "$API/knowledge/relations" '{
  "fromId": "wip-limits-rationale",
  "toId": "task-priority-sorting-convention",
  "kind": "relates_to"
}'

echo "  ✓ 6 note relations created"

# ── Attachments ───────────────────────────────────────────────

echo "Uploading attachments..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$SCRIPT_DIR/../assets"

a() { curl -sf -X POST "$1" -F "file=@$2" > /dev/null || echo "  FAIL: $1 ($2)"; }

a "$API/knowledge/notes/architecture-decision-layered-services/attachments" "$ASSETS/architecture-diagram.svg"
a "$API/knowledge/notes/performance-baseline/attachments" "$ASSETS/benchmark-results.csv"
a "$API/tasks/fix-task-ordering-on-status-change/attachments" "$ASSETS/error-sample.log"
a "$API/tasks/add-swaggeropenapi-documentation/attachments" "$ASSETS/api-flow.svg"

echo "  ✓ 4 attachments uploaded"

echo ""
echo "=== Seed complete ==="
echo "  15 notes, 20 tasks, 10 skills, 6 note relations, 4 skill relations, 2 cross-graph links, 4 attachments"
echo ""
echo "Open the UI at $BASE to explore the data."
