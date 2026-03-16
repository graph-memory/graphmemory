# SPEC.md — mcp-graph-memory

## What it is

An MCP (Model Context Protocol) server that turns a project directory into a queryable semantic knowledge base.
Indexes **markdown documentation** and **TypeScript/JavaScript source code** into separate graph structures,
plus a **knowledge graph** for user/LLM-created facts and notes with cross-graph links,
a **file index graph** for all project files with directory hierarchy and metadata,
and a **task graph** for task tracking with kanban workflow, priorities, and cross-graph links.

Supports **multi-project** operation via YAML config — one process manages multiple projects
with independent graphs, indexers, and watchers.

LLM clients can discover, browse, and search the indexed content through **39 MCP tools**.
A **REST API** and **web UI** provide browser-based access to all graphs.

---

## Data models

### Docs — Chunk

Unit of indexing for markdown files. One file produces N chunks: one for the pre-heading root text and one per heading up to `CHUNK_DEPTH`.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique node ID: `"docs/auth.md"`, `"docs/auth.md::Section Title"`, `"docs/auth.md::Title::2"` (dedup suffix) |
| `fileId` | `string` | Source file relative to `projectDir`: `"docs/auth.md"` |
| `title` | `string` | Heading text, or filename for root chunk |
| `content` | `string` | Full text of the section (heading stripped) |
| `level` | `number` | `1` = file root, `2`–`6` = markdown heading depth |
| `links` | `string[]` | fileIds of linked files (relative markdown or wiki links only) |
| `embedding` | `number[]` | L2-normalized vector; `[]` until embedded |

### Docs — DocGraph

`DirectedGraph<NodeAttributes>` (graphology). Edge types:
- **Sibling**: chunk → next chunk within the same file (sequential order)
- **Cross-file**: chunk → root node of linked file (from `chunk.links`)

### Code — CodeNode

Unit of indexing for source files. One file produces one `file` node plus one node per top-level declaration.

| Field | Type | Description |
|---|---|---|
| `kind` | `CodeNodeKind` | `file`, `function`, `class`, `method`, `interface`, `type`, `enum`, `variable` |
| `fileId` | `string` | Source file relative to `projectDir`: `"src/lib/graph.ts"` |
| `name` | `string` | Symbol name, e.g. `"updateFile"` |
| `signature` | `string` | First line of the declaration (max 200 chars) |
| `docComment` | `string` | JSDoc comment if present, else `""` |
| `body` | `string` | Full source text of the declaration |
| `startLine` | `number` | 1-based start line |
| `endLine` | `number` | 1-based end line |
| `isExported` | `boolean` | Whether the symbol is exported |
| `embedding` | `number[]` | L2-normalized vector; `[]` until embedded |
| `mtime` | `number` | File `mtimeMs` at index time |

### Code — CodeGraph

`DirectedGraph<CodeNodeAttributes, CodeEdgeAttributes>` (graphology). Edge types:
- **`contains`**: file → its top-level symbols; class → its methods
- **`imports`**: file A → file B (when A has a relative import resolved to B by ts-morph)
- **`extends`**: class A → class B (base class, same file)
- **`implements`**: class A → interface B (same file)

### Code block nodes

Fenced code blocks in markdown are extracted as child chunks:
- Each code block becomes a child chunk with `language` and `symbols` fields
- TS/JS/TSX/JSX blocks are parsed with ts-morph for symbol extraction
- Code block chunk IDs: `"fileId::Section::code-1"` (level = parent level + 1)

### Node IDs

**Docs**: `"fileId"` (root), `"fileId::Heading"`, `"fileId::Heading::2"` (duplicate suffix)

**Code**: `"fileId"` (file root), `"fileId::SymbolName"` (top-level), `"fileId::ClassName::method"` (method)

### Knowledge — KnowledgeNode

Unit of the knowledge graph. Notes are created by users or LLMs, not by file indexing.

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Note title |
| `content` | `string` | Note body text |
| `tags` | `string[]` | Free-form tags for filtering |
| `embedding` | `number[]` | L2-normalized vector; `[]` until embedded |
| `createdAt` | `number` | Epoch ms |
| `updatedAt` | `number` | Epoch ms |
| `proxyFor?` | `{ graph: 'docs' \| 'code' \| 'files' \| 'tasks'; nodeId: string }` | Present only on phantom proxy nodes (cross-graph links) |

### Knowledge — KnowledgeGraph

`DirectedGraph<KnowledgeNodeAttributes, KnowledgeEdgeAttributes>` (graphology). Edge attributes: `{ kind: string }`.

**Note-to-note edges**: directed relation with free-form `kind` (e.g. `depends_on`, `relates_to`).

**Cross-graph edges**: note → phantom proxy node. Proxy nodes represent external targets (doc chunk, code symbol, file/directory, or task). Proxy ID format: `@docs::guide.md::Setup`, `@code::auth.ts::Foo`, `@files::src/config.ts`, or `@tasks::my-task`. Proxies are created on-demand, cleaned up when orphaned (0 edges), and bulk-cleaned by the indexer when files are removed.

**Knowledge node IDs**: `"auth-uses-jwt"` (slug from title), `"auth-uses-jwt::2"` (dedup suffix)

### File Index — FileIndexNode

Unit of the file index graph. Indexes all project files and directories.

| Field | Type | Description |
|---|---|---|
| `kind` | `'file' \| 'directory'` | Node type |
| `filePath` | `string` | Relative path from projectDir (= node ID) |
| `fileName` | `string` | Basename |
| `directory` | `string` | Parent dir path (e.g. `"src/lib"` or `"."`) |
| `extension` | `string` | File extension (e.g. `".ts"`, `""` for dirs) |
| `language` | `string \| null` | Detected language (e.g. `"typescript"`) |
| `mimeType` | `string \| null` | MIME type (e.g. `"text/typescript"`) |
| `size` | `number` | Bytes (dirs: total size of direct children files) |
| `fileCount` | `number` | 0 for files; direct children count for dirs |
| `embedding` | `number[]` | Embedded from file path (files only; `[]` for dirs) |
| `mtime` | `number` | File mtimeMs (dirs: 0) |

### File Index — FileIndexGraph

`DirectedGraph<FileIndexNodeAttributes, FileIndexEdgeAttributes>` (graphology). Edge type: `contains` (directory → child).

**Node IDs**: relative file path for files (`src/lib/config.ts`), directory path for dirs (`src/lib`), `"."` for root.

**Language detection**: extension-based lookup map in `file-lang.ts`. Supports ~80 extensions. Unknown → `null`.

**MIME detection**: via `mime` npm library (IANA-complete database). Unknown → `null`.

### Task — TaskNode

Unit of the task graph. Tasks are created by users or LLMs, not by file indexing.

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Task title |
| `description` | `string` | Task description (markdown) |
| `status` | `TaskStatus` | `backlog`, `todo`, `in_progress`, `done`, `cancelled` |
| `priority` | `TaskPriority` | `critical` (0), `high` (1), `medium` (2), `low` (3) |
| `tags` | `string[]` | Free-form tags for filtering |
| `dueDate` | `number \| null` | Epoch ms |
| `estimate` | `number \| null` | Hours or story points |
| `completedAt` | `number \| null` | Auto-set on done/cancelled, cleared on reopen |
| `embedding` | `number[]` | L2-normalized vector; `[]` until embedded |
| `createdAt` | `number` | Epoch ms |
| `updatedAt` | `number` | Epoch ms |
| `proxyFor?` | `{ graph: 'docs' \| 'code' \| 'files' \| 'knowledge'; nodeId: string }` | Present only on phantom proxy nodes |

### Task — TaskGraph

`DirectedGraph<TaskNodeAttributes, TaskEdgeAttributes>` (graphology). Edge kinds:
- **`subtask_of`**: task → parent task
- **`blocks`**: task → blocked task
- **`related_to`**: free-form relation

**Cross-graph links**: same proxy system as KnowledgeGraph. `create_task_link` supports `targetGraph: "docs"|"code"|"files"|"knowledge"`.

**Task node IDs**: `"implement-auth"` (slug from title), `"implement-auth::2"` (dedup suffix)

### Persistence

Five graph files, stored in `graphMemory` directory:
- `docs.json` — DocGraph
- `code.json` — CodeGraph
- `knowledge.json` — KnowledgeGraph
- `file-index.json` — FileIndexGraph
- `tasks.json` — TaskGraph

Serialized via graphology's `export()`/`import()`.

### File Mirror

Notes and tasks are additionally mirrored as markdown files with YAML frontmatter:
- `{projectDir}/.notes/{noteId}.md` — knowledge notes
- `{projectDir}/.tasks/{taskId}.md` — tasks

Files are written synchronously on every mutation (create, update, delete, move, link/unlink).
Graph remains the primary data store; files are a persistent mirror for git tracking, IDE editing, and portability.

**Note format**:
```markdown
---
id: my-note
tags: [auth, security]
createdAt: 2026-03-16T10:00:00.000Z
updatedAt: 2026-03-16T10:05:00.000Z
relations:
  - to: fix-auth-bug
    graph: tasks
    kind: relates_to
---

# My Note Title

Content here...
```

**Task format**:
```markdown
---
id: fix-auth-bug
status: in_progress
priority: high
tags: [auth]
dueDate: 2026-03-20T00:00:00.000Z
estimate: 4
completedAt: null
createdAt: 2026-03-16T10:00:00.000Z
updatedAt: 2026-03-16T10:05:00.000Z
relations:
  - to: my-note
    graph: knowledge
    kind: relates_to
---

# Fix Auth Bug

Description here...
```

Relations in frontmatter include only outgoing edges. The `graph` field is omitted for same-graph relations. Empty relations array omits the key entirely.

`.notes/` and `.tasks/` directories are excluded from the file watcher and indexer.

---

## Configuration

### `graph-memory.yaml` (primary)

Multi-project YAML config. All fields optional except `projects.*.projectDir`:

```yaml
server:
  host: "127.0.0.1"
  port: 3000
  sessionTimeout: 1800
  modelsDir: "~/.graph-memory/models"
  embeddingModel: "Xenova/all-MiniLM-L6-v2"

projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphMemory: ".graph-memory"
    docsPattern: "docs/**/*.md"
    codePattern: "src/**/*.{ts,tsx}"
    excludePattern: "node_modules/**"
    tsconfig: "./tsconfig.json"
    chunkDepth: 4
    embedMaxChars: 2000
    # Per-graph model overrides (optional):
    # docsModel: "Xenova/all-MiniLM-L6-v2"
    # codeModel: "Xenova/bge-base-en-v1.5"
    # knowledgeModel: "..."
    # taskModel: "..."
    # filesModel: "..."
```

### Config fields

**Server settings** (`server:`):

| Field | Default | Description |
|---|---|---|
| `host` | `127.0.0.1` | HTTP server bind address |
| `port` | `3000` | HTTP server port |
| `sessionTimeout` | `1800` | Idle session timeout in seconds |
| `modelsDir` | `~/.graph-memory/models` | Local model cache directory |
| `embeddingModel` | `Xenova/all-MiniLM-L6-v2` | Default embedding model (fallback for all graphs) |

**Per-project settings** (`projects.<id>:`):

| Field | Default | Description |
|---|---|---|
| `projectDir` | **(required)** | Root directory to index |
| `graphMemory` | `{projectDir}/.graph-memory` | Directory for graph JSON files |
| `docsPattern` | `**/*.md` | Glob for markdown files; set empty to disable docs indexing |
| `codePattern` | `**/*.{js,ts,jsx,tsx}` | Glob for source files; set empty to disable code indexing |
| `excludePattern` | `node_modules/**` | Glob to exclude from indexing and watching |
| `tsconfig` | — | Path to tsconfig.json for import resolution |
| `embeddingModel` | (server default) | Embedding model for this project |
| `docsModel` | — | Embedding model for docs graph |
| `codeModel` | — | Embedding model for code graph |
| `knowledgeModel` | — | Embedding model for knowledge graph |
| `taskModel` | — | Embedding model for task graph |
| `filesModel` | — | Embedding model for file index graph |
| `chunkDepth` | `4` | Max heading depth to create chunk boundaries at |
| `maxTokensDefault` | `4000` | Default max tokens for responses |
| `embedMaxChars` | `2000` | Max characters fed to embedding model per node |

---

## Indexing pipeline

### Docs

```
markdown file
  └─ parseFile()        → Chunk[]  (no embeddings yet)
       └─ embedBatch()  → fills chunk.embedding  (serial queue)
            └─ updateFile()  → replaces nodes+edges in DocGraph
```

### Code

```
TypeScript/JS file
  └─ parseCodeFile()    → ParsedFile { nodes, edges }  (ts-morph AST)
       └─ embedBatch()  → fills node.embedding  (serial queue)
            └─ updateCodeFile()  → replaces nodes+edges in CodeGraph
```

### Files

```
Any file
  └─ fs.stat()          → size, mtime
       └─ embed()       → file path embedding (serial queue)
            └─ updateFileEntry()  → adds/updates node in FileIndexGraph
```

**Unified walk**: `ProjectIndexer` does one chokidar walk of `projectDir` with pattern `**/*`.
Each file is dispatched to the docs queue, code queue, and/or file index queue based on micromatch pattern matching.
All non-excluded files are always dispatched to the file index queue.

**Three independent serial queues**: docs, code, and file index embedding each run sequentially within their queue;
the three queues run concurrently with each other.

**Batch embeddings**: docs and code queues use `embedBatch()` to embed all chunks/symbols per file in one forward pass.

**Incremental**: files are skipped if `mtime` matches what's already in the graph.

**Dangling cross-file edges**: `updateCodeFile` skips edges whose target node is not yet indexed.
When the target file is later indexed, those edges are not automatically restored — the source file
must be re-indexed (or a full rescan run) to pick them up.

---

## Parsing

### Markdown (`parsers/docs.ts`)

`parseFile(content, absolutePath, projectDir, chunkDepth)`:

- `#` headings are treated as the file title (level 1 root chunk)
- Headings at depth ≤ `chunkDepth` create chunk boundaries
- Deeper headings are folded into the parent chunk's content
- Duplicate heading titles within a file get `::2`, `::3`, … suffixes

Link extraction recognizes:
- **Markdown**: `[text](./relative/path.md)` — resolved relative to the file
- **Wiki**: `[[page name]]` or `[[page name|alias]]` — searched within `projectDir`
- External links (`https://`, etc.) are ignored
- Only links to files that exist on disk are recorded in `chunk.links`

### Code blocks in markdown (`parsers/codeblock.ts`)

Fenced code blocks (`` ```lang ... ``` ``) in markdown are extracted as child chunks during doc parsing:
- Each code block becomes a child chunk with `language` and `symbols` fields
- TS/JS/TSX/JSX blocks are parsed with ts-morph (`useInMemoryFileSystem`) to extract top-level symbol names
- Other languages or parse failures → `symbols = []`; untagged blocks → `language = undefined`
- Code block chunk IDs: `"fileId::Section::code-1"` (level = parent level + 1)

### Source code (`parsers/code.ts`)

`parseCodeFile(absolutePath, codeDir, mtime, project)` using a shared ts-morph `Project`:

- Extracts: functions, classes (+ methods), interfaces, type aliases, enums, exported variables
- Arrow functions and function expressions assigned to `const` are classified as `kind: "function"`
- `signature` = first line of `getFullText()` (includes leading JSDoc if present)
- `docComment` = JSDoc block via `getJsDocs()`
- `body` = full source text of the declaration
- `isExported` = ts-morph `.isExported()` on the node
- Import edges require ts-morph to resolve the module specifier; needs a `tsconfig.json` with
  `moduleResolution: bundler` (or similar) to resolve `.js` extension imports to `.ts` files

---

## Search algorithm

All search tools (`search` for docs, `search_code` for code, `search_notes` for knowledge, `search_tasks` for tasks) use the same algorithm:

1. **Score all nodes** — cosine similarity between query embedding and each node's embedding (skip nodes with empty embedding)
2. **Filter + seed** — discard nodes below `minScore`, take top `topK`
3. **BFS expansion** — from each seed, follow outgoing **and** incoming edges up to `bfsDepth` hops; each hop multiplies score by `bfsDecay`; prune early if `score * bfsDecay < minScore`
4. **De-duplicate** — keep highest score per node across all BFS runs
5. **Final filter + sort** — discard below `minScore`, sort descending, cap at `maxResults`

Default parameters:

| Parameter | Docs | Code | Knowledge | Tasks |
|---|---|---|---|---|
| `topK` | 5 | 5 | 5 | 5 |
| `bfsDepth` | 1 | 1 | 1 | 1 |
| `maxResults` | 20 | 20 | 20 | 20 |
| `minScore` | 0.5 | 0.5 | 0.5 | 0.5 |
| `bfsDecay` | 0.8 | 0.8 | 0.8 | 0.8 |

Knowledge and task search additionally skip proxy nodes (they have empty embeddings and are excluded from results).

---

## MCP tools (39)

### Docs tools (10, registered only when `docsPattern` is non-empty)

#### `list_topics`
Lists all indexed markdown files.
- **Returns**: `Array<{ fileId: string; title: string; chunks: number }>`

#### `get_toc`
Returns the heading hierarchy of a specific file.
- **Input**: `fileId` (required)
- **Returns**: `Array<{ id: string; title: string; level: number }>`

#### `search`
Semantic search over docs with BFS graph expansion.
- **Input**: `query` (required) + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`
- **Returns**: `Array<{ id, fileId, title, content, level, score }>`

#### `get_node`
Returns full content of a specific doc chunk.
- **Input**: `nodeId`
- **Returns**: `{ id, fileId, title, content, level, mtime }`

#### `search_topic_files`
Semantic file-level search over docs (by file path + title).
- **Input**: `query` (required) + optional `topK`, `minScore`
- **Returns**: `Array<{ fileId, title, score }>`

#### `find_examples`
Find code blocks in docs containing a specific symbol.
- **Input**: `symbol` (required) + optional `language`, `fileId`
- **Returns**: `Array<{ id, fileId, language, symbols, content, parentId, parentTitle }>`

#### `search_snippets`
Semantic search over code blocks extracted from docs.
- **Input**: `query` (required) + optional `topK`, `minScore`
- **Returns**: `Array<{ id, fileId, language, symbols, content, score }>`

#### `list_snippets`
List code blocks with optional filters.
- **Input**: optional `fileId`, `language`, `filter`
- **Returns**: `Array<{ id, fileId, language, symbols, preview }>`

#### `explain_symbol`
Find code example + surrounding text explanation for a symbol.
- **Input**: `symbol` (required) + optional `fileId`
- **Returns**: `{ codeBlock, explanation, fileId }`

#### `cross_references` (requires both docs + code)
Full picture: definitions (code) + examples + docs for a symbol.
- **Input**: `symbol` (required)
- **Returns**: `{ definitions, documentation, examples }`

### Code tools (5, registered only when `codePattern` is set)

#### `list_files`
Lists all indexed source files.
- **Returns**: `Array<{ fileId: string; symbolCount: number }>`

#### `get_file_symbols`
Lists all symbols in a source file, sorted by start line.
- **Input**: `fileId`
- **Returns**: `Array<{ id, kind, name, signature, startLine, endLine, isExported }>`

#### `search_code`
Semantic search over code with BFS graph expansion.
- **Input**: `query` (required) + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`
- **Returns**: `Array<{ id, fileId, kind, name, signature, docComment, startLine, endLine, score }>`

#### `get_symbol`
Returns full content of a specific code symbol.
- **Input**: `nodeId`
- **Returns**: `{ id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported }`

#### `search_files`
Semantic file-level search over code (by file path).
- **Input**: `query` (required) + optional `topK`, `minScore`
- **Returns**: `Array<{ fileId, score }>`

### File index tools (3, always registered)

#### `list_all_files`
List all indexed project files and directories with optional filters.
- **Input**: optional `directory`, `extension`, `language`, `filter` (substring), `limit` (default 50)
- **Returns**: `Array<{ filePath, kind, fileName, extension, language, mimeType, size, fileCount }>`

#### `search_all_files`
Semantic search over files by path embedding.
- **Input**: `query` (required) + optional `topK` (default 10), `minScore` (default 0.3)
- **Returns**: `Array<{ filePath, fileName, extension, language, size, score }>`

#### `get_file_info`
Get full metadata for a specific file or directory.
- **Input**: `filePath`
- **Returns**: `{ filePath, kind, fileName, directory, extension, language, mimeType, size, fileCount, mtime }`

### Knowledge tools (10, always registered)

#### `create_note`
Create a note with title, content, and tags.
- **Input**: `title`, `content`, `tags` (optional)
- **Returns**: `{ noteId }`

#### `update_note`
Partial update of a note.
- **Input**: `noteId` + optional `title`, `content`, `tags`
- **Returns**: `{ noteId, updated }`

#### `delete_note`
Delete a note, its relations, and orphaned cross-graph proxies.
- **Input**: `noteId`
- **Returns**: `{ noteId, deleted }`

#### `get_note`
Fetch a note by ID. Returns null for proxy nodes.
- **Input**: `noteId`
- **Returns**: `{ id, title, content, tags, createdAt, updatedAt }`

#### `list_notes`
List notes with optional filter and tag. Excludes proxy nodes.
- **Input**: optional `filter`, `tag`, `limit`
- **Returns**: `Array<{ id, title, tags, updatedAt }>`

#### `search_notes`
Semantic search over notes with BFS graph expansion. Excludes proxy nodes.
- **Input**: `query` (required) + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`
- **Returns**: `Array<{ id, title, content, tags, score }>`

#### `create_relation`
Create a directed relation between notes, or from a note to a doc/code/files/task node.
- **Input**: `fromId`, `toId`, `kind` + optional `targetGraph` (`"docs"`, `"code"`, `"files"`, or `"tasks"`)
- **Returns**: `{ fromId, toId, kind, targetGraph?, created }`
- When `targetGraph` is set, creates a cross-graph link via phantom proxy node; validates target exists in the external graph

#### `delete_relation`
Delete a relation. Cleans up orphaned proxy nodes.
- **Input**: `fromId`, `toId` + optional `targetGraph`
- **Returns**: `{ fromId, toId, deleted }`

#### `list_relations`
List all relations for a note (incoming and outgoing). Resolves proxy IDs to original node IDs.
- **Input**: `noteId`
- **Returns**: `Array<{ fromId, toId, kind, targetGraph? }>`

#### `find_linked_notes`
Reverse lookup: find all notes that link to a doc/code/file/task node.
- **Input**: `targetId`, `targetGraph`
- **Returns**: `Array<{ noteId, kind }>`

### Task tools (11, always registered)

#### `create_task`
Create a task with title, description, priority, tags, status, dueDate, estimate.
- **Input**: `title` (required) + optional `description`, `status`, `priority`, `tags`, `dueDate`, `estimate`
- **Returns**: `{ taskId }`

#### `update_task`
Partial update of any task fields.
- **Input**: `taskId` + optional `title`, `description`, `status`, `priority`, `tags`, `dueDate`, `estimate`
- **Returns**: `{ taskId, updated }`

#### `delete_task`
Delete a task, its relations, and orphaned cross-graph proxies.
- **Input**: `taskId`
- **Returns**: `{ taskId, deleted }`

#### `get_task`
Fetch a task with enriched data: subtasks, blockedBy, blocks, related.
- **Input**: `taskId`
- **Returns**: `{ id, title, description, status, priority, tags, dueDate, estimate, completedAt, createdAt, updatedAt, subtasks, blockedBy, blocks, related }`

#### `list_tasks`
List tasks with filters. Sorted by priority (critical=0→low=3) then dueDate ascending (nulls last).
- **Input**: optional `status`, `priority`, `tag`, `filter`, `limit`
- **Returns**: `Array<{ id, title, status, priority, tags, dueDate, estimate, completedAt }>`

#### `search_tasks`
Semantic search over tasks with BFS graph expansion.
- **Input**: `query` (required) + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`
- **Returns**: `Array<{ id, title, description, status, priority, tags, score }>`

#### `move_task`
Change task status with auto `completedAt` management.
- **Input**: `taskId`, `status`
- **Returns**: `{ taskId, status, completedAt }`
- Sets `completedAt` on `done`/`cancelled`, clears on reopen

#### `link_task`
Create task↔task relations (subtask_of, blocks, related_to).
- **Input**: `fromId`, `toId`, `kind`
- **Returns**: `{ fromId, toId, kind, created }`

#### `create_task_link`
Link a task to a doc/code/file/knowledge node via cross-graph proxy.
- **Input**: `taskId`, `targetId`, `targetGraph` (`"docs"`, `"code"`, `"files"`, or `"knowledge"`)
- **Returns**: `{ taskId, targetId, targetGraph, created }`

#### `delete_task_link`
Remove a cross-graph link from a task.
- **Input**: `taskId`, `targetId`, `targetGraph`
- **Returns**: `{ taskId, targetId, deleted }`

#### `find_linked_tasks`
Reverse lookup: find all tasks that link to a target node.
- **Input**: `targetId`, `targetGraph`
- **Returns**: `Array<{ taskId, kind }>`

---

## CLI

All commands require `--config graph-memory.yaml`:

```bash
# Multi-project HTTP server (primary mode — REST API + MCP + UI + WebSocket)
mcp-graph-memory serve --config graph-memory.yaml [--host <addr>] [--port <n>] [--reindex]

# Single-project stdio (for MCP clients like Claude Desktop)
mcp-graph-memory mcp --config graph-memory.yaml [--project <id>] [--reindex]

# Index one project and exit
mcp-graph-memory index --config graph-memory.yaml [--project <id>] [--reindex]
```

All three commands support `--reindex` to discard persisted graph JSON files and re-create from scratch.

### `serve` command:
1. Loads YAML config, creates `ProjectManager`
2. Adds all projects (loads graphs from disk, or fresh if `--reindex`)
3. Starts multi-project HTTP server (MCP + REST + UI + WebSocket)
4. Starts auto-save (30s interval for dirty projects)
5. In the background: loads embedding models, starts indexing per project
6. Watches YAML for hot-reload (add/remove/change projects without restart)
7. Handles `SIGINT`/`SIGTERM`: shuts down all projects gracefully

### `mcp` command:
1. Loads existing graphs from disk (or fresh if `--reindex`)
2. Starts MCP server on stdio (immediately available with persisted data)
3. In the background: loads embedding model, starts file watcher, runs initial scan
4. After scan completes: saves updated graphs
5. Handles `SIGINT`/`SIGTERM`: drains queue, saves graphs, exits

### `index` command:
1. Loads graphs from disk (or fresh if `--reindex`) + loads embedding models
2. Runs `scan()` + `drain()` (walks directory, embeds all files)
3. Saves all graphs to disk, exits

---

## Multi-project support

### ProjectManager

Manages multiple project instances from a single process:
- Each project has its own 5 graphs, embedFns, indexer, watcher, and mutation queue
- `addProject(id, config, reindex?)` loads graphs from disk (or fresh if reindex)
- `loadModels()` loads embedding models (async, can be deferred)
- `startIndexing()` creates indexer + watcher, initial scan
- `removeProject()` drains indexer, closes watcher, saves graphs
- `saveProject()` persists dirty graphs to disk
- `startAutoSave()` runs every 30s to persist dirty projects

### Mutation serialization

`PromiseQueue` serializes mutation tool handlers per project. Prevents concurrent graph writes from parallel MCP sessions.

Read-only tools (list, get, search) run freely without queueing.

### YAML hot-reload

`serve` watches `graph-memory.yaml` with chokidar. On change:
- Added projects → `addProject()` + `loadModels()` + `startIndexing()`
- Removed projects → `removeProject()`
- Changed projects → remove + re-add

---

## REST API

Express app on the same HTTP server alongside MCP routes (`/mcp/{projectId}`).

```
GET    /api/projects                              → list project IDs
GET    /api/projects/:id/stats                    → node/edge counts per graph

GET    /api/projects/:id/knowledge/notes          → list notes
POST   /api/projects/:id/knowledge/notes          → create note
GET    /api/projects/:id/knowledge/notes/:noteId  → get note
PUT    /api/projects/:id/knowledge/notes/:noteId  → update note
DELETE /api/projects/:id/knowledge/notes/:noteId  → delete note (204)
GET    /api/projects/:id/knowledge/search?q=...   → search notes
POST   /api/projects/:id/knowledge/relations      → create relation
DELETE /api/projects/:id/knowledge/relations       → delete relation (204)
GET    /api/projects/:id/knowledge/notes/:noteId/relations → list note relations
GET    /api/projects/:id/knowledge/linked?targetGraph=...&targetNodeId=... → find linked notes

GET    /api/projects/:id/tasks                    → list tasks
POST   /api/projects/:id/tasks                    → create task
GET    /api/projects/:id/tasks/:taskId            → get task
PUT    /api/projects/:id/tasks/:taskId            → update task
DELETE /api/projects/:id/tasks/:taskId            → delete task (204)
POST   /api/projects/:id/tasks/:taskId/move       → move task status
GET    /api/projects/:id/tasks/search?q=...       → search tasks
POST   /api/projects/:id/tasks/links              → create task link
DELETE /api/projects/:id/tasks/links              → delete task link (204)
GET    /api/projects/:id/tasks/:taskId/relations  → list task relations
GET    /api/projects/:id/tasks/linked?targetGraph=...&targetNodeId=... → find linked tasks

GET    /api/projects/:id/docs/search?q=...        → search docs
GET    /api/projects/:id/code/search?q=...        → search code
GET    /api/projects/:id/files                    → list files
GET    /api/projects/:id/files/search?q=...       → search files
GET    /api/projects/:id/graph?scope=...          → graph export for visualization

GET    /api/projects/:id/tools                    → list available MCP tools
GET    /api/projects/:id/tools/:toolName          → tool details + input schema
POST   /api/projects/:id/tools/:toolName/call     → call tool with arguments
```

Response format: `{ results: [...] }` for lists, direct object for singles. DELETE returns 204.

### Tools Explorer API

The tools router exposes MCP tools via HTTP. Creates a lazy in-memory MCP client per project, lists tool schemas with categories, and proxies `callTool()` requests. Returns execution duration alongside results.

Zod schemas validate all request bodies and query params.

---

## WebSocket

Single endpoint at `/api/ws`. Broadcasts real-time events to all connected clients.

Events include `projectId` — UI filters client-side:
- `note:created|updated|deleted` — knowledge mutations
- `task:created|updated|deleted|moved` — task mutations
- `graph:updated` — indexer processed a file

---

## Web UI

React 19 + Vite + MUI 7 in `ui/` directory. Feature-Sliced Design architecture.

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/:projectId/dashboard` | Dashboard | Stats cards (notes, tasks, docs, code, files) + recent activity |
| `/:projectId/knowledge` | Knowledge | Notes CRUD, detail/edit/new, semantic search, relations |
| `/:projectId/tasks` | Tasks | Kanban board, drag-drop, priority badges, detail/edit/new |
| `/:projectId/docs` | Docs | Browse indexed documentation, TOC, detail view |
| `/:projectId/files` | Files | File browser, directory navigation, metadata, search |
| `/:projectId/search` | Search | Cross-graph search across all 5 graphs |
| `/:projectId/graph` | Graph | Cytoscape.js force-directed graph, scope filter, node inspector |
| `/:projectId/tools` | Tools | MCP tools explorer, input schemas, live execution |
| `/:projectId/help` | Help | Searchable documentation on all tools and concepts |

Default route redirects to `/dashboard`. Light/dark theme toggle. Built output served as static files from HTTP server with SPA fallback.

---

## File watching

Uses chokidar. Events:
- `add` / `change` → dispatched to docs, code, and/or file index serial queues based on pattern match
- `unlink` → synchronously removes file's nodes from the relevant graph(s) + cleans up orphaned proxy nodes in knowledge and task graphs pointing to removed targets

The watcher uses pattern `**/*`; pattern filtering is done in the dispatcher (micromatch).

If `excludePattern` is set, it is checked in both the dispatcher and `startWatcher` before any
pattern match — matching files are silently skipped. During `scan()`, directories whose relative
path matches the exclude pattern (or any file inside would match) are pruned entirely.
