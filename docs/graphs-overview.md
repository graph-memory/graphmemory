# Graphs — Overview

The system maintains six graph types, all built on **Graphology** (in-memory directed graph library). Each graph is persisted as a JSON file and managed by a dedicated Manager class.

## Six graph types

| Graph | File | Manager | Description |
|-------|------|---------|-------------|
| **DocGraph** | `docs.json` | `DocGraphManager` | Markdown document chunks |
| **CodeGraph** | `code.json` | `CodeGraphManager` | AST symbols from TS/JS source |
| **KnowledgeGraph** | `knowledge.json` | `KnowledgeGraphManager` | User/LLM-created notes and facts |
| **FileIndexGraph** | `file-index.json` | `FileIndexGraphManager` | All project files and directories |
| **TaskGraph** | `tasks.json` | `TaskGraphManager` | Tasks with kanban workflow |
| **SkillGraph** | `skills.json` | `SkillGraphManager` | Reusable recipes and procedures |

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
- **TaskGraph** — tasks, kanban boards
- **SkillGraph** — recipes, procedures

CRUD-only graphs also feature:
- **File mirroring** — mutations write markdown files to `.notes/`, `.tasks/`, `.skills/`
- **Reverse import** — external edits to mirror files sync back to the graph
- **Cross-graph links** — proxy nodes linking to nodes in other graphs
- **Attachments** — file attachments stored alongside mirror files

## Graph Managers

Each graph has a Manager class that serves as the single entry point for all operations. MCP tools and REST handlers call manager methods instead of raw graph functions.

### GraphManagerContext

```typescript
interface GraphManagerContext {
  markDirty(): void;      // Sets project.dirty = true (triggers auto-save)
  emit(event, data): void; // Broadcasts via ProjectManager (→ WebSocket → UI)
  projectId: string;       // Used in event payloads
  projectDir?: string;     // Enables file mirror (.notes/, .tasks/, .skills/)
}
```

- In **production** (serve/mcp commands): context has real callbacks connected to ProjectManager
- In **tests**: `noopContext()` provides no-op callbacks (no file I/O, no events)

### Manager responsibilities

| Manager | Responsibilities |
|---------|-----------------|
| `DocGraphManager` | Read: listFiles, getFileChunks, search. Write: updateFile, removeFile (used by indexer) |
| `CodeGraphManager` | Read: listFiles, getFileSymbols, search. Write: updateFile, removeFile (used by indexer) |
| `FileIndexGraphManager` | Read: listAllFiles, getFileInfo, search. Write: updateFileEntry, removeFileEntry (used by indexer) |
| `KnowledgeGraphManager` | Full cycle: embed → CRUD → dirty → emit → file mirror → cross-graph proxy cleanup |
| `TaskGraphManager` | Full cycle: embed → CRUD → dirty → emit → file mirror → cross-graph proxy cleanup |
| `SkillGraphManager` | Full cycle: embed → CRUD → dirty → emit → file mirror → cross-graph proxy cleanup |

## Persistence

Each graph is serialized as JSON using Graphology's `export()`/`import()`:

```json
{
  "version": 2,
  "embeddingModel": "Xenova/bge-m3|cls|true||q8",
  "graph": { /* graphology export */ }
}
```

Two checks trigger automatic re-indexing on load:
- **`version`** — a data schema version (`GRAPH_DATA_VERSION` in `defaults.ts`). Bumped when changing what gets embedded, path normalization, stored format, or any change requiring fresh data. If missing or mismatched, the graph is discarded.
- **`embeddingModel`** — a fingerprint of the embedding config (model + pooling + normalize + documentPrefix + dtype). If the configured model differs from the stored one, the graph is discarded.

Files are stored in the `graphMemory` directory (default: `{projectDir}/.graph-memory/`).

### Auto-save

The `serve` command runs auto-save every 30 seconds. Only dirty projects (those with pending graph changes) are saved.

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
| TaskGraph | `"slug-from-title"`, `"slug::2"` | `"implement-auth"`, `"implement-auth::2"` |
| SkillGraph | `"slug-from-title"`, `"slug::2"` | `"add-rest-endpoint"`, `"add-rest-endpoint::2"` |

Slug generation uses `slugify()` — lowercase, replace non-alphanumeric with hyphens, trim, deduplicate with `::2`, `::3`, etc.

## BM25 index

Each graph manager maintains a BM25 keyword index alongside the vector embeddings. The BM25 index is updated incrementally on every CRUD operation (add/remove/update).

The tokenizer splits on whitespace, punctuation, and camelCase (`getUserById` → `[get, user, by, id]`).

See [Search](search.md) for the hybrid search algorithm.

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
