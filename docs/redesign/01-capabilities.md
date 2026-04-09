# Capabilities, not modes

## The principle

The system is **not** organized around named deployment modes (`local`,
`team`, `server`). It is organized around independent **capability axes**
that are configured separately and combine freely.

A "deployment scenario" is therefore not a label but a specific set of
capability values. Solo-local is one such set; SaaS is another. Both run
the same binary; only the configuration differs.

## Why not modes

Named modes are tempting because they are easy to document ("pick `local`
or `server`"), but they hurt the architecture in three ways:

1. **Modes bundle decisions.** Choosing `local` silently picks
   `auth=none`, `storage=sqlite`, `file_mirror=on`, `tenancy=off` and so
   on. The relationships between those choices become invisible. When a
   user wants "local but with managed users", there is no mode for it.
2. **Modes hide cross-cutting links.** Six months later nobody remembers
   exactly what `local` enables, and changing one default in a subsystem
   silently affects every "mode" that depends on it.
3. **Modes invite `if mode === ...` branches.** The promise to "never
   write that" never holds. Within a year the branches are everywhere.

Capabilities replace modes with explicit, independent axes. Each axis has
its own factory, its own tests, and its own implementations. A
"deployment scenario" is a comment in a YAML file, not a code path.

## The capability axes

These are the axes that the system exposes. Each is independent unless
explicitly noted as a constraint in [validation](#configuration-validation).

### Identity & access

- **`auth.source`** — `config | database`. Where user records come from.
  `config` reads users from a YAML file at startup; `database` stores
  them in the main store and supports registration.
- **`auth.registration`** — `false | self_service`. Whether new accounts
  can be created from outside. (`invite_only` is reserved for later.)
- **`auth.email_verification`** — `false | true`. Whether email must be
  verified during registration. Implies `email.enabled = true`.
- **`acl.level`** — `simple | full`. `simple` means a single user has
  access to everything; `full` enables roles and per-resource permissions.

### Multi-tenancy

- **`tenancy.enabled`** — `false | true`. Whether the system isolates data
  between organizations. When `true`, every record carries `org_id` and
  every query filters by it. When `false`, a single implicit org is used.
- **`tenancy.default_org_id`** — string. Used when `tenancy.enabled` is
  `false`. Default is `"default"`.
- **`tenancy.isolation`** — `row_level`. The only supported strategy in
  the MVP. `schema_per_tenant` is reserved for the future.

### Storage

- **`storage.backend`** — `sqlite | postgres`. SQLite is the default and
  is used for local mode and dev. Postgres is required when
  `tenancy.enabled` is `true`.
- **`storage.path`** (for SQLite) — filesystem path to the database file.
- **`storage.connection`** (for Postgres) — connection string or
  structured config.

### Blob storage (attachments)

- **`blobs.backend`** — `fs | s3`. Default is `fs`. `s3` is optional and
  may be added later without code changes (only swapping the factory).
- **`blobs.fs.path`** — filesystem path for the FS backend.
- **`blobs.s3.*`** — S3 bucket, region, credentials, etc.

### File mirror

- **`file_mirror.enabled`** — `true | false`. When `true`, entities are
  mirrored to a directory tree as markdown files for human editing and
  git sync.
- **`file_mirror.path`** — directory root, e.g. `./.graphmemory`.
- **`file_mirror.shared`** — list of entity types that are mirrored.
  Typically `workspaces`, `projects`, `tasks`, `notes`, `skills`,
  `epics`, `agent_roles`. Bot user records are **not** mirrored
  (they hold API keys); only `AgentRole` definitions are.
- **`file_mirror.local_only`** — list of entity types that stay in the
  database even when the mirror is enabled. Typically `jobs`,
  `agent_sessions`, `audit_log`, search indexes, caches.

### Bot runtime

- **`bots.enabled`** — `false | true`. Whether the bot subsystem is
  active.
- **`bots.runner_mode`** — `in_process | external`. `in_process` runs
  one runner inside the server process (suitable for local). `external`
  expects separate runner binaries to register and pick up jobs.

### Planner

- **`planner.enabled`** — `false | true`.
- **`planner.mode`** — `tree | llm | both`. The tree planner uses
  declarative rules; the LLM planner is an optional smarter mode that
  shares the same input/output interface.

### API surfaces

- **`api.rest`** — `true | false`. Mount the REST API.
- **`api.mcp`** — `true | false`. Mount the MCP server.
- **`api.chat`** — `false | true`. Mount the chat backend.
- **`api.ui`** — `true | false`. Serve the bundled UI.

Every surface is optional. A headless backend is `rest=false, mcp=true,
chat=false, ui=false`. A pure REST API server is the opposite.

### Workspaces

- **`workspaces.source`** — `config | api`. Either fixed in the YAML or
  created dynamically through the API.

### LLM providers

- **`llm.providers`** — list of configured providers. The MVP supports
  one (whichever is picked first); the abstraction allows more later.

### Email

- **`email.enabled`** — `false | true`. Required when registration or
  invitations are used.
- **`email.provider`** — `smtp` for the MVP. Other providers (Postmark,
  SES, Resend) can be added behind the same interface later.
- **`email.smtp.*`** — host, port, user, password, from address.

### Audit

- **`audit.enabled`** — `true` for the MVP, always. Minimal event log
  used for debugging and incident response, not compliance.

## Configuration validation

Not all combinations are valid. The config loader rejects invalid
combinations at startup with explicit error messages. Examples:

- `tenancy.enabled = true` requires:
  - `storage.backend = postgres`
  - `acl.level = full`
  - `auth.source = database`
  - `auth.registration = self_service`
  - `email.enabled = true`
- `auth.registration = self_service` requires `email.enabled = true`
  (for verification and password reset).
- `storage.backend = sqlite` requires `tenancy.enabled = false`.
- `bots.enabled = true` requires at least one configured LLM provider.

The validator lives in its own package (`@graphmemory/config`) and is
the only place that knows the full set of cross-axis constraints. It
must produce actionable error messages, not stack traces.

## Defaults

Defaults live in the factory of each subsystem, not in a global defaults
file. The reason: a global defaults file drifts away from the code that
actually uses it.

The minimum valid configuration is an **empty file**. Running
`graphmemory serve` without a config produces a working solo-local setup:

- `auth.source = config` with one default user
- `acl.level = simple`
- `tenancy.enabled = false`
- `storage.backend = sqlite`, file in `.graphmemory/db.sqlite`
- `blobs.backend = fs`, files in `.graphmemory/attachments/`
- `file_mirror.enabled = true`, root in `.graphmemory/`
- `bots.enabled = false`
- `planner.enabled = false`
- `api.rest = true, api.mcp = true, api.ui = true, api.chat = false`
- `workspaces.source = config`
- `audit.enabled = true`

This matches the current zero-config behavior of the existing code.

## Capabilities are not feature flags

Capabilities are decided **at startup**. They shape how the system is
assembled. Once running, they do not change without a restart.

Feature flags are decided **per request** at runtime. They control
behavior, not assembly. The system has no feature flags right now and
does not need them. If they become useful later, they are a separate
mechanism layered on top — not a reuse of capability config.

## Example configurations

### Solo local (zero config)

```yaml
# empty file
```

### Local team via git

```yaml
file_mirror:
  enabled: true
  path: ./.graphmemory
  shared: [workspaces, projects, tasks, notes, skills, epics, agent_roles]
  local_only: [jobs, agent_sessions, audit_log]

bots:
  enabled: true
  runner_mode: in_process

planner:
  enabled: true
  mode: tree

llm:
  providers:
    - name: anthropic
      api_key_env: ANTHROPIC_API_KEY
```

### MVP SaaS

```yaml
auth:
  source: database
  registration: self_service
  email_verification: true

acl:
  level: full

tenancy:
  enabled: true

storage:
  backend: postgres
  connection: ${DATABASE_URL}

blobs:
  backend: fs
  fs:
    path: /var/lib/graphmemory/attachments

file_mirror:
  enabled: false

bots:
  enabled: true
  runner_mode: external

planner:
  enabled: true
  mode: tree

email:
  enabled: true
  provider: smtp
  smtp:
    host: ${SMTP_HOST}
    port: 587
    user: ${SMTP_USER}
    pass: ${SMTP_PASS}
    from: noreply@graphmemory.example

api:
  rest: true
  mcp: true
  chat: true
  ui: true

workspaces:
  source: api

llm:
  providers:
    - name: anthropic
      api_key_env: ANTHROPIC_API_KEY
```

## What this gives us

- **One binary, many deployments.** The same `graphmemory serve` runs
  every scenario. Differences are configuration, not branches.
- **One composition root.** `apps/server/bootstrap.ts` reads top to
  bottom: parse config → validate → instantiate factories → start.
  Anyone can audit how the system is assembled by reading one file.
- **Local subsystem knowledge.** Each subsystem owns its own variants
  and defaults. Nothing else has to know about all storage backends or
  all auth sources.
- **Tests describe configurations.** Integration tests pass in a config
  and assert behavior. There is no test infrastructure that knows about
  "modes".

## What this requires from us

Capability architecture is a discipline, not a free lunch. It only works
if:

1. Every subsystem hides its variants behind an interface. No imports
   like `import { sqliteStore } from '@graphmemory/storage-sqlite'`
   anywhere except inside the storage factory.
2. Every variant has tests. If `auth-config` and `auth-db` both exist,
   both must be tested. Otherwise one of them rots.
3. The config validator is the gatekeeper. Invalid combinations must
   fail at startup, not at runtime in a confusing place.
4. The composition root reads top to bottom with no magic. Future me
   should be able to follow it without consulting docs.
5. Defaults remain sane. `graphmemory serve` with no arguments must
   always do the right thing for a single local user.

If those five hold, the system stays composable for years. If they
slip, capabilities decay into a monolith with flags.
