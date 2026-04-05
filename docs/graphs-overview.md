# Graphs — Overview

The system maintains multiple graph types, all stored in a **SQLite** database (one per workspace) using better-sqlite3, sqlite-vec for vector search, and FTS5 for keyword search.

## Graph types

| Graph | Store | Category | Description |
|-------|-------|----------|-------------|
| **Docs** | `DocsStore` | indexed | Markdown document chunks |
| **Code** | `CodeStore` | indexed | AST symbols from TS/JS source |
| **Files** | `FilesStore` | indexed | All project files and directories |
| **Knowledge** | `KnowledgeStore` | user-managed | User/LLM-created notes and facts |
| **Tasks** | `TasksStore` | user-managed | Tasks with kanban workflow |
| **Epics** | `EpicsStore` | user-managed | Epics grouping related tasks with progress tracking |
| **Skills** | `SkillsStore` | user-managed | Reusable recipes and procedures |

See individual graph pages for detailed documentation:
- [DocGraph](graph-docs.md)
- [CodeGraph](graph-code.md)
- [KnowledgeGraph](graph-knowledge.md)
- [FileIndexGraph](graph-file-index.md)
- [TaskGraph](graph-tasks.md)
- [SkillGraph](graph-skills.md)

## Graph categories

### Indexer-driven graphs

These graphs are populated automatically by the indexer scanning project files:

- **DocGraph** — populated from markdown files matching docs pattern
- **CodeGraph** — populated from source files matching code pattern
- **FileIndexGraph** — populated from all project files

### CRUD-only graphs

These graphs are populated manually (by users or LLMs) via MCP tools or REST API:

- **KnowledgeGraph** — notes, facts, decisions
- **TaskGraph** — tasks, epics, kanban boards
- **SkillGraph** — recipes, procedures

CRUD-only graphs also feature:
- **File mirroring** — mutations write markdown files to `.notes/`, `.tasks/`, `.skills/`
- **Reverse import** — external edits to mirror files sync back to the graph
- **Cross-graph links** — proxy nodes linking to nodes in other graphs
- **Attachments** — file attachments stored alongside mirror files

## Graph Managers

MCP tools and REST handlers access stores via `StoreManager` → `ProjectScopedStore`.

### Store categories

| Store | Responsibilities |
|-------|-----------------|
| `DocsStore` | Read: listFiles, getFileChunks, search. Write: bulk upsert/remove by file (used by indexer) |
| `CodeStore` | Read: listFiles, getFileSymbols, search. Write: bulk upsert/remove by file (used by indexer) |
| `FilesStore` | Read: listAllFiles, getFileInfo, search. Write: bulk upsert/remove by file (used by indexer) |
| `KnowledgeStore` | Full CRUD with slugs, versions, tags, attachments, optimistic locking, file mirror |
| `TasksStore` | Full CRUD with slugs, versions, tags, attachments, optimistic locking, file mirror |
| `EpicsStore` | Full CRUD with slugs, progress tracking (done/total), task linking |
| `SkillsStore` | Full CRUD with slugs, versions, tags, attachments, optimistic locking, file mirror |

## Persistence

All graphs are stored in a single SQLite database per workspace using:

- **better-sqlite3** — synchronous SQLite bindings (WAL mode)
- **sqlite-vec** — vector similarity search (per-graph configurable dimensions, default 384)
- **FTS5** — full-text keyword search

The database file is located in the workspace data directory. Schema migrations use `PRAGMA user_version`.

### Embedding model validation

An embedding model fingerprint (model + pooling + normalize + documentPrefix + dtype) is stored in the database metadata. If the configured model differs from the stored one, indexed data (docs, code, files) is re-indexed automatically.

### Transactions

Store methods are not transactional internally. The caller wraps multi-step operations in `store.transaction()` for atomicity. SQLite triggers cascade DELETEs to edges, attachments, and vec0 tables.

## Cross-graph links

CRUD-only graphs (Knowledge, Tasks, Skills) can link their nodes to nodes in any other graph via **phantom proxy nodes**.

### Proxy node ID format

```
@docs::guide.md::Setup
@code::auth.ts::Foo
@files::src/config.ts
@tasks::implement-auth
@knowledge::my-note
@skills::add-rest-endpoint
```

### How it works

1. **Create link**: check target exists in external graph → create proxy node in current graph → create edge from source to proxy
2. **List relations**: proxy IDs are resolved transparently — callers see the original node IDs
3. **Proxy cleanup**: when a proxy has zero edges, it's deleted. When target files are removed, `cleanupProxies()` removes orphaned proxies

Proxy nodes have empty embeddings and are excluded from list/get/search operations.

### Workspace proxy format

In workspaces, cross-graph links between projects use project-scoped proxy IDs:

```
@docs::api-gateway::guide.md::Setup
```

## Node ID conventions

| Graph | Format | Examples |
|-------|--------|---------|
| DocGraph | `"fileId"`, `"fileId::Heading"`, `"fileId::Heading::2"` | `"docs/auth.md"`, `"docs/auth.md::JWT Tokens"` |
| CodeGraph | `"fileId"`, `"fileId::Symbol"`, `"fileId::Class::method"` | `"src/auth.ts"`, `"src/auth.ts::loginUser"` |
| KnowledgeGraph | `"slug-from-title"`, `"slug::2"` | `"auth-uses-jwt"`, `"auth-uses-jwt::2"` |
| FileIndexGraph | file path, dir path, `"."` | `"src/lib/config.ts"`, `"src/lib"`, `"."` |
| TaskGraph | `"slug-from-title"`, `"slug::2"` (tasks and epics share IDs) | `"implement-auth"`, `"q4-auth-epic"` |
| SkillGraph | `"slug-from-title"`, `"slug::2"` | `"add-rest-endpoint"`, `"add-rest-endpoint::2"` |

Slug generation uses `slugify()` — lowercase, replace non-alphanumeric with hyphens, trim, deduplicate with `::2`, `::3`, etc.

## Search

Each store supports hybrid search combining **FTS5** (keyword) and **sqlite-vec** (vector cosine), fused via Reciprocal Rank Fusion (RRF, K=60). Three modes: `hybrid`, `keyword`, `vector`.

See [Search](search.md) for the hybrid search algorithm.

## Epics

Epics have a dedicated `EpicsStore` (separate from `TasksStore`). Tasks are linked to epics via `belongs_to` edges. Epics support an `order` field for positioning, using gap-based integers for efficient reordering without renumbering siblings.

## Enabled/disabled graphs

Each graph can be disabled in the config:

```yaml
graphs:
  code:
    enabled: false    # No code indexing
  skills:
    enabled: false    # No skills
```

Disabled graphs:
- Are not created by `ProjectManager`
- Their MCP tools are not registered
- Their REST API routes return 404
- Their sidebar items are hidden in the UI
