# Implementation order

This document captures the order in which the redesign is built. It is
the answer to "what comes first" — Q3 in the original open questions.

The order is **not** "local first, SaaS second" and it is not "SaaS
first, local second". It is **hybrid**: SQLite is the first storage
backend, but every architectural invariant that a multi-tenant SaaS
needs is enforced in code from the very first commit. Postgres,
self-service registration, full ACL, and email come later as
**additional implementations** of contracts that already exist, not as
a second pass that has to be retrofitted.

The reasoning behind this choice is in the chat history of the planning
sessions; the short version is below.

## Why hybrid (and not "local first" or "SaaS first")

**Local-first** is tempting because the existing code already targets
that scenario, SQLite is easier to develop against, and there is a
working system to dogfood early. The trap is the temptation to skip
multi-tenancy discipline "for now" — a single missed `OrgContext`
parameter, a single raw SQL query that forgets `org_id`, and the
invariant is broken before Postgres ever shows up. By the time
tenancy is "enabled", it is full of holes.

**SaaS-first** avoids that trap by forcing every decision through the
hardest constraint from day one. The cost is real: a Postgres
instance, an SMTP emulator, and a registration flow are needed before
the system can be used at all. The existing code is reusable only in
fragments. Time-to-dogfood is far longer.

**Hybrid** keeps the development ergonomics of local-first while
locking in the discipline of SaaS-first:

- **`OrgContext` is mandatory in code from the first store method.**
  Even though the runtime value is always `"default"` until the
  Postgres backend lands, the parameter is there, the store builder
  rejects queries without it, and tests assert isolation between two
  fake orgs.
- **Operation registry exists from the first `services` use case.**
  Even though `acl.level = simple` (one user has access to everything),
  every use case is registered under a stable name and REST/MCP/chat
  generate their surfaces by enumerating the registry. When `full`
  ACL is added later, no use case has to be touched.
- **`mirror-engine` is generic from the first spec.** No transitional
  duplicated mirror code "until we have time to refactor".
- **`storage-api` is async from the first method.** SQLite calls are
  wrapped in `Promise.resolve()`. No transitional sync interface.
- **No `if mode === ...` branches.** Capabilities are factories from
  the first composition root.

The Postgres implementation, when it is added, is a new package that
implements an existing contract. It is not a refactor of any consumer.

## The phases

Each phase is a coherent step that leaves the system in a usable
state. The phases are **not** estimates — there is no deadline (see
`00-overview.md`, "Pace and scope"). They are an ordering, not a
schedule.

### Phase 0 — Monorepo skeleton

Goal: an empty but valid workspace that the rest of the work can grow
into.

- npm workspaces monorepo with `packages/` and `apps/` directories.
- `tsconfig.base.json` with strict mode; per-package `tsconfig.json`
  with project references.
- Root scripts: `build`, `test`, `lint`, `format`, `typecheck`.
- Pre-commit hook running lint + format + typecheck + test on
  changed packages.
- CI workflow (GitHub Actions or equivalent): same checks on push.
- `docs/adr/` directory with one ADR explaining "why monorepo and why
  npm workspaces".
- Conventional-commit lint hook on `commit-msg`.

At the end of Phase 0 the repo builds (with no real code) and the
process discipline from `00-overview.md` is in force.

### Phase 1 — Foundation packages

Goal: the leaf packages of the dependency graph, with no behavior yet
but with the contracts that everything depends on.

- `config` — YAML schema + validator. Cross-axis constraints from
  `01-capabilities.md` are enforced. Empty file is a valid config.
- `entities` — domain types, pure TS, no I/O.
- `contracts` — request/response DTOs, depends on `entities`.
- `storage-api` — async interface; `OrgContext` mandatory in every
  method; query builder shape; vector and FTS APIs; migrations runner
  shape.
- `blob-store-api` — `put`, `get`, `delete`, `exists`, `list`.
- `tenancy` — `Organization`, `Membership`, `OrgContext` types and a
  tiny resolver. The default-org constant lives here.
- `embeddings` — abstraction over the embedding model.
- `runner-protocol` — pure types for server↔runner communication.
- `mirror-engine` — generic engine, leaf package, no entity knowledge.
- `watcher` — filesystem watcher, leaf package.
- `email` interface (no implementation yet).
- `llm-client` interface (no implementation yet).

Tests are unit tests against the interfaces (using fakes).

### Phase 2 — SQLite backend and identity (config-source)

Goal: the system can persist data and identify users in local mode.

- `storage-sqlite` — implementation of `storage-api` on
  `better-sqlite3` + `sqlite-vec` + FTS5. Sync internally, wrapped to
  satisfy the async contract. Migrations runner ships with this
  package.
- `auth-config` — users from YAML.
- `auth` interface — `User`, `Session`, `ApiKey`. The interface lives
  with `auth-config` for now; a separate `auth` package may be
  unnecessary if there is only one implementation.
- `acl` — operation registry, permissions evaluator. Three-layer
  grant tables (`org_memberships`, `workspace_grants`,
  `project_grants`) exist from this phase, even though the local user
  has one row in each. `OrgRole` / `WorkspaceRole` / `ProjectRole`
  enums defined. Every use case **must** be registered, even at
  simple level. See [04-multi-tenancy.md](04-multi-tenancy.md),
  "Three-layer ACL".
- `blob-store-fs` — filesystem implementation of `blob-store-api`.
- `audit` — minimal append-only event log.

Integration tests at this phase create two orgs, two workspaces (one
in each org and two in the same org), and two projects, and assert
that data written under one is invisible from the others without
explicit grants. **This test exists from Phase 2 onward** so the
three-layer ACL invariant is locked in before any consumer code is
written.

### Phase 3 — Store, services, and adapters

Goal: the use cases exist, are registered, and are reachable through
REST and MCP.

- `search` — hybrid BM25 + vector + RRF + BFS, on `storage-api`.
- `store` — repositories per entity type. Every method takes
  `OrgContext`. Domain events emitted on mutations.
- `log-store` — append-only repositories for sessions, audit,
  task events, agent messages.
- `services` — use cases. Every use case takes `OrgContext`,
  validates input, checks ACL, calls store, emits events. Every use
  case is registered in the operation registry.
- `api-rest` — REST adapter, thin wrapper per route over a single
  use case. Surface generated from the registry, filtered by ACL.
- `api-mcp` — MCP adapter, same shape, same registry, same
  filtering.
- `apps/server` — composition root. Reads config, instantiates
  factories, mounts the chosen adapters. Single file from top to
  bottom.
- `apps/cli` — CLI entry point, delegates to server or to one-shot
  operations.

At the end of Phase 3 the system is usable from the CLI. There is no
UI, no file mirror, no bots, no chat. Just the data layer and its
adapters. The author can dogfood it for tasks/notes/skills CRUD.

### Phase 4 — File mirror and indexer

Goal: local-mode workflow (humans editing markdown files in an IDE,
git as the sync mechanism) is restored.

- `file-mirror` — `MirrorSpec` per entity type, `MirrorWriter`
  (DB → files), `MirrorImporter` (files → DB). Built on
  `mirror-engine`. No duplicated functions per entity.
- `indexer` — markdown and code parsers writing to `store`.
- Wiring of `watcher` events to `indexer` and `file-mirror` lives in
  `apps/server`.

A migration script reads the current on-disk format
(`.notes/`, `.tasks/`, `.skills/`, `.epics/`) without changing the
layout, and the new specs reproduce the existing frontmatter and
body shapes. Existing local installations should not lose data.

### Phase 5 — Bot runtime

Goal: the bot subsystem from `03-bot-runtime.md` is built end to end,
in full.

- `jobs-queue` — SQL-backed job queue, lease/heartbeat,
  dead-letter handling.
- `runner-host` — claim/execute/report loop. Used by both
  `apps/runner` and `apps/server` (in-process mode).
- `llm-client` — Anthropic implementation (only). See
  `03-bot-runtime.md`, "LLM provider and agent runtime".
- `agent-runtime` — launches Claude Code as a subprocess, wires its
  MCP credentials to the bot identity, streams the session events
  back through `services`. Only implementation in the first build.
- `scheduler` — observes task events, emits intents. **Both tree and
  LLM implementations** behind the same `PlannerInput → PlannerIntent[]`
  interface, in parallel from this phase (per the resolved Q1 update,
  LLM planner is in scope).
- `orchestrator` — turns intents into jobs.
- `apps/runner` — external runner binary.
- Bot user records (rows in `users` with `type=bot`), `AgentRole`
  definitions, AgentRole snapshot capture in sessions. Local-mode
  bot and `AgentRole` declarations from YAML
  (`.graphmemory/agent-roles/`).

At the end of Phase 5 a local user can declare bots and AgentRoles
in YAML, the planner reacts to task state changes, jobs flow through
the queue, runners execute them, agents act through MCP as the bot,
and the unified timeline records everything.

### Phase 6 — Chat, realtime, and UI

Goal: the web UI is back, with chat and live updates.

- `realtime` — WebSocket / SSE infrastructure.
- `chat` — chat sessions, message history, tool execution loop on
  top of `services` and `llm-client`.
- `client-api` — typed REST client used by the UI.
- `apps/ui` — frontend. Imports `client-api` and `contracts`. Builds
  to a static bundle consumed by `apps/server` via `ui-bundle`.
- `apps/server` mounts the UI when `api.ui = true`.

At the end of Phase 6 the local-mode product (solo and team-via-git
scenarios) is **functionally complete**. Everything in the redesign
that does not require Postgres is shipped.

### Phase 7 — Postgres backend and SaaS capabilities

Goal: the SaaS deployment scenario from `00-overview.md` is reachable.

- `storage-postgres` — implementation on `pg`, `pgvector`, `tsvector`.
  Migrations runner with the same logical schema as `storage-sqlite`.
  Row-level security policies on every relevant table. Each
  transaction sets `app.current_org` from the `OrgContext`.
- `auth-db` — users from the database, password hashing (scrypt or
  argon2 at safe parameters), session cookies, API key issuance.
- `email-smtp` — SMTP implementation of the `email` interface.
- `acl` full level — three-layer grants (`org_memberships`,
  `workspace_grants`, `project_grants`) with `OrgRole`,
  `WorkspaceRole`, and `ProjectRole` enums. Creator-becomes-owner
  convention. See [04-multi-tenancy.md](04-multi-tenancy.md),
  "Three-layer ACL".
- Self-service registration flow with email verification, password
  reset, invitations.
- Org creation on registration, member invitation, member removal,
  workspace/project grant management, account deletion, org deletion
  (chunked background).
- `apps/server` adds Postgres and SaaS factories to the composition
  root. Same binary, different config.
- Production deployment story: managed Postgres, SMTP provider,
  reverse proxy with TLS, Sentry, daily backups.

At the end of Phase 7 the system can be deployed as the SaaS scenario.
Because every consumer (`store`, `services`, `api-rest`, `api-mcp`,
`apps/server`) was written from Phase 2 onward against `storage-api`
with `OrgContext` mandatory and the operation registry enforced,
adding Postgres and full ACL is **additive**, not a refactor.

### Phase 8 — Polish, observability, and the marketing site

Goal: the public release surface, modest in scope.

- Minimal landing page (`apps/site`) — what, why, screenshots,
  sign-up button, link to docs.
- Documentation site or `docs/` build for end users.
- Sentry integration, Pino logs structured for production.
- Uptime check.
- Backups verified.

This is the smallest phase by content; it is intentionally last
because polish accumulated against an unstable system is wasted.

## Cross-phase rules

Some rules apply throughout, not at any one phase:

1. **No phase ships with a missing invariant.** If `OrgContext` is
   skipped in one method "for the demo", that method is broken until
   it is fixed. There is no "we'll add it back".
2. **Tests are written with each phase, not after.** Two-org
   isolation tests exist from Phase 2. Operation registry tests exist
   from Phase 3. Bot runtime tests exist from Phase 5.
3. **ADRs are written when decisions are made**, not after the fact.
   Each phase produces several small ADRs in `docs/adr/`.
4. **The composition root stays readable.** `apps/server` grows by
   constant amount per new optional subsystem. If it ever feels
   unreadable, that is a refactor before the next phase begins.
5. **Existing on-disk format from the current code is preserved**
   through the migration in Phase 4. Users with existing
   `.notes/.tasks/.skills/.epics/` directories must not lose data.
6. **No phase contains "and we will refactor X later".** If something
   is wrong with X, it is fixed before the phase ends. Deferral is
   possible only by adding an item to the explicit Non-goals in
   `00-overview.md` and discussing it.

## What is not in this document

- **Time estimates.** There are no dates, no week counts, no sprint
  numbers. The order is what matters; the rate is what it is.
- **Detailed task lists per phase.** Each phase will produce a
  working set of TODOs when it begins; they live in the issue
  tracker, not here.
- **Internal package APIs.** Those live with the packages.
- **Reasons to deviate from the order.** The order can be revisited,
  but deviations require updating this document, not chat memory.
