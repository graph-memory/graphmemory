# Redesign — Overview

> Status: design-stage. No code has been written yet. This directory captures
> the conceptual design that we agreed on during planning sessions, so we can
> reason about it later in context instead of relying on chat memory.

## Why redesign

The current codebase has grown through many iterations. The result is a system
that works, but suffers from accumulated coupling:

- The "store" layer mixes 7 entity stores, ACL, embeddings, hybrid search,
  reverse-import, and event emission. It is effectively the system core
  pretending to be a storage layer.
- REST routes, MCP tools, and store methods duplicate business logic. Adding
  an entity or operation requires touching 5+ places.
- File-mirror code is duplicated 4× (notes / tasks / skills / epics) with
  ~2200 lines of nearly identical functions.
- Cross-cutting concerns (auth, ACL, mirroring) leak into multiple layers
  with implicit contracts.
- Adding a new feature usually means editing files the author has not seen
  recently, and side effects show up later as bugs.

The redesign is **not** a rewrite from scratch. It is a re-decomposition of
the existing system into well-bounded packages, with a few new subsystems
added on top to support upcoming product features.

## Goals

1. **Clear boundaries between packages.** Every package has one job and a
   single direction of dependency. The compiler enforces what humans forget.
2. **One source of truth for business logic.** REST, MCP, chat, and any
   future adapters share a single `services` layer. No duplicated rules.
3. **Capability-based composition** instead of named "modes". The system is
   assembled at startup from independent capabilities (auth source, storage
   backend, file-mirror on/off, etc.) that combine freely.
4. **Multi-tenancy from day one** — even though the MVP runs as a small SaaS,
   `org_id` and `OrgContext` are structural and cannot be retrofitted later.
5. **Deployment flexibility** — the same codebase runs locally for one user,
   locally for a small team via git, and as a hosted SaaS, with no
   `if mode === ...` branches in the code.
6. **A runtime for bots and runners** that treats bots as first-class users
   and runners as plain processes acting on their behalf.

## Non-goals (explicit)

These are deliberately out of scope for the redesign and the MVP:

- Billing, plans, quotas, usage-based pricing.
- Two-factor auth, SSO, SAML.
- Schema-per-tenant or database-per-tenant isolation.
- Horizontal scaling, multi-region deployment, read replicas.
- Polished onboarding wizards, marketing site beyond the basics.
- Compliance certifications (SOC2, HIPAA, etc.).
- Exhaustive observability stacks (Prometheus/Grafana/Datadog).
- Multiple LLM providers from the start. One is enough; abstraction
  permits adding more later.
- Multiple email providers. One implementation behind the interface.
- Polished schema migrations for SQLite vs Postgres. Postgres is the
  production target; SQLite covers local mode and dev.

## Pace and scope

There is no deadline. Everything in scope (these documents minus the
explicit Non-goals above) is built **in full**, without MVP shortcuts:

- No "stuff logic into routes now, extract `services` later". `services`
  exists from day one.
- No "single big store now, split `store`/`log-store` later". Split from
  the start.
- No "skip RLS, add it before launch". RLS lands with the Postgres
  implementation.
- No duplicated mirror code "until we have time to refactor".
  `mirror-engine` is built generically before any spec is added.
- No `if mode === ...` branches "as a temporary measure".

Quality and architectural correctness take priority over speed. The
Non-goals list above is the full set of things skipped; nothing else
gets quietly deferred to "phase two" without explicit agreement and a
matching update to these documents.

## Process and contributors

The project is solo today. Collaborators are expected later, even if
only occasional. The infrastructure for that is set up **from day one**
rather than retrofitted, because adding it after the codebase is large
is much more disruptive than adding it on an empty repo.

**In place from the start:**

- **Strict TypeScript** — `strict: true`, no implicit any, no unused
  vars/params. Already true in the current code.
- **Lint, format, type-check, test** as pre-commit hooks and as a CI
  gate on push. Failing any of them blocks the commit.
- **Per-package `README.md`** — each `packages/*` has a short README
  (one paragraph: what it does, what it exports, what it depends on).
  Useful even for the solo author six months later.
- **Conventional commits** — `feat:`, `fix:`, `refactor:`,
  `docs:`, `chore:`, `test:`, with optional scope like
  `feat(store): ...`. Enforced by a commit-msg hook. The current
  history already mostly follows this style.
- **ADRs (Architecture Decision Records)** in `docs/adr/NNNN-title.md`.
  Every significant decision (one that would otherwise need a long
  chat to reconstruct) gets a short ADR. Format: context, decision,
  consequences. The redesign documents themselves are not ADRs — they
  are design notes; ADRs are smaller and more frequent.
- **CI on push** — build all packages, run all tests. Single workflow
  on GitHub Actions or equivalent. No deploy yet.
- **Branch strategy** — work happens on feature branches off `dev`;
  `main` is protected and only updated via fast-forward from `dev`
  at release points.

**Deferred until a second person actually joins:**

- Mandatory PR reviews (self-review on solo work is fine).
- CHANGELOG per package (semver discipline kicks in when there is an
  external consumer of a package).
- Issue templates, PR templates.
- CODEOWNERS file.
- Release process beyond "tag and push".

When the second contributor arrives, the deferred items are added in
one short pass. Everything in the "in place from the start" list is
already there and will not need to be retrofitted.

## What changes vs current system

| Area | Current | Redesign |
|---|---|---|
| Layout | Single project, src/ subfolders | npm workspaces monorepo, packages/ + apps/ |
| Business logic | Mixed across REST routes, MCP tools, store methods | Centralized in `services/` use-cases |
| Storage | better-sqlite3 directly accessed everywhere | `storage-api` interface, `storage-sqlite` and `storage-postgres` implementations |
| Multi-tenancy | None (one DB per workspace) | `org_id` everywhere; `OrgContext` propagated through services |
| Auth | Local users + JWT cookies + API keys | Multiple identity sources behind `auth` interface; bots are users |
| ACL | Implicit, scattered | Single `acl` package, operation registry, used by all adapters |
| File mirror | Always-on, 4× duplicated functions | Optional plugin, generic `mirror-engine` parametrized by per-entity specs |
| Attachments | In file-mirror directories only | `blob-store-api` interface, `-fs` and `-s3` implementations |
| Adapters | REST + MCP, each duplicating logic | REST + MCP + chat, all thin wrappers over `services` |
| Bots | Not in current system | First-class users with `AgentRole`s, runners, and a scheduler/orchestrator |

## Deployment scenarios

There are no longer named "modes". Any of these is just a configuration:

1. **Solo local.** Single user, no auth, SQLite, file-mirror on, attachments
   on FS, no bots (or in-process runner). Zero-config: empty YAML works.
2. **Local team via git.** Same as solo but several people sync the
   `.graphmemory/` directory through git. The set of mirrored entities is
   configurable; private entities (jobs, agent sessions, audit log) stay in
   the local DB.
3. **MVP SaaS.** Postgres backend, multi-tenant with `org_id` everywhere,
   self-service registration with email verification, full ACL, file-mirror
   off (or used for git integration only), attachments on FS or S3.

The same binary runs all three. Composition is decided at startup from the
config file.

## Document map

This redesign is split into focused documents. Read them in order if new:

- [01-capabilities.md](01-capabilities.md) — capability axes, valid
  combinations, why we rejected named "modes".
- [02-packages.md](02-packages.md) — package layout, dependency direction,
  build order, role of each package.
- [03-bot-runtime.md](03-bot-runtime.md) — bots, `AgentRole`s, runners, scheduler,
  orchestrator, agent sessions, the eight resolved design forks.
- [04-multi-tenancy.md](04-multi-tenancy.md) — what tenancy means here,
  `OrgContext`, workspaces, projects, three-layer ACL
  (`OrgRole`/`WorkspaceRole`/`ProjectRole`), isolation strategy, what
  is deferred for the MVP.
- [05-storage.md](05-storage.md) — storage abstraction, SQLite vs Postgres,
  blob store, file mirror as optional plugin.
- [06-open-questions.md](06-open-questions.md) — things we have not yet
  decided.
- [07-roadmap.md](07-roadmap.md) — implementation phases (Phase 0
  through Phase 8) and the cross-phase rules.

## Status of this design

- All structural decisions in these documents are agreed upon at the
  conceptual level.
- No code exists yet. The current `src/` is unchanged.
- The roadmap is in [07-roadmap.md](07-roadmap.md). All blocking
  questions have been answered.
- These documents are living. When something is decided or changed, update
  the relevant doc rather than the chat history.
