# Package layout

The redesign uses an npm workspaces monorepo with two top-level
directories:

- **`packages/`** — reusable libraries. No process lifecycle, no I/O at
  module load, no `main()`.
- **`apps/`** — runnable applications. They are composition roots that
  wire packages together and own process lifecycle.

The split is structural. A package may not import from an app. An app
may import from any package. Packages may only depend on packages lower
in the dependency graph; there are no cycles.

## Top-level layout

```
apps/
  cli/                       # graphmemory CLI
  server/                    # composition root, HTTP/MCP server
  runner/                    # graphmemory-runner (external runner binary)
  ui/                        # frontend application
  site/                      # marketing/landing site

packages/
  config/                    # YAML schema, validation, loader

  entities/                  # domain types (Task, Note, Skill, ...)
  contracts/                 # request/response DTOs

  storage-api/               # storage interface
  storage-sqlite/            # SQLite implementation
  storage-postgres/          # Postgres implementation

  blob-store-api/            # blob (attachment) interface
  blob-store-fs/             # filesystem implementation
  blob-store-s3/             # S3 implementation (optional, later)

  embeddings/                # embedding model wrapper
  search/                    # hybrid search (BM25 + vector + RRF + BFS)

  tenancy/                   # Organization, Membership, OrgContext

  auth/                      # identity interface
  auth-config/               # users from YAML
  auth-db/                   # users from database
  acl/                       # permissions, roles, operation registry

  store/                     # entity repositories
  log-store/                 # append-only entities (sessions, audit, ...)

  services/                  # use cases (business logic)

  api-rest/                  # REST adapter
  api-mcp/                   # MCP adapter
  client-api/                # typed client used by ui

  realtime/                  # WebSocket / SSE infrastructure

  mirror-engine/             # generic mirror engine (no entity knowledge)
  file-mirror/               # entity specs + writer + importer

  indexer/                   # markdown / code parsers
  watcher/                   # filesystem watcher

  llm-client/                # provider abstraction (Anthropic, OpenAI, ...)
  chat/                      # chat sessions, message history, tool loop

  email/                     # email interface
  email-smtp/                # SMTP implementation

  audit/                     # minimal audit log

  # Bot runtime
  jobs-queue/                # job queue backed by storage
  runner-protocol/           # types for server <-> runner communication
  runner-host/               # runtime for a runner process
  agent-runtime/             # launches LLM agents, captures sessions
  scheduler/                 # observes task state, emits intents
  orchestrator/              # turns intents into jobs

  ui-bundle/                 # built static assets of apps/ui (consumed by server)
```

## Why split this way

Three rules drive the split:

1. **One reason to change.** A package exists if and only if it has a
   single, distinct reason to be modified. `storage-sqlite` and
   `storage-postgres` are separate because they change for different
   reasons. `entities` and `contracts` are separate because the database
   schema and the wire format evolve at different speeds.

2. **One direction of dependency.** Every arrow points the same way.
   `services` depends on `store`; `store` does not depend on `services`.
   `ui` depends on `client-api`; `client-api` does not know `ui` exists.
   The compiler enforces this; cycles are forbidden.

3. **One owner of variants.** When there is a choice (storage backend,
   auth source, blob backend), exactly one package knows about all the
   variants and selects between them. Nothing else sees the variants.

## Package roles

### Foundation (leaf packages)

- **`config`** — parses and validates YAML. Knows the cross-axis
  constraints from [01-capabilities.md](01-capabilities.md). Produces a
  fully validated config object.
- **`entities`** — domain types. Pure TypeScript. No I/O. May be
  imported by anything, including the UI.
- **`contracts`** — request/response DTOs for adapters. Imports from
  `entities`. The wire format. May be imported by `client-api` and
  through it by the UI.
- **`storage-api`** — interface for the storage layer. Async by
  contract. `OrgContext` is a first-class parameter. No SQL types leak
  out.
- **`blob-store-api`** — interface for binary content. `put`, `get`,
  `delete`, `exists`, `stream`.
- **`embeddings`** — abstraction over embedding models. Injected into
  `store`. Heavy ML dependency lives here only.
- **`tenancy`** — Organization, Membership, `OrgContext` types. Minimal
  package; mostly types and a tiny resolver. Used by everything that
  reads or writes data.
- **`runner-protocol`** — pure types for server↔runner communication.
  Both server and runner depend on it; nothing else.
- **`mirror-engine`** — generic engine for "serialize an entity to a
  directory of markdown + events.jsonl + attachments". Knows nothing
  about specific entity types; parameterized by `MirrorSpec` objects.
- **`watcher`** — filesystem watcher. Emits "file changed" events.
  Knows nothing about entities or stores.

### Storage and identity

- **`storage-sqlite`** — implementation of `storage-api` on
  better-sqlite3 + sqlite-vec + FTS5. Used in local mode and dev. Wraps
  synchronous calls in `Promise.resolve()` to honor the async interface.
- **`storage-postgres`** — implementation on Postgres + pgvector +
  tsvector. Required when `tenancy.enabled = true`. Naturally async.
- **`auth`** — identity interface (User, Session, ApiKey).
- **`auth-config`** — reads users from YAML at startup.
- **`auth-db`** — reads/writes users in storage; supports registration,
  password reset, API key issuance.
- **`acl`** — permission model. Defines an **operation registry**: every
  use case in `services` is registered under a stable name like
  `tasks.create`, and ACL grants/denies permissions on those names.
  Both REST and MCP filter their surface through ACL automatically.
- **`email`** + **`email-smtp`** — interface and one implementation for
  registration, invitations, password reset.
- **`audit`** — minimal append-only log of significant events
  (login/logout, user/org create/delete, role changes, mass deletes).

### Search

- **`search`** — hybrid search (BM25 + vector + RRF + graph BFS). Lives
  in its own package because it is non-trivial and evolves
  independently. Depends on `storage-api`.

### Store and services

- **`store`** — repositories per entity type. Depends on `storage-api`,
  `entities`, `embeddings`, `search`, `tenancy`. All methods take an
  `OrgContext`. Emits domain events on mutations.
- **`log-store`** — repositories for append-only "log-like" entities:
  agent messages, audit events, run history. Same backend as `store`
  but a different access pattern (large volume, time-ordered, no
  in-place edits).
- **`services`** — use cases. Each use case is a function that takes
  `OrgContext`, validates input via ACL, calls `store`, and returns a
  domain object. Use cases are the unit of authorization, the unit of
  testing, and the unit exposed by adapters. No HTTP, no JSON, no MCP
  awareness.

### Adapters

- **`api-rest`** — REST adapter. Each route is a thin wrapper that
  parses HTTP, builds an `OrgContext` from the session, and calls one
  `services` use case. Depends on `services`, `contracts`, `auth`,
  `acl`.
- **`api-mcp`** — MCP adapter. Each tool is a thin wrapper around the
  same use cases. The set of exposed tools is filtered through ACL: a
  bot only sees the tools it has permission to call.
- **`client-api`** — typed client for `api-rest`. Imports `contracts`.
  Used by the UI.
- **`realtime`** — WebSocket / SSE infrastructure for live updates.
  Used by chat (streaming responses), runners (live session events),
  and the UI (live task updates).

### File mirror (optional)

- **`mirror-engine`** — generic engine described above. Leaf package.
- **`file-mirror`** — collection of `MirrorSpec` definitions for the
  mirrored entity types, plus `MirrorWriter` (DB → files) and
  `MirrorImporter` (files → DB). Depends on `store`, `mirror-engine`,
  `blob-store-api` (for attachments).

### Indexing

- **`indexer`** — markdown and code parsers. Pure: given a file, parse
  it and write the result to `store`. Does not know about the watcher.
- **`watcher`** — leaf package, emits filesystem events.
- The wiring (watcher events → indexer calls) lives in
  `apps/server`.

### LLM and chat

- **`llm-client`** — provider abstraction. One implementation on the
  MVP (Anthropic), more later behind the same interface.
- **`chat`** — chat sessions, message history, system prompts, tool
  execution loop. Depends on `services` (tools call use cases),
  `llm-client`, `store`.

### Bot runtime

- **`jobs-queue`** — job queue backed by `storage-api`. State machine,
  lease/heartbeat, dead-letter handling. No coupling to specific job
  payloads.
- **`runner-host`** — runtime for a runner process. Claim → execute →
  report loop. Used both by `apps/runner` (external runners) and by
  `apps/server` when `bots.runner_mode = in_process`.
- **`agent-runtime`** — launches an LLM agent (Claude Code or similar)
  as a child process or library, hands it the bot's MCP credentials,
  captures the session events, persists them via `services`.
- **`scheduler`** — observes task state changes (via store events) and
  emits intents ("task X should be assigned to bot Y", "task Z is
  ready for review"). Tree-based by default; LLM-based as an option
  behind the same interface.
- **`orchestrator`** — turns scheduler intents into jobs and places
  them on the queue.

### Apps

- **`apps/cli`** — `graphmemory` command-line entry point. Parses
  argv, picks the right composition for the requested subcommand, and
  delegates to `apps/server` or runs a one-shot operation (`index`,
  `users add`).
- **`apps/server`** — the composition root. `bootstrap.ts` reads the
  config, calls factories in order, wires up subsystems, and starts the
  HTTP/MCP listeners. This is the **only** place where the full set of
  capabilities is visible. Should remain small (~300 lines, growing
  linearly with new optional subsystems).
- **`apps/runner`** — the external runner binary. Connects to a server
  by URL + API key, registers itself, and runs `runner-host` against a
  configured set of capabilities.
- **`apps/ui`** — the frontend application. Imports `client-api` and
  `contracts`. Builds to a bundle that `apps/server` can serve via
  `ui-bundle`.
- **`apps/site`** — landing site. Self-contained. No dependency on the
  rest of the system.

## Dependency direction (high level)

```
                    config
                      |
                      v
                 entities, contracts
                /     |     \
               v      v      v
       storage-api  blob-store-api  embeddings
            |          |
            v          v
   storage-sqlite   blob-store-fs
   storage-postgres blob-store-s3
            \         /
             v       v
              tenancy
                 |
                 v
              auth, acl
                 |
                 v
               search
                 |
                 v
               store, log-store
                 |
                 v
              services
                 |
       +---------+---------+---------+
       v         v         v         v
   api-rest   api-mcp     chat    file-mirror
       |         |         |         |
       v         v         v         v
            (apps/server composition root)
                          |
                          v
                  apps/server  ←→  apps/runner
                          |
                          v
                   apps/cli, apps/ui
```

## Build order

Layered from leaves to roots:

1. `config`, `entities`, `contracts`, `storage-api`, `blob-store-api`,
   `embeddings`, `runner-protocol`, `mirror-engine`, `watcher`,
   `tenancy`, `email` (interfaces), `llm-client` (interface).
2. Implementations: `storage-sqlite`, `storage-postgres`, `blob-store-fs`,
   `blob-store-s3`, `auth-config`, `auth-db`, `email-smtp`.
3. `auth` (interface — actually depends only on `tenancy`, can move
   earlier), `acl`, `search`.
4. `store`, `log-store`, `audit`.
5. `services`, `file-mirror`, `indexer`.
6. `chat`, `jobs-queue`, `runner-host`, `agent-runtime`, `scheduler`,
   `orchestrator`.
7. `realtime`, `client-api`.
8. `api-rest`, `api-mcp`.
9. `apps/ui` (which builds to `ui-bundle`).
10. `apps/server`, `apps/runner`, `apps/cli`.
11. `apps/site` (independent, can build any time).

`tsc --build` with project references is the recommended approach
because it understands this graph and incrementally rebuilds only what
changed.

## Notes on a few non-obvious choices

### Why `entities` and `contracts` are separate

They look the same on day one. They are not the same on day 90. The
database schema accumulates internal fields (versioning, soft-delete
markers, embedding columns); the wire format hides them. Splitting now
costs nothing and prevents `ui` from accidentally importing
`embedding: number[]`.

### Why `services` is more than glue

`services` is the only place that knows the complete shape of a use
case: input validation, ACL check, transactional store calls, event
emission, error mapping. REST and MCP routes become 5–10 lines each.
Without this layer, the same logic ends up duplicated in every adapter
and drifts.

### Why `log-store` is separate from `store`

Tasks and notes are read/write entities with frequent updates and
small payloads. Agent sessions and audit logs are append-only,
high-volume, time-ordered, never updated in place, and rarely full-text
indexed. They need different access patterns and benefit from a
dedicated repository surface, even if both end up in the same physical
database.

### Why `mirror-engine` is generic and `file-mirror` is specific

`mirror-engine` is the de-duplicated form of the current 2245 lines of
near-identical mirror code. It knows how to serialize *something* to a
directory; it knows nothing about which entity types exist.
`file-mirror` registers per-entity `MirrorSpec` objects with it. Adding
a new mirrored entity becomes one new spec file, not a fourth copy of
the same 200 lines.

### Why `runner-host` is shared between in-process and external runners

A runner is the same loop in both cases: claim a job, execute, report.
The difference is just where the loop runs. Sharing the package means
the in-process and external paths cannot drift. The composition root
in `apps/server` instantiates the loop directly when
`bots.runner_mode = in_process`; `apps/runner` instantiates it as its
main work loop.

### Why CLI is a separate app

CLI is a user interface, just like the web UI. Mixing it into
`apps/server` blurs the distinction between "server lifecycle" and
"command-line entry points". A separate `apps/cli` keeps the
composition root focused on serving and lets the CLI own argv parsing,
subcommand dispatch, and one-shot operations.

## What this layout costs

- **More files and directories.** A redesign of this size produces
  ~25–30 packages, each with its own `package.json`, `tsconfig.json`,
  and tests directory. This is real overhead and feels noisy in the
  first week.
- **Stricter contracts.** Every interface between packages becomes a
  versioned API. Changing it breaks downstream packages at compile
  time. This is a feature, not a bug, but it requires discipline.
- **Slower initial development.** A simple change that used to touch
  one file now touches one package; a cross-cutting change touches
  several. The compiler will help, but the typing volume is higher.

## What this layout gives back

- **Compiler-enforced boundaries.** The architecture is real, not just
  aspirational. The UI cannot import `store`. `store` cannot import
  `services`. There are no cycles.
- **Localized changes.** A bug in mirror serialization is one package.
  A bug in hybrid search is one package. A bug in REST validation is
  one package.
- **Independent tests.** Every package tests in isolation with fakes
  for its dependencies. Tests run fast and tell you exactly which
  layer is broken.
- **Replaceable parts.** Swapping SQLite for Postgres, FS for S3,
  Anthropic for OpenAI, tree planner for LLM planner — all of these are
  factory swaps in the composition root, not rewrites.
