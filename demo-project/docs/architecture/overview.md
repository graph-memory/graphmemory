# Architecture Overview

TaskFlow is a modern project management platform built with a layered architecture designed for scalability, maintainability, and testability.

## System Layers

### 1. Controllers (HTTP Interface)

Controllers handle HTTP request/response mapping and input validation. They are thin adapters that delegate all business logic to services.

- [AuthController](../../src/controllers/auth-controller.ts) — registration, login, token management
- [TaskController](../../src/controllers/task-controller.ts) — task CRUD, status transitions, search
- [ProjectController](../../src/controllers/project-controller.ts) — project lifecycle management
- [WebhookController](../../src/controllers/webhook-controller.ts) — webhook registration and delivery

### 2. Services (Business Logic)

Services encapsulate domain rules, orchestration, and side effects (events, logging). They depend on abstract store interfaces, making them testable without a database.

- **AuthService** — user registration, JWT/session management, password hashing
- **TaskService** — task lifecycle, filtering, sorting, time tracking
- **ProjectService** — project CRUD, stats computation, archival
- **NotificationService** — notification delivery, digest scheduling
- **WebhookService** — event-triggered HTTP delivery with retry logic

### 3. Models (Domain Entities)

Rich domain models with business methods. Each model implements a `toJSON()` method for serialization.

- **UserModel** — profile management, role checks, preferences
- **TaskModel** — status transitions, priority sorting, time tracking
- **ProjectModel** — workflow configuration, WIP limits, stats computation
- **TeamModel** — membership management, ownership transfer
- **NotificationModel** — read/unread tracking, factory methods
- **WebhookModel** — delivery tracking, retry logic, circuit breaking

### 4. Middleware

Cross-cutting concerns applied to request pipelines:

- **Authentication** — JWT validation, session lookup
- **Authorization** — role-based access control, project membership
- **Rate Limiting** — token bucket algorithm per client
- **Error Handling** — centralized error formatting with logging
- **Request Logging** — structured logging with duration tracking

### 5. Utilities

Standalone, reusable modules with no domain dependencies:

- **Logger** — structured logging with levels, contexts, and custom handlers
- **EventBus** — in-process pub/sub for domain events
- **LRUCache** — time-aware LRU cache with hit rate tracking
- **RateLimiter** — token bucket + sliding window implementations
- **Validation** — composable validation functions

## Data Flow

```
HTTP Request
  → Middleware Pipeline (auth, rate limit, logging)
    → Controller (validate, parse)
      → Service (business logic, events)
        → Store Interface (persistence)
      ← Domain Model
    ← JSON Response
  ← HTTP Response
```

## Key Design Decisions

1. **Store interfaces over concrete implementations** — services depend on abstract interfaces, allowing easy swapping between in-memory, PostgreSQL, or any other storage
2. **Rich domain models** — models contain business logic (status transitions, validation) rather than being plain data containers
3. **Event-driven side effects** — notifications, webhooks, and activity logging are triggered via the EventBus, keeping services decoupled
4. **Composable middleware** — authentication, authorization, and rate limiting can be mixed and matched per route
5. **Slug-based routing** — projects use human-readable slugs for URLs

## Technology Stack

- **Runtime**: Node.js (ES2022)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL (via abstract store interface)
- **Cache**: Redis (via abstract cache interface)
- **Auth**: JWT + refresh tokens, OAuth (Google, GitHub)
- **Email**: SMTP / SendGrid / SES (configurable)
- **Storage**: Local / S3 / GCS (configurable)
