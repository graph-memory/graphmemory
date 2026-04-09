# Multi-tenancy

The system is designed to run as a small SaaS where multiple isolated
organizations share a single deployment. This document captures what
that means concretely, what is in scope for the MVP, and what is
explicitly deferred.

## What "tenant" means here

A **tenant** is an isolated consumer of the system. In our model the
tenant unit is the **organization** (`org`):

- An org owns its data. Users in org A cannot see, query, or even know
  about data in org B.
- A user can belong to multiple orgs through **memberships**. At any
  given moment a user acts in the context of exactly one org.
- All entities in the system (workspaces, projects, tasks, notes,
  skills, files, code chunks, AgentRoles, bots, jobs, sessions,
  comments, attachments, audit events, ...) are owned by a single
  org.
- A few things do **not** carry `org_id`: users themselves (one user,
  many memberships), organizations themselves, global server settings.

This is the standard SaaS model. Linear, Notion, Vercel, Supabase all
use it.

## When tenancy is enabled

Tenancy is a capability axis (see [01-capabilities.md](01-capabilities.md)).

- **Local mode:** `tenancy.enabled = false`. There is one implicit
  organization (`default`). Every record still carries `org_id`, but
  it is fixed at the default value. This keeps the schema and code
  uniform across modes.
- **SaaS mode:** `tenancy.enabled = true`. Real organizations exist.
  `org_id` is enforced on every read and write. Postgres is required.

There is no halfway state. Either the system is single-tenant
(everything in `default`) or fully multi-tenant. The transition from
single to multi happens by changing configuration, not by changing
schema.

## OrgContext as a structural invariant

The most important architectural decision in this document is that
`OrgContext` is a **mandatory parameter** of every read and write
operation in `store` and `services`.

`OrgContext` carries:

- `org_id` — the active organization for this operation.
- `workspace_id` — the active workspace, when the operation acts on
  a workspace-scoped entity.
- `project_id` — the active project, when the operation acts on a
  project-scoped entity.
- `user_id` — the acting user (human or bot).
- `org_role` — the user's `OrgRole` in this org.
- `workspace_role` — the user's `WorkspaceRole` in the active
  workspace, if any.
- `project_role` — the user's `ProjectRole` in the active project,
  if any.
- An identifier of how the context was obtained (session, API key,
  bot impersonation), useful for audit.

The exact set of `*_id` and `*_role` fields populated depends on the
operation. Org-level operations only need `org_id`. Workspace-level
operations need `workspace_id` (and the resolver checks the
`workspace_grant`). Project-level operations need `project_id` (and the
resolver checks the `project_grant`). The compiler distinguishes
operation classes through different context types
(`OrgContext`, `WorkspaceContext`, `ProjectContext`) that extend each
other, so you cannot accidentally call a project-level use case with
an org-only context.

Every use case in `services` looks like:

```
createTask(ctx: OrgContext, input: CreateTaskInput): Promise<Task>
```

You cannot call a use case without an `OrgContext`. The compiler
enforces this. There is no path that bypasses it.

In local mode, the composition root constructs a single fixed
`OrgContext` at startup and reuses it everywhere.

In SaaS mode, every API request constructs an `OrgContext` from the
request (session cookie, API key, bot impersonation token), and
passes it to the use case. There is no global "current user" anywhere.

## Workspaces, projects, and where entities live

Inside an org the system has two more levels of structure:

```
org
└── workspace            (team space, ACL boundary)
    └── project          (repo-bound substructure within a workspace)
        └── ... project-scoped entities ...
    └── ... workspace-scoped entities ...
```

Both **workspace** and **project** are real database entities, not
just configuration. In local mode they exist with the same schema; the
default install creates `org=default → workspace=default →
project=default` automatically.

### Workspace

A **workspace** is the unit of team isolation. Members are added to a
workspace, ACL is enforced at workspace level, and most "people-shaped"
entities live here.

Each workspace belongs to exactly one org and carries `org_id` plus
its own `workspace_id`.

### Project

A **project** is a substructure inside a workspace. It is the natural
home for code, files, and documentation that belong together (usually
because they live in one git repository).

A project carries `org_id`, `workspace_id`, and its own `project_id`.

A project may have **zero or one** git repository connection in the
first build. The schema (`project_repo_connections`) is shaped to hold
**N** rows so multi-repo support can be added later as one validation
change rather than a schema migration. Indexer, file watcher, and git
integration are written to handle the `N` case from day one even
though the API enforces `≤ 1`.

A project does not have to have a git repo at all. A planning-only
project (no code, just tasks/notes for one initiative) is valid.

### Which entities live at which level

This is the most important table in this section.

| Entity | Scoped to | Carries `project_id`? |
|---|---|---|
| Code index | project | required |
| File index | project | required |
| Doc index | project | required |
| Tasks | workspace | optional |
| Epics | workspace | optional |
| Notes | workspace | optional |
| Skills | workspace | — |
| Knowledge entries | workspace | — |
| `org_memberships` | org | — |
| `workspace_grants` | workspace | — |
| `project_grants` | project | — |
| Bots (users with `type=bot`) | workspace (membership) | — |
| AgentRoles | workspace | — |
| Jobs | workspace | — (the task it operates on may carry `project_id`) |
| Agent sessions / messages | workspace | — |
| Audit events | org | — |

Tasks/epics/notes have an **optional** `project_id` so a single task
can belong to a project ("fix bug in frontend") or be cross-project
("Q2 launch — touches frontend + backend"). The optional link does not
weaken workspace isolation: a task without `project_id` is still
scoped to a workspace and visible only to people with a
`workspace_grant`.

Skills, knowledge, AgentRoles, and bots are workspace-wide because
they are reusable assets that should not be locked to a single repo.
A skill captured while working on the backend is useful when working
on the frontend; an AgentRole defined for the team can be applied to
any project.

## Three-layer ACL: identity, workspace access, project access

ACL is enforced through three independent grant tables. They form a
**chain**: each layer must grant explicit access; nothing inherits
from one layer to the next.

```
users               (id, type[human|bot], email, ...)
org_memberships     (org_id,       user_id, org_role)
workspace_grants    (workspace_id, user_id, workspace_role)
project_grants      (project_id,   user_id, project_role)
```

### How a request is authorized

For a project-level operation (e.g. `code.search`):

1. Resolve `user_id` from the request (session cookie or API key).
2. Resolve `org_id` from the URL or workspace lookup. Check that
   `org_memberships(org_id, user_id)` exists. If not → `403`.
3. Resolve `workspace_id`. Check that
   `workspace_grants(workspace_id, user_id)` exists. If not → `403`.
4. Resolve `project_id`. Check that
   `project_grants(project_id, user_id)` exists. If not → `403`.
5. Build a `ProjectContext` with all three roles attached.
6. Pass to the use case.

For a workspace-level operation (e.g. `tasks.create`), step 4 is
skipped. For an org-level operation (e.g. `workspaces.create`), steps
3 and 4 are skipped.

There is **no inheritance**: an `org_role = owner` does not implicitly
grant access to all workspaces. A `workspace_role = admin` does not
implicitly grant access to all projects in that workspace. Each level
is explicit.

### Role enums

Three separate enums, one per level:

| Type | Values | Used in |
|---|---|---|
| `OrgRole` | `owner` \| `admin` \| `member` \| `viewer` | `org_memberships.org_role` |
| `WorkspaceRole` | `admin` \| `member` \| `viewer` | `workspace_grants.workspace_role` |
| `ProjectRole` | `admin` \| `member` \| `viewer` | `project_grants.project_role` |

`owner` exists only at org level (one owner per org, transferable).
`admin`/`member`/`viewer` have parallel meanings at every level:
admin can change ACL at that level, member can read/write entities,
viewer can only read.

These enums are unrelated to `AgentRole` (the bot-behavior
configuration entity). The naming `OrgRole` / `WorkspaceRole` /
`ProjectRole` / `AgentRole` is deliberately disjoint to avoid the
"role" overload that plagues many ACL systems.

### Creator-becomes-owner

The only "automatic" grant in the system is the **creator grant**:

- Creating an org → automatic `org_memberships(org_role = owner)` for
  the creator.
- Creating a workspace → automatic
  `workspace_grants(workspace_role = admin)` for the creator.
- Creating a project → automatic
  `project_grants(project_role = admin)` for the creator.

Without this convention the creation flow has a chicken-and-egg
problem. Every other grant is explicit and visible: an owner adding a
member, an admin granting workspace access, an admin granting project
access. There is no implicit propagation.

### Bots in the three-layer model

A bot is a user with `type = bot`. It follows the **same** model as a
human user:

- Created in some org by an admin → gets an `org_membership` in that
  org (typically `org_role = member`).
- Granted access to specific workspaces via `workspace_grants`.
- Granted access to specific projects via `project_grants`.
- Has one `agent_role_id` pointing at an `AgentRole` (not an ACL
  role).

When a runner executes a job on behalf of a bot, it builds an
`OrgContext` / `WorkspaceContext` / `ProjectContext` from the bot's
grants exactly as if the bot were a human user clicking buttons in
the UI. There is no privileged path for bot identities.

The bot's effective tool set in MCP is the **intersection** of:

1. The operations its `WorkspaceRole` and `ProjectRole` allow.
2. The operations the bot's `AgentRole` whitelists.

A bot whose `AgentRole` allows `tasks.delete` but whose `ProjectRole`
is `viewer` cannot delete tasks. A bot whose `ProjectRole` is `admin`
but whose `AgentRole` does not list `tasks.delete` also cannot delete
tasks. Both checks must pass.

### Local mode

In local mode, `tenancy.enabled = false` and the implicit
`org_id = "default"` is used. The grant tables still exist and are
populated with one row each for the local user (and any declared
bots). All checks still run; they just always succeed for the single
local user. The same code path serves local and SaaS.

This means local mode is not "ACL off" — it is "ACL with one user,
all grants present". The discipline of going through grants is
exercised on every request, even when the answer is always yes. When
the same code is later run with `tenancy.enabled = true`, no use case
needs to change.

## Isolation strategy

There are three common ways to isolate tenants in a relational
database:

1. **Row-level**: one shared schema, every table has `org_id` column,
   queries filter by it. Postgres can enforce this with row-level
   security policies.
2. **Schema-per-tenant**: each org gets its own set of tables, all
   with the same shape.
3. **Database-per-tenant**: each org gets its own database.

**The MVP uses row-level isolation only.** Schema-per-tenant and
database-per-tenant are not supported and are not designed for. They
can be added later if a single enterprise customer requires hard
physical isolation, but that is a different product.

Row-level isolation works through two layers of defense:

### Layer 1: store-level enforcement

The `store` package is the **only** way code outside it can read or
write data. There is no raw SQL access from `services` or anywhere
else. Every store method takes `OrgContext` and adds
`WHERE org_id = ?` automatically. Query construction goes through a
small builder that refuses to emit a query without an org filter.

This is enforced by:

- Compiler: `OrgContext` is required.
- Code review and tests: integration tests create two orgs and assert
  that data from one is invisible from the other.
- Lint rules where possible.

### Layer 2: row-level security in Postgres

When the storage backend is Postgres, RLS policies are added on top.
Each connection sets `app.current_org` for the duration of a
transaction, and policies on every table say
`USING (org_id = current_setting('app.current_org')::uuid)`. Even a
hand-written query that forgets the filter will return zero rows for
the wrong org.

This is the second lock. It exists because layer 1 is human-enforced
discipline, and humans make mistakes. The cost of a tenant data leak
is too high to rely on a single layer.

SQLite (used only for local mode and dev) does not support RLS, so
only layer 1 applies there. This is acceptable because local mode is
single-tenant by definition.

## What's in scope for the MVP

These items must work on day one of the SaaS deployment:

### Identity and access

- **Self-service registration.** Users can sign up with email and
  password.
- **Email verification.** Mandatory before the first login. An
  unverified account cannot do anything.
- **Password reset** via email.
- **Login / logout.** Session cookies for the UI; API keys for
  programmatic access.
- **Organization creation on registration.** A new user automatically
  gets a personal org. They can create more later.
- **Inviting members** to an org by email.
- **Removing members** from an org.
- **Three-layer ACL** with `OrgRole`, `WorkspaceRole`, and
  `ProjectRole` enums. See "Three-layer ACL" above for the model.
- **Creator-becomes-owner** convention on org/workspace/project
  creation. No other implicit grants.
- **Account deletion.** GDPR baseline.

### Storage and data

- **Postgres backend** in production.
- **`org_id` on every relevant table.**
- **Row-level security policies** on every relevant table.
- **`OrgContext` propagation** through services and store.
- **Org-scoped attachments**: blob storage paths and metadata are
  scoped by org.
- **Org deletion** that removes all data belonging to the org.

### Operations

- **Single server process.** No horizontal scaling, no replicas.
- **Postgres can be managed** (Neon, Supabase, RDS) or self-hosted.
- **Email provider** behind the `email-smtp` package. Any standard
  provider with SMTP works.
- **Daily backups** of Postgres. If managed, this is automatic. If
  self-hosted, a simple cron with `pg_dump` to S3.
- **HTTPS only** in production via a reverse proxy or platform
  TLS termination.
- **Error tracking** through Sentry or equivalent.
- **Minimal audit log** for security incident response.

### Security baseline

- Password hashing with argon2 or scrypt at safe parameters.
- API keys stored hashed; shown to the user once at creation.
- All secrets read from environment variables, never stored
  unencrypted in the database.
- All SQL parameterized; no string concatenation.
- Rate limiting on login, registration, password reset, and
  high-volume API endpoints.
- Secure cookies (httpOnly, sameSite, secure flag in production).
- CSRF protection for cookie-based UI.
- XSS-safe rendering in the UI.
- Account lockout after repeated failed login attempts.

This is a baseline, not a comprehensive list. Real security work
continues after the MVP launches.

## What is explicitly deferred

These are not in scope for the MVP. They are valuable, but they would
each delay the launch by weeks or months and they are not required to
validate the product.

### Billing

- No plans, no payment integration, no subscriptions, no invoices.
- Everything is free during the MVP.
- The product validates whether anyone wants to pay later.
- When billing comes, it adds a `plans` table, an `org.plan_id`
  column, a billing provider integration (Stripe, Paddle), and
  middleware that checks limits per operation. The architectural
  changes are additive.

### Quotas and lifecycle limits

- No per-org caps on number of users, tasks, attachments, API calls,
  runner minutes, agent sessions, or storage size.
- No throttling beyond the basic rate limits listed above.
- Trust users in the MVP; revisit when abuse appears.

### Usage metering

- No detailed accounting of LLM tokens used, runner minutes, storage
  bytes, or API calls per org.
- Add when billing or quotas need it.

### Two-factor authentication

- Not implemented in the MVP. Adds a table for TOTP secrets and
  backup codes, and a verification step in the login flow. Layered on
  top of existing auth without schema disruption.

### Single sign-on (SAML, OIDC, OAuth)

- Not in MVP. Self-service email/password is enough for early users.
- SSO is an enterprise feature; the MVP is not selling to enterprise.

### Schema-per-tenant or database-per-tenant isolation

- Not in MVP. Row-level only.
- Adds significant complexity in migrations, tooling, and operations.
- Reconsider only if a customer requires it.

### Horizontal scaling, multi-region, read replicas

- Not in MVP. One server, one Postgres.
- A monolithic Postgres can serve hundreds of small orgs comfortably.
- When scale arrives, migration to multi-instance is a real project,
  but the architecture (stateless server, async storage, no in-memory
  state) does not preclude it.

### Compliance certifications (SOC2, HIPAA, ISO 27001, etc.)

- Not in MVP. These are not "security features"; they are audited
  processes that take 6–12 months and cost money.
- The MVP follows good security hygiene without claiming compliance.

### Polished onboarding wizards

- The MVP onboarding is: register → verify email → land in an empty
  workspace → see a simple "getting started" hint.
- No multi-step wizard with progress bar.

### Polished marketing site

- A minimal landing page with what, why, screenshots, sign-up button,
  and link to docs.
- No blog, changelog UI, or status page on the MVP.

### Detailed observability stack

- No Prometheus / Grafana / Datadog on the MVP.
- Logs to stdout with structured fields (Pino, already in the
  current code).
- Errors to Sentry.
- Uptime check via UptimeRobot or equivalent.
- Add real metrics infrastructure when there are real users to
  measure.

## Operational footprint of the MVP

To run the MVP SaaS, the following are needed:

- **One application server** (small VPS, ~4 GB RAM is plenty for the
  beginning).
- **Postgres** — managed (Neon, Supabase, Crunchy, RDS) or
  self-hosted on the same box.
- **Object storage** — optional. FS on the application server's data
  volume is fine until attachments grow large.
- **Email provider** — Postmark, Resend, SES, Mailgun, or any SMTP.
- **Domain and SSL** — through Cloudflare or Let's Encrypt.
- **Sentry** for errors — free tier is enough.
- **Backups** — automatic on managed Postgres; cron + `pg_dump` if
  self-hosted.

This is on the order of one weekend of setup, not months of DevOps.

## Risks specific to multi-tenancy

These risks are inherent to building any multi-tenant system. They
must be treated as first-class concerns, not afterthoughts.

### Data leakage between orgs

The single most damaging failure mode. Mitigated by:

- `OrgContext` as a mandatory parameter (compiler-enforced).
- Store-level query builder that always adds `WHERE org_id = ?`.
- Postgres RLS as a second lock.
- Integration tests that create multiple orgs and assert isolation.
- Code review specifically watching for raw SQL or missed contexts.

If a leakage bug is found in production, it is treated as a P0
incident: investigate, patch, audit access logs to determine impact,
and notify affected orgs.

### Confused-deputy attacks

A request from one org tricks the system into operating on another
org's data. Mitigated by:

- `OrgContext` derived only from authenticated request data, never
  from URL or body parameters.
- Authorization checks based on `OrgContext.user_id` and the resource
  being accessed, never on caller-supplied identifiers.

### Loud neighbor

One large org degrades performance for all others. On the MVP this
is unlikely to matter. If it becomes an issue, basic remedies:

- Connection pooling per org or per role.
- Slow query budgets enforced in the application.
- Eventually: read replicas, separate worker pools per org tier.

### Account takeover

If a single user account is compromised, an attacker may have access
to multiple orgs through that user's memberships. Mitigated by:

- Strong password hashing.
- Rate limiting on auth.
- Account lockout.
- Audit log review for suspicious access patterns.
- Eventually: 2FA.

### Org deletion

Deleting an org removes potentially huge amounts of data. Doing it
synchronously can lock the database for minutes. Mitigations:

- Mark org as `pending_deletion` immediately; hide it from all
  queries from that moment.
- Background worker performs the actual delete in chunks.
- Backups cover accidental deletion for at least 30 days.

## Summary

The MVP runs as a multi-tenant SaaS with row-level isolation, full
ACL, self-service registration, and email verification. It uses
Postgres in production. It does not yet have billing, quotas, 2FA,
SSO, or compliance, and it makes no operational guarantees beyond
"works on a single small server".

`OrgContext` is the structural invariant that holds the design
together. Every other part of the system is designed assuming it
exists. Breaking that assumption — even once, in a corner — is the
fastest way to destroy the product.
