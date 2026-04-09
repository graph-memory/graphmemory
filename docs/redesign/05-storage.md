# Storage, blobs, and file mirror

This document captures how persistent state is organized in the
redesign: the storage abstraction, the two backends (SQLite and
Postgres), the blob store for attachments, and the role of file
mirroring as an optional plugin.

## Three independent concerns

What looks like one problem ("how do we save things to disk") is
actually three:

1. **Structured data storage** — entities, relations, indexes.
   Tables, queries, transactions, vector and full-text search.
2. **Binary blob storage** — attachment file contents (images,
   documents). Streamed bytes, not relational.
3. **File mirroring** — projecting structured entities to a
   human-readable directory tree of markdown files for editing in an
   IDE and syncing through git.

These are three packages with different interfaces. Conflating them
is what made the current `file-mirror` codebase grow to 2200 lines of
duplicated functions. Splitting them is one of the high-leverage
changes in the redesign.

## Structured data: storage abstraction

The `storage-api` package defines the interface that the rest of the
system uses to read and write structured data. It is intentionally
minimal and intentionally **async**.

### Why async

The current code uses better-sqlite3 directly, which is synchronous.
That works for SQLite but makes it impossible to swap in Postgres,
which is naturally async. Wrapping a sync API in an async one later
is invasive and error-prone.

The redesign makes `storage-api` async from day one:

- SQLite implementation wraps sync calls in `Promise.resolve()`. The
  cost is one microtask per call — negligible.
- Postgres implementation is naturally async.
- Every consumer (`store`, `services`, ...) writes async code from
  the start. There is no migration later.

This is the single most important shape decision in the storage
layer. Getting it wrong on day one means rewriting the entire data
path.

### What the interface contains

`storage-api` exposes (in shape, not exact names):

- A `Storage` object representing a connection to the backend.
- Transaction support: `withTransaction(ctx, fn)`.
- A query builder for typed CRUD on entities. The builder enforces
  `org_id` filtering automatically using the `OrgContext`. Raw SQL is
  not exposed.
- A vector index API: insert vectors, k-NN search.
- A full-text index API: insert documents, BM25 search with optional
  filters.
- A migrations runner: idempotent, monotonic, ordered by version.
- A schema introspection API for diagnostics.

`storage-api` does **not** expose:

- Backend-specific types or types from `better-sqlite3`,
  `node-postgres`, etc.
- SQL strings.
- Connection pooling internals.
- Driver-specific extensions.

The contract is: any consumer should be replaceable between SQLite
and Postgres without code changes outside the implementation packages.

### OrgContext is part of the contract

Every read and write takes an `OrgContext`. The query builder always
adds `WHERE org_id = ?` (or the equivalent in vector/FTS queries).
There is no way to issue a query without specifying the org. This is
how multi-tenancy is enforced at the storage layer.

In local mode the `OrgContext` carries `org_id = "default"` and the
behavior is unchanged from a single-tenant system. The same code path
serves both modes.

### Implementations

#### `storage-sqlite`

- Built on `better-sqlite3`, `sqlite-vec`, and FTS5.
- Used in local mode and dev environments.
- Synchronous internally, wrapped to satisfy the async interface.
- One database file per workspace **or** one shared file for all
  workspaces, configured by `tenancy.enabled`. In local mode the
  default is one file in `.graphmemory/db.sqlite`.
- Does not support row-level security. Tenancy isolation in SQLite
  is enforced only by the store-level layer (acceptable because
  SQLite is single-tenant in our model).

#### `storage-postgres`

- Built on `node-postgres` (`pg`), `pgvector`, and PostgreSQL FTS
  (`tsvector` + `tsquery`).
- Used in SaaS production.
- Naturally async; no wrapping required.
- Supports row-level security: every relevant table has an RLS
  policy `USING (org_id = current_setting('app.current_org')::uuid)`,
  and each transaction sets `app.current_org` from the `OrgContext`
  before executing queries.
- Connection pooling tuned for the deployment size.
- Required when `tenancy.enabled = true`.

### Schema differences are hidden

SQLite and Postgres have different SQL dialects, different JSON
handling, different vector and full-text capabilities. The
implementations isolate these differences. Migrations are written
twice (one set per backend) but both reach the same logical schema.

This is real work but not massive: the schema is finite, and once
the second implementation exists, keeping them in sync is mostly
mechanical.

## Blob storage: attachments

Attachments (images, PDFs, arbitrary uploaded files) are not a good
fit for structured storage. They are:

- Large (KB to MB to occasionally GB).
- Streamed, not loaded.
- Not queried by content (only by metadata).
- Not transactional with the rest of the entity.

The redesign separates them into a dedicated subsystem.

### `blob-store-api`

A small interface:

- `put(key, stream, metadata): Promise<BlobRef>`
- `get(ref): Promise<{ stream, metadata }>`
- `delete(ref): Promise<void>`
- `exists(ref): Promise<boolean>`
- `list(prefix): AsyncIterable<BlobRef>`

`BlobRef` is opaque: it identifies a blob without exposing the
backend. The store layer holds these refs as metadata in entity
tables.

### Implementations

#### `blob-store-fs`

- Files on the local filesystem.
- Default for both local and SaaS modes.
- Path layout includes `org_id` and entity type for organization
  and easy bulk deletion.
- Uses atomic write-then-rename to avoid torn files.
- Cheap, simple, no external dependencies.

#### `blob-store-s3`

- Files in an S3-compatible object store (AWS S3, MinIO, R2,
  Backblaze, etc.).
- Optional. Added when scale or multi-server deployment requires it.
- Uses pre-signed URLs only when proxied through the application —
  never bypassing ACL.

The `blob-store-fs` is enough for the MVP. `blob-store-s3` exists
as an interface stub and can be implemented when the need is real.

### Atomicity with the structured store

A blob and its metadata row are not in the same transaction. This
creates a small atomicity gap that is handled with a standard
pattern:

1. Write the blob to a temporary location.
2. In a single store transaction, write the metadata row **and**
   atomically rename the blob to its final location.
3. If the transaction fails, delete the temporary file.
4. If the rename fails, the transaction rolls back.

For deletes:

1. In a transaction, mark the metadata as deleted (or move it to a
   `pending_deletions` table).
2. After commit, delete the blob.
3. A periodic GC sweeps for orphans (blobs whose metadata rows no
   longer exist).

This is not perfectly atomic, but it is the standard solution and
works in practice. Most production systems with blob+metadata use
some variation of this.

### Access control

Blobs are **never** served directly by a static web server. The
application proxies every blob read so it can:

1. Authenticate the request.
2. Build the `OrgContext`.
3. Check ACL on the entity that owns the attachment.
4. Stream the blob to the client.

This costs some performance compared to nginx serving files
directly, but it is the only way to enforce per-org isolation. Cache
headers and conditional requests can mitigate the overhead.

For very large deployments (later, not MVP), a signed-URL pattern
with short-lived tokens generated by the application is an
acceptable optimization. It still goes through ACL on token issuance.

## File mirror as an optional plugin

The current system mirrors entity state to markdown files in
`.notes/`, `.tasks/`, `.skills/`, etc. This is central to how the
local-mode user works: they edit files in their IDE, git tracks
changes, the team shares state through repository commits.

In the redesign, file mirroring is **opt-in**:

- **Enabled** in local mode (and team-via-git scenarios).
- **Disabled** in SaaS mode by default (no human edits files on the
  server, and the data volume is wrong for git).
- Optionally enabled for SaaS deployments that integrate with git
  repositories explicitly, but this is a separate concern.

### Two packages

#### `mirror-engine`

A generic engine that knows how to serialize *something* to a
directory of markdown + `events.jsonl` + attachments. It does not
know about specific entity types. It is parameterized by per-entity
**`MirrorSpec`** objects that describe:

- The body filename.
- The snapshot filename.
- How to build the body from the entity attributes.
- How to build the frontmatter.
- How to build a "created" event for the events log.
- How to build an update delta from a partial.

A `MirrorEngine<Attrs>` instance pairs a directory with a spec. The
collapse:

- Current code: 4 nearly-identical sets of `mirrorXxxCreate`,
  `mirrorXxxUpdate`, `mirrorXxxRelation`, `_regenerateXxxSnapshot`
  functions, ~2200 lines.
- After: one engine class plus 4 small spec files of ~30 lines
  each. ~150 lines for the engine.

This is the single largest mechanical reduction in the redesign.

The engine is a **leaf package**. It depends only on `fs`, `path`,
`crypto`, and a YAML/markdown frontmatter helper. It knows nothing
about `store`, `services`, or any specific entity type.

#### `file-mirror`

The package that registers the actual specs (NoteSpec, TaskSpec,
SkillSpec, EpicSpec, AgentSpec, RoleSpec) and provides two
high-level objects:

- **`MirrorWriter`**: subscribes to store events and writes
  serialized files when entities change.
- **`MirrorImporter`**: reads files (on startup or in response to
  watcher events) and applies them to the store as updates.

`file-mirror` depends on `store` (to read entities and apply
imports), `mirror-engine` (to do the serialization), and
`blob-store-api` (to manage attachment files).

### Direction of data flow

There are two directions:

- **Outbound (DB → files):** when an entity is created or updated
  in the store, the writer renders it to disk. This does **not**
  need the watcher.
- **Inbound (files → DB):** when a human edits a file in the IDE,
  the importer parses the change and applies it to the store. This
  needs the watcher.

These are two separate concerns inside `file-mirror`. The watcher
package is just an event source — it does not know about mirror or
store. The composition root in `apps/server` wires watcher events
to the importer.

### Configuration

When file mirror is enabled, the configuration controls which
entities are mirrored:

```yaml
file_mirror:
  enabled: true
  path: ./.graphmemory
  shared:
    - workspaces
    - projects
    - tasks
    - notes
    - skills
    - epics
    - agent_roles
  local_only:
    - jobs
    - agent_sessions
    - audit_log
```

Entities listed in `shared` are mirrored both ways. Entities listed
in `local_only` are never written to disk, even when mirroring is
enabled.

This split exists because some entities are appropriate for git
sharing (tasks, notes, skills, agents) and some are not (job
queues, session histories, audit logs are noisy and personal).

### Mirror is independent of blob store

When file mirror is enabled, attachments live alongside the
markdown files in the same directory tree. When file mirror is
disabled, attachments live in a configured blob store path. These
are two separate decisions:

- `file_mirror.enabled = true` + `blobs.backend = fs` → blobs land
  inside the mirror directory tree.
- `file_mirror.enabled = false` + `blobs.backend = fs` → blobs land
  in a separate configured directory.
- `file_mirror.enabled = false` + `blobs.backend = s3` → blobs land
  in S3.

`file-mirror` and `blob-store` are independent packages. The
composition root makes the mirror writer use the same blob store
that `store` uses, so attachments are stored in one canonical place
regardless of how mirroring is configured.

## What does and does not get mirrored

This deserves explicit guidance.

### Always mirrored (when enabled)

- Workspaces
- Projects
- Tasks
- Notes
- Skills
- Epics
- AgentRoles (the configuration entities, not bot user records)
- Knowledge entries
- Documents
- Code index entries (optional, since code itself is in the repo)

These are entities that humans edit, comment on, or share through
git. They are usually small text-shaped objects.

### Never mirrored

- **Bot user records** — usernames, API keys.
- **Agent sessions and messages** — large, personal, not useful in
  git.
- **Job queue state** — ephemeral, machine-specific.
- **Audit log** — large, security-sensitive.
- **Search indexes** — derived data; would defeat the point of
  having an index.
- **Embedding vectors** — large binary data, regenerable.
- **Caches** — by definition.

When in doubt, the default is "do not mirror". Adding an entity to
the mirror is a deliberate decision.

## Migration story

The existing codebase already has a working file-mirror system with
its own format. The redesign needs a migration path so existing
projects do not lose data.

The plan (sketch, details to be worked out when the migration is
implemented):

1. The new `mirror-engine` reads the existing format
   (`.notes/<id>/note.md` + `events.jsonl` + `attachments/`)
   without changes. The on-disk layout stays the same.
2. The new specs reproduce the current frontmatter and body shapes
   bit-for-bit.
3. Internally the code is fully de-duplicated, but the user sees
   exactly the same files in their working directory.
4. Optionally, a future version may unify some inconsistencies
   (e.g., `content.md` for notes vs `description.md` for tasks).
   That is a separate, opt-in migration step, not required for the
   redesign itself.

The point is: rebuilding the mirror code does not have to break
existing on-disk state.

## Storage for the bot runtime

The bot runtime adds several new entity categories. They are split
between `store` and `log-store` based on access pattern:

### In `store` (read-write entities)

- `users` (with `type=bot` for bots) — bot user records live in the
  same `users` table as humans, distinguished only by the `type`
  column. There is no separate `bots` table.
- `agent_roles` — `AgentRole` definitions (system prompt, allowed
  tools, git policy, limits). Workspace-scoped.
- `runners` — runner registrations and status
- `jobs` — job queue records (state machine, lease)

These are normal entities: read often, updated in place, queried
by various filters.

### In `log-store` (append-only entities)

- `agent_sessions` — session metadata (one row per session)
- `agent_messages` — individual messages within a session (many
  rows per session, often hundreds or thousands)
- `task_events` — status changes, automation triggers, lifecycle
  events on tasks
- `audit_events` — security and operational audit log

These are high-volume, time-ordered, never updated in place. They
benefit from a different repository surface and different indexing
strategy. Both physically live in the same database backend
(SQLite or Postgres), but the `log-store` package exposes them
through methods optimized for append and time-range queries
instead of arbitrary CRUD.

## Summary

- **`storage-api`** is the single async interface the rest of the
  system depends on. `storage-sqlite` and `storage-postgres` are
  the two implementations. `OrgContext` is required everywhere.
- **`blob-store-api`** is a separate small interface for binary
  attachments. `blob-store-fs` is the default; `blob-store-s3` is
  optional.
- **`file-mirror`** is an optional plugin that uses
  `mirror-engine` (a generic, leaf-level engine) to serialize
  entities to a markdown directory tree. It is enabled in local
  mode and disabled in SaaS by default.
- **The three concerns are independent.** Storage, blobs, and
  mirroring are separate packages with separate interfaces. They
  combine through the composition root in `apps/server`.
- **Existing on-disk format is preserved** during migration. The
  redesign is internal de-duplication, not a user-visible format
  change.
