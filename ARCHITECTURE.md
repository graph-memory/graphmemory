# Architecture

MCP server that builds a **semantic graph memory** from a project directory — indexing markdown docs, TypeScript/JavaScript source code, and all project files. Provides 58 MCP tools + REST API + web UI for graph visualization and management.

```
┌──────────────────────────────────────────────────────────────────────┐
│                              CLI                                     │
│                   src/cli/index.ts (Commander)                       │
│                                                                      │
│   index ──── scan + embed + save + exit                              │
│   mcp ────── stdio MCP server + watch (single project)               │
│   serve ──── HTTP server + REST API + UI + WebSocket (multi-project) │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                              ▼
     ┌─────────────┐            ┌──────────────────┐
     │ YAML Config │            │ ProjectManager   │
     │ (projects)  │            │ (multi-project)  │
     └──────┬──────┘            └────────┬─────────┘
            │                            │
            ▼                            ▼
     ┌──────────────────────────────────────────┐
     │           ProjectIndexer                 │
     │   3 serial queues: docs / code / files   │
     │   chokidar watcher for live updates      │
     └──────────────────┬───────────────────────┘
                        │
                        ▼
     ┌──────────────────────────────────────────┐
     │         Embedding (transformers.js)      │
     │   embed() / embedBatch() / loadModel()   │
     │   named registry + model deduplication   │
     └──────────────────┬───────────────────────┘
                        │
                        ▼
     ┌──────────────────────────────────────────┐
     │           6 Graphs (Graphology)          │
     │                                          │
     │   DocGraph ────── markdown chunks        │
     │   CodeGraph ───── AST symbols            │
     │   KnowledgeGraph  user notes + facts     │
     │   FileIndexGraph  all project files      │
     │   TaskGraph ───── tasks + kanban          │
     │   SkillGraph ──── reusable recipes       │
     └──────────────────┬───────────────────────┘
                        │
     ┌──────────────────┴───────────────────────┐
     │        6 Graph Managers (unified API)     │
     │                                          │
     │   embed + CRUD + dirty + events          │
     │   + cross-graph cleanup                  │
     └──────────────────┬───────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
     ┌────────┐   ┌──────────┐   ┌──────────┐
     │  MCP   │   │ REST API │   │    UI    │
     │ Tools  │   │ Express  │   │  React   │
     │ (58)   │   │ + WS     │   │  + Vite  │
     └────────┘   └──────────┘   └──────────┘
```

---

## 1. CLI — Entry Point

**File**: `src/cli/index.ts`

Commander CLI with 3 commands. All require `--config graph-memory.yaml`.

### `index` — one-shot scan

```
Load YAML config → load graphs from disk (or fresh if --reindex)
→ load embedding models → create ProjectIndexer → scan() → drain()
→ save graphs → exit
```

Use case: CI/CD, initial indexing, re-indexing after big changes.

### `mcp` — single-project stdio

```
Load graphs from disk (or fresh if --reindex)
→ start MCP stdio server IMMEDIATELY (with cached data)
→ background: load models → create indexer → watch() → drain()
→ on SIGINT: drain + save all graphs
```

Use case: IDE integration (Claude, Cursor). Stdio transport — the MCP client communicates via stdin/stdout.

### `serve` — multi-project HTTP

```
Load YAML → create ProjectManager → add all projects (load graphs, or fresh if --reindex)
→ start HTTP server (MCP + REST + static UI + WebSocket)
→ background: per project sequentially load models → start indexing
→ watch YAML for hot-reload (add/remove/change projects)
→ auto-save dirty projects every 30s
→ on SIGINT: shutdown all projects
```

Use case: team server, web UI, multiple projects from one process.

### `--reindex` flag

All three commands support `--reindex` to discard persisted graph JSON files and re-create from scratch. When set, `load*()` functions return fresh empty graphs (skip disk read), and the indexer re-indexes all files since no mtime data exists.

### Automatic re-index on model change

Each graph JSON file stores the embedding model name used to generate it. On load, if the configured model doesn't match the stored model, the graph is automatically discarded and re-indexed from scratch — no `--reindex` needed.

---

## 2. Configuration

### `graph-memory.yaml`

**File**: `src/lib/multi-config.ts`

```yaml
server:
  host: "127.0.0.1"
  port: 3000
  sessionTimeout: 1800          # seconds
  modelsDir: "~/.graph-memory/models"

projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphMemory: ".graph-memory"  # relative to projectDir
    docsPattern: "docs/**/*.md"
    codePattern: "src/**/*.ts"
    excludePattern: "node_modules/**"
    embeddingModel: "Xenova/all-MiniLM-L6-v2"
    docsModel: ""               # per-graph model override
    codeModel: ""
    chunkDepth: 4
    embedMaxChars: 2000
```

Validated with **Zod** schemas. All fields optional with sensible defaults.

### Workspaces

Projects can be grouped into **workspaces** that share a single KnowledgeGraph, TaskGraph, and SkillGraph. Each project keeps its own DocGraph, CodeGraph, and FileIndexGraph.

```yaml
workspaces:
  backend:
    projects: [api-gateway, catalog-service]
    graphMemory: "./.workspace-backend"
    mirrorDir: "./.workspace-backend"
    author:
      name: "Backend Team"
      email: "backend@example.com"
```

| Field | Description |
|-------|-------------|
| `projects` | List of project IDs that share this workspace |
| `graphMemory` | Where shared graph JSON files are stored |
| `mirrorDir` | Where shared `.notes/`, `.tasks/`, `.skills/` mirror files are written |
| `author` | Author for shared notes/tasks/skills (overrides root author) |

Workspace projects use a shared `PromiseQueue` for mutation serialization across all member projects. Cross-graph links between workspace projects use project-scoped proxy IDs (e.g., `@docs::api-gateway::guide.md::Setup`).

---

## 3. Six Graphs

All graphs use **Graphology** (directed graph in memory). Persisted as JSON with embedding model metadata — if the configured model changes, the graph is automatically re-indexed from scratch.

### DocGraph — `docs.json`

**Files**: `src/graphs/docs.ts`, `src/lib/parsers/docs.ts`

Stores markdown document structure as a graph of chunks.

- **Nodes**: heading sections at level 1-4. Each has `title`, `content`, `embedding`, `fileEmbedding` (root only)
- **Node IDs**: `"guide.md"` (file root), `"guide.md::Setup"` (section), `"guide.md::Setup::2"` (duplicate heading)
- **Edges**: `sibling` (chunk → next chunk), cross-file links (from `[text](./other.md)` in markdown)
- **Code blocks**: fenced ` ```lang ``` ` blocks extracted as child chunks with `language` and `symbols` fields. TS/JS blocks parsed with ts-morph for symbol extraction

### CodeGraph — `code.json`

**Files**: `src/graphs/code.ts`, `src/lib/parsers/code.ts`

Stores AST symbols from TypeScript/JavaScript source files.

- **Nodes**: `file`, `class`, `interface`, `function`, `variable`, `method`. Each has `signature`, `docComment`, `embedding`, `startLine`/`endLine`
- **Node IDs**: `"src/auth.ts"` (file), `"src/auth.ts::loginUser"` (top-level), `"src/auth.ts::UserService::login"` (method)
- **Edges**: `contains` (file→symbol, class→method), `imports` (file→file, resolved by ts-morph), `extends`, `implements`
- **Parser**: ts-morph with shared `Project` instance. Loads `tsconfig.json` for import resolution

### KnowledgeGraph — `knowledge.json`

**File**: `src/graphs/knowledge.ts`

User/LLM-created notes and facts. CRUD-only (no file indexing).

- **Nodes**: `title`, `content`, `tags[]`, `embedding`, `createdAt`, `updatedAt`
- **Node IDs**: slug from title — `"my-fact"`, duplicates get `"my-fact::2"`
- **Edges**: free-form kinds — `relates_to`, `depends_on`, any string
- **Cross-graph links**: proxy nodes (`@docs::guide.md::Setup`, `@code::auth.ts::Foo`, `@files::src/config.ts`, `@tasks::my-task`) link notes to external graph nodes. Proxies have empty embeddings and are excluded from list/search

### FileIndexGraph — `file-index.json`

**File**: `src/graphs/file-index.ts`

Indexes ALL project files and directories (not just pattern-matched ones).

- **Nodes**: `kind: 'file' | 'directory'`, `filePath`, `extension`, `language`, `mimeType`, `size`, `fileCount` (dirs)
- **Edges**: `contains` (directory → child)
- **Features**: file path embeddings for semantic search, `rebuildDirectoryStats()` aggregates size/fileCount up the directory tree
- **Language detection**: extension → language lookup map in `file-lang.ts`; MIME detection via `mime` npm library (IANA-complete database)

### TaskGraph — `tasks.json`

**File**: `src/graphs/task.ts`

Task tracking with kanban workflow. CRUD-only (like KnowledgeGraph).

- **Nodes**: `title`, `description`, `status`, `priority`, `tags[]`, `dueDate`, `estimate`, `completedAt`, `embedding`
- **Statuses**: `backlog` → `todo` → `in_progress` → `done` → `cancelled`
- **Priorities**: `critical` (0) → `high` → `medium` → `low` (3)
- **Edge kinds**: `subtask_of`, `blocks`, `related_to`
- **Automations**: `move_task` auto-sets `completedAt` on done/cancelled, clears on reopen
- **Cross-graph links**: same proxy system as KnowledgeGraph — `create_task_link` supports `targetGraph: "docs"|"code"|"files"|"knowledge"|"skills"`

### SkillGraph — `skills.json`

**File**: `src/graphs/skill.ts`

Reusable recipes, procedures, and troubleshooting guides. CRUD-only (like KnowledgeGraph/TaskGraph).

- **Nodes**: `title`, `description`, `steps[]`, `triggers[]`, `source` (`learned`|`manual`|`imported`), `tags[]`, `usageCount`, `lastUsedAt`, `embedding`
- **Node IDs**: slug from title — `"add-rest-endpoint"`, duplicates get `"add-rest-endpoint::2"`
- **Edge kinds**: `depends_on`, `related_to`, `variant_of`
- **Features**: `recall_skills` uses lower `minScore` (0.3) for higher recall; `bump_skill_usage` increments counter + sets `lastUsedAt`; BM25 includes triggers in text extraction
- **Cross-graph links**: same proxy system — `create_skill_link` supports `targetGraph: "docs"|"code"|"files"|"knowledge"|"tasks"`
- **File mirror**: mutations write `.skills/{id}/skill.md` with YAML frontmatter
- **Attachments**: stored in `.skills/{id}/` directory

### Graph Managers — Unified API

**Directory**: `src/graphs/manager-types.ts`, plus classes in each graph file.

Each graph has a **Manager class** that serves as the single entry point for all operations (read and write). MCP tools and REST handlers call manager methods instead of raw graph functions.

```
GraphManagerContext
  ├── markDirty()      → sets project.dirty = true
  ├── emit(event, data) → broadcasts via ProjectManager (EventEmitter)
  ├── projectId        → used in event payloads
  └── projectDir?      → enables file mirror (.notes/ .tasks/ .skills/)
```

| Manager | Key Responsibilities |
|---------|---------------------|
| `DocGraphManager` | Read: listFiles, getFileChunks, search. Write: updateFile, removeFile (used by indexer) |
| `CodeGraphManager` | Read: listFiles, getFileSymbols, search. Write: updateFile, removeFile (used by indexer) |
| `FileIndexGraphManager` | Read: listAllFiles, getFileInfo, search. Write: updateFileEntry, removeFileEntry (used by indexer) |
| `KnowledgeGraphManager` | Full cycle: embed → CRUD → dirty → emit → file mirror (.notes/) → cross-graph proxy cleanup |
| `TaskGraphManager` | Full cycle: embed → CRUD → dirty → emit → file mirror (.tasks/) → cross-graph proxy cleanup |
| `SkillGraphManager` | Full cycle: embed → CRUD → dirty → emit → file mirror (.skills/) → cross-graph proxy cleanup |

Managers are created in `ProjectManager.addProject()` with real context (dirty, events). For tests and single-project stdio mode, `noopContext()` provides no-op callbacks.

---

## 4. Indexing Engine

**File**: `src/cli/indexer.ts` — `createProjectIndexer()`

### Three Independent Serial Queues

```
File detected (scan/watch)
  ↓ micromatch pattern matching
  ↓
┌────────────────┬────────────────┬────────────────┐
│   docsQueue    │   codeQueue    │   fileQueue    │
│                │                │                │
│ parseFile()    │ parseCodeFile()│ fs.stat()      │
│ embedBatch()   │ embedBatch()   │ embed()        │
│ updateFile()   │ updateCodeFile │ updateFileEntry │
└────────────────┴────────────────┴────────────────┘
```

Each queue is a Promise chain — `queue = queue.then(fn).catch(log)`. Errors are logged but don't stop the queue.

### Dispatch Logic

- File matches `docsPattern` → enqueue to docs queue
- File matches `codePattern` → enqueue to code queue
- All files → enqueue to file index queue
- Files matching `excludePattern` → skipped

### Operations

- **scan()**: walk `projectDir` with `fs.readdirSync`, dispatch each file
- **watch()**: start chokidar watcher, dispatch `add`/`change`/`unlink` events
- **drain()**: `await Promise.all([docsQueue, codeQueue, fileQueue])` + `rebuildDirectoryStats()`

### Cleanup

On file removal (`unlink`): removes nodes from all graphs + `cleanupProxies()` removes orphaned cross-graph proxy nodes in KnowledgeGraph, TaskGraph, and SkillGraph.

---

## 5. Embedding System

**File**: `src/lib/embedder.ts`

### Model Registry

Two-level cache:
- `_pipes: Map<name, Pipeline>` — named models (e.g. `"my-app:docs"`, `"my-app:code"`)
- `_modelCache: Map<modelString, Pipeline>` — deduplicates by model string (same model loaded once even if used by multiple graph/project combos)

### Functions

| Function | Description |
|----------|-------------|
| `loadModel(model, modelsDir, maxChars, name)` | Load model from local cache or download from HuggingFace |
| `embed(title, content, modelName)` | Single embedding: `"title\ncontent"` → `number[]` |
| `embedBatch(inputs, modelName)` | Batch embedding: multiple items in one forward pass |
| `cosineSimilarity(a, b)` | Dot product (vectors are L2-normalized) |

### Defaults

- Model: `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- Local cache: `~/.graph-memory/models/`
- Max chars: configurable per project (`embedMaxChars`, default 2000)

---

## 6. Search

**Directory**: `src/lib/search/`

Each graph has its own search module: `docs.ts`, `code.ts`, `knowledge.ts`, `tasks.ts`, `skills.ts`, `files.ts`, `file-index.ts`. All BFS-based modules use hybrid search (BM25 + vector) by default. A standalone `bm25.ts` module provides the `BM25Index` class and RRF fusion.

### Algorithm: Hybrid Search (BM25 + Vector) with BFS

1. Compute query embedding (vector) and BM25 keyword scores
2. Fuse results using Reciprocal Rank Fusion (RRF): `score(d) = 1/(k+rank_vector) + 1/(k+rank_bm25)`
3. Take top candidates above `minScore`
4. BFS expansion: traverse edges from top candidates, score decays by `bfsDecay` (0.8) per hop
5. Merge and deduplicate results, sort by score

Supports `searchMode` parameter: `hybrid` (default, BM25 + vector), `vector` (embedding only), `keyword` (BM25 only).

### Defaults

| Parameter | Value |
|-----------|-------|
| `minScore` (node search) | 0.5 |
| `minScore` (file-level search) | 0.3 |
| `bfsDecay` | 0.8 per hop |
| `topK` | 10 |

### File-Level Search

`search_files` / `search_topic_files` use `fileEmbedding` on root nodes — simple cosine similarity, no BFS.

---

## 7. MCP Server — 58 Tools

**File**: `src/api/index.ts` — `createMcpServer()`

### Tool Groups

| Group | Count | Condition | Tools |
|-------|-------|-----------|-------|
| Docs | 10 | `docsPattern` set | `list_topics`, `get_toc`, `search`, `get_node`, `search_topic_files`, `find_examples`, `search_snippets`, `list_snippets`, `explain_symbol`, `cross_references`* |
| Code | 5 | `codePattern` set | `list_files`, `get_file_symbols`, `search_code`, `get_symbol`, `search_files` |
| Knowledge | 12 | always | `create_note`, `update_note`, `delete_note`, `get_note`, `list_notes`, `search_notes`, `create_relation`, `delete_relation`, `list_relations`, `find_linked_notes`, `add_note_attachment`, `remove_note_attachment` |
| Tasks | 13 | always | `create_task`, `update_task`, `delete_task`, `get_task`, `list_tasks`, `search_tasks`, `move_task`, `link_task`, `create_task_link`, `delete_task_link`, `find_linked_tasks`, `add_task_attachment`, `remove_task_attachment` |
| Skills | 14 | always | `create_skill`, `update_skill`, `delete_skill`, `get_skill`, `list_skills`, `search_skills`, `recall_skills`, `bump_skill_usage`, `link_skill`, `create_skill_link`, `delete_skill_link`, `find_linked_skills`, `add_skill_attachment`, `remove_skill_attachment` |
| Files | 3 | always | `list_all_files`, `search_all_files`, `get_file_info` |
| Context | 1 | always | `get_context` |

\* `cross_references` requires both docGraph AND codeGraph.

### Mutation Serialization

Mutation tools (create/update/delete) are wrapped via `createMutationServer()` — a proxy that enqueues every mutation handler call into a `PromiseQueue`. This prevents race conditions when multiple concurrent MCP sessions modify the same graph.

Read-only tools (list, get, search) run freely without queueing.

### Manager Integration

All tools receive a graph manager instead of raw graphs + embedFn. The manager encapsulates embedding, CRUD, dirty marking, event emission, and cross-graph cleanup. This eliminates duplication between MCP and REST handlers.

### Transports

| Transport | Entry | Use case |
|-----------|-------|----------|
| **stdio** | `startStdioServer()` | IDE integration, single project |
| **HTTP** | `startHttpServer()` | Single project, remote clients |
| **Multi-project HTTP** | `startMultiProjectHttpServer()` | Multiple projects, REST API, UI |

### HTTP Session Management

- Route: `/mcp/{projectId}` — StreamableHTTP from MCP SDK
- Each POST creates a new session (`randomUUID()`), returned via `mcp-session-id` header
- Sessions map to their own `McpServer` + transport, but share graph instances
- Idle session sweep every 60s (configurable timeout, default 30 min)

---

## 8. REST API

**Directory**: `src/api/rest/`

Express application mounted on the same HTTP server alongside MCP routes.

### Routes

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
POST   /api/projects/:id/knowledge/notes/:noteId/attachments  → upload attachment
GET    /api/projects/:id/knowledge/notes/:noteId/attachments  → list attachments
GET    /api/projects/:id/knowledge/notes/:noteId/attachments/:filename → download
DELETE /api/projects/:id/knowledge/notes/:noteId/attachments/:filename → delete

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
POST   /api/projects/:id/tasks/:taskId/attachments    → upload attachment
GET    /api/projects/:id/tasks/:taskId/attachments    → list attachments
GET    /api/projects/:id/tasks/:taskId/attachments/:filename → download
DELETE /api/projects/:id/tasks/:taskId/attachments/:filename → delete

GET    /api/projects/:id/skills                       → list skills
POST   /api/projects/:id/skills                       → create skill
GET    /api/projects/:id/skills/:skillId              → get skill
PUT    /api/projects/:id/skills/:skillId              → update skill
DELETE /api/projects/:id/skills/:skillId              → delete skill (204)
GET    /api/projects/:id/skills/search?q=...          → search skills
GET    /api/projects/:id/skills/recall?q=...          → recall skills (lower minScore for higher recall)
POST   /api/projects/:id/skills/links                 → create skill link
DELETE /api/projects/:id/skills/links                 → delete skill link (204)
GET    /api/projects/:id/skills/:skillId/relations    → list skill relations
GET    /api/projects/:id/skills/linked?targetGraph=...&targetNodeId=... → find linked skills
POST   /api/projects/:id/skills/:skillId/attachments  → upload attachment
GET    /api/projects/:id/skills/:skillId/attachments  → list attachments
GET    /api/projects/:id/skills/:skillId/attachments/:filename → download
DELETE /api/projects/:id/skills/:skillId/attachments/:filename → delete

GET    /api/projects/:id/docs/search?q=...            → search docs
GET    /api/projects/:id/code/search?q=...            → search code symbols
GET    /api/projects/:id/files                        → list files
GET    /api/projects/:id/files/search?q=...           → search files
GET    /api/projects/:id/graph?scope=...              → export graph for visualization

GET    /api/projects/:id/tools                        → list available MCP tools
GET    /api/projects/:id/tools/:toolName              → get tool details + input schema
POST   /api/projects/:id/tools/:toolName/call         → call a tool with arguments
```

Response format: `{ results: [...] }` for lists, direct object for single items. DELETE returns 204.

### Tools Explorer API

The tools router (`src/api/rest/tools.ts`) exposes MCP tools via HTTP. It creates a lazy in-memory MCP client per project (cached on `ProjectInstance`), lists tool schemas, and proxies `callTool()` requests. Returns execution duration alongside results.

### Validation

Zod schemas validate all request bodies and query params (`src/api/rest/validation.ts`).

### Static Files + SPA Fallback

Non-API routes serve UI from `ui/dist/`. Unknown paths return `index.html` for client-side routing.

---

## 9. WebSocket

**File**: `src/api/rest/websocket.ts`

Single WebSocket endpoint at `/api/ws`. Broadcasts real-time events to all connected clients.

### Events

```json
{ "projectId": "my-app", "type": "note:created", "data": { "noteId": "..." } }
{ "projectId": "my-app", "type": "task:moved",   "data": { "taskId": "...", "status": "done" } }
{ "projectId": "my-app", "type": "graph:updated", "data": { "file": "...", "graph": "docs" } }
```

Event types: `note:created|updated|deleted`, `task:created|updated|deleted|moved`, `skill:created|updated|deleted`, `note:attachment:added|deleted`, `task:attachment:added|deleted`, `skill:attachment:added|deleted`, `graph:updated`.

The UI filters events by current `projectId` client-side.

---

## 10. Web UI

**Directory**: `ui/`

### Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| React | 19 | UI framework |
| Material UI (MUI) | 7 | Component library |
| React Router DOM | 7 | Client-side routing |
| Cytoscape.js | 3.33 | Graph visualization |
| Vite | 8 | Build tool + dev server |

### Architecture: Feature-Sliced Design (FSD)

```
ui/src/
├── main.tsx                      # ReactDOM.createRoot + Router + Theme
├── app/
│   ├── App.tsx                   # Route definitions
│   ├── theme.ts                  # MUI light/dark themes + custom tokens
│   └── styles.css                # Global styles
├── pages/
│   ├── dashboard/                # Project stats cards + recent activity
│   ├── knowledge/                # Notes CRUD + semantic search + detail/edit/new
│   ├── tasks/                    # Kanban board + drag & drop + detail/edit/new
│   ├── skills/                   # Skill/recipe management + triggers + usage tracking
│   ├── docs/                     # Browse indexed documentation + detail view
│   ├── files/                    # File browser + search + detail view
│   ├── prompts/                  # AI prompt generator (scenarios, roles, styles)
│   ├── search/                   # Cross-graph unified search
│   ├── graph/                    # Interactive graph visualization (Cytoscape.js)
│   ├── tools/                    # MCP tools explorer + live execution
│   └── help/                     # Built-in searchable documentation
├── widgets/
│   └── layout/                   # Sidebar + project selector + theme toggle
├── features/
│   ├── note-crud/                # useNotes hook, NoteDialog, RelationsDialog
│   ├── task-crud/                # TaskDialog
│   └── skill-crud/               # SkillDialog
├── entities/
│   ├── project/                  # listProjects API
│   ├── note/                     # Note type, API functions, NoteCard
│   ├── task/                     # Task type, statuses, priorities, API
│   ├── skill/                    # Skill type, API
│   ├── file/                     # FileInfo type, API
│   ├── doc/                      # searchDocs API
│   ├── code/                     # searchCode API
│   └── graph/                    # GraphNode, GraphEdge, exportGraph API
├── content/
│   ├── help/                     # Help articles (markdown, bundled via ?raw)
│   │   ├── getting-started.md
│   │   ├── concepts/             # how-search-works, graph-structure, cross-graph
│   │   └── guides/               # docs-tools, code-tools, knowledge-tools, task-tools, skill-tools, files-tools, cross-references
│   └── prompts/                  # Prompt generator content (roles, styles, graphs, scenarios, template)
└── shared/
    ├── api/client.ts             # Base HTTP: get(), post(), put(), del()
    ├── lib/useWebSocket.ts       # WebSocket hook with auto-reconnect
    └── lib/ThemeModeContext.tsx   # Light/dark theme toggle context
```

### Routes

All routes are scoped to a project: `/:projectId/...`

| Route | Page | Description |
|-------|------|-------------|
| `/:projectId/dashboard` | DashboardPage | Stats cards (notes, tasks, skills, docs, code, files) + recent activity |
| `/:projectId/knowledge` | KnowledgePage | Note list, detail, create/edit, semantic search, relations |
| `/:projectId/tasks` | TasksPage | Kanban board: configurable column visibility (localStorage), drag-drop with drop-zone highlights, inline task creation, filter bar (search/priority/tags), due date & estimate badges, quick actions on hover, scrollable columns |
| `/:projectId/skills` | SkillsPage | Skill/recipe management with triggers, steps, usage tracking, cross-graph links |
| `/:projectId/docs` | DocsPage | Browse indexed documentation, TOC, detail view |
| `/:projectId/files` | FilesPage | File browser with directory navigation, metadata, search |
| `/:projectId/prompts` | PromptsPage | AI prompt generator: scenario presets, graph/role/style selection, live preview, copy & export as skill |
| `/:projectId/search` | SearchPage | Unified search across all 6 graphs, faceted results |
| `/:projectId/graph` | GraphPage | Cytoscape force-directed graph, scope filter, node inspector |
| `/:projectId/tools` | ToolsPage | MCP tools explorer, input schemas, live execution |
| `/:projectId/help` | HelpPage | Searchable documentation on tools and concepts |

### Dev Server

```bash
cd ui && npm run dev    # Vite on :5173, proxies /api → http://localhost:3000
cd ui && npm run build  # Production build → ui/dist/
```

---

## 11. Project Manager

**File**: `src/lib/project-manager.ts`

Manages multiple project instances for the `serve` command.

```typescript
interface ProjectInstance {
  id: string;
  config: ProjectConfig;
  docGraph?: DocGraph;
  codeGraph?: CodeGraph;
  knowledgeGraph: KnowledgeGraph;
  fileIndexGraph: FileIndexGraph;
  taskGraph: TaskGraph;
  skillGraph: SkillGraph;
  docManager?: DocGraphManager;
  codeManager?: CodeGraphManager;
  knowledgeManager: KnowledgeGraphManager;
  fileIndexManager: FileIndexGraphManager;
  taskManager: TaskGraphManager;
  skillManager: SkillGraphManager;
  embedFns: EmbedFnMap;
  mutationQueue: PromiseQueue;
  dirty: boolean;
}
```

Each manager wraps its graph and provides a unified API for all operations. Managers for KnowledgeGraph, TaskGraph, and SkillGraph receive a `GraphManagerContext` with `markDirty()` and `emit()` callbacks, plus references to neighboring graphs for cross-graph cleanup.

For **workspace projects**, the `ProjectInstance` has `workspaceId` set. These projects share the workspace's `knowledgeManager`, `taskManager`, `skillManager`, and `mutationQueue`. Per-project graphs (doc, code, file index) remain isolated. On project removal, workspace `projectGraphs` references are cleaned up.

### Lifecycle

1. `addProject(id, config, reindex?)` — load graphs from disk (or fresh if reindex), create instance
2. `loadModels(id)` — async load embedding models (can be deferred)
3. `startIndexing(id)` — create indexer + watcher, initial scan
4. `saveProject(instance)` — persist dirty graphs to disk
5. `removeProject(id)` — drain indexer, close watcher, save, remove
6. `shutdown()` — remove all projects gracefully

### Auto-Save

`startAutoSave()` runs `setInterval` (30s) to persist dirty projects.

### YAML Hot-Reload

The `serve` command watches `graph-memory.yaml` with chokidar. On change:
- Added projects → `addProject()` + `loadModels()` + `startIndexing()`
- Removed projects → `removeProject()`
- Changed projects → remove + re-add

---

## 12. Concurrency Model

### PromiseQueue

**File**: `src/lib/promise-queue.ts`

```typescript
class PromiseQueue {
  private chain = Promise.resolve();
  enqueue<T>(fn: () => Promise<T>): Promise<T>;
}
```

Serial Promise chain — each enqueued function runs only after the previous one completes.

### Where It's Used

| Context | Purpose |
|---------|---------|
| **Per-project MutationQueue** | Serializes create/update/delete tool calls. Prevents concurrent graph modifications from parallel MCP sessions |
| **Indexer queues** (docs/code/files) | Serializes per-queue indexing. Each queue is independent, but within a queue operations are serial |

### Read-Only Safety

Read tools (`list`, `get`, `search`) run without queueing. They read graph state directly — Graphology's in-memory operations are synchronous reads, so they see a consistent snapshot.

---

## 13. Data Flow

### Indexing Flow

```
File on disk
  → chokidar detects add/change
  → micromatch checks patterns
  → parser extracts structure (markdown chunks / AST symbols / file stats)
  → embedBatch() computes embeddings via transformers.js
  → graph updated in memory (Graphology)
  → marked dirty
  → auto-save persists to JSON on disk
  → WebSocket broadcasts event to UI
```

### Query Flow (MCP Tool or REST API)

```
Client request
  → tool handler / REST route (thin adapter)
  → graph manager method (e.g. mgr.searchNotes(query, opts))
  → manager computes query embedding
  → search module: cosine similarity + BFS expansion
  → results ranked by score, filtered by minScore
  → response sent back
```

### Cross-Graph Link Flow

```
create_relation(fromNote, targetNodeId, targetGraph="docs")
  → check target exists in docs graph
  → create proxy node @docs::targetNodeId in knowledge graph (empty embedding)
  → create edge: fromNote → @docs::targetNodeId with kind
  → proxy excluded from list/search (starts with @)

When target file is removed from docs graph:
  → cleanupProxies() finds orphaned @docs:: proxies
  → removes proxy nodes and their edges
```

### File Mirror Flow

```
KnowledgeGraphManager / TaskGraphManager / SkillGraphManager mutation
  → graph updated (CRUD)
  → markDirty() + emit()
  → mirrorNote(id) / mirrorTask(id) / mirrorSkill(id)
      → read attrs + relations from graph
      → serialize to markdown with YAML frontmatter
      → writeFileSync to .notes/{id}/note.md, .tasks/{id}/task.md, or .skills/{id}/skill.md
  → deleteMirrorDir() on delete (removes directory + attachments)

Attachment flow (addAttachment / removeAttachment):
  → sanitize filename → write/delete file in .notes/{id}/, .tasks/{id}/, or .skills/{id}/
  → scanAttachments() rebuilds metadata from directory contents
  → update graph node attrs → markDirty() + emit()
```

**File format**: markdown with YAML frontmatter. Relations are stored as outgoing edges only.

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

**Location**: `{projectDir}/.notes/`, `{projectDir}/.tasks/`, and `{projectDir}/.skills/`. Excluded from the project indexer watcher.

**Files**: `src/lib/frontmatter.ts` (serialize/parse), `src/lib/file-mirror.ts` (write/delete helpers).

### Reverse Import (IDE → Graph)

A separate chokidar watcher on `.notes/`, `.tasks/`, and `.skills/` detects external file edits (e.g. from an IDE) and syncs them back to the graph. `MirrorWriteTracker` prevents feedback loops by comparing file mtime after our own writes. On startup, `scanMirrorDirs()` imports any files newer than the graph's `updatedAt`. Manager methods `importFromFile()` and `deleteFromFile()` update the graph without re-writing the mirror file. Relation changes in frontmatter are diffed and applied via `diffRelations()`.

**Files**: `src/lib/file-import.ts` (parsers + diff), `src/lib/mirror-watcher.ts` (tracker + watcher).

---

## 14. Directory Structure

```
src/
  graphs/                    # Graph data layer — CRUD, persistence, manager classes
    manager-types.ts         # GraphManagerContext, ExternalGraphs, noopContext()
    docs.ts                  # DocGraph CRUD + persistence + DocGraphManager
    code.ts                  # CodeGraph CRUD + persistence + CodeGraphManager
    code-types.ts            # CodeGraph type definitions
    knowledge.ts             # KnowledgeGraph CRUD + proxies + KnowledgeGraphManager
    knowledge-types.ts       # KnowledgeGraph type definitions
    file-index.ts            # FileIndexGraph CRUD + FileIndexGraphManager
    file-index-types.ts      # FileIndexGraph type definitions
    file-lang.ts             # Extension → language lookup + MIME via `mime` library
    attachment-types.ts      # AttachmentMeta interface + scanAttachments() helper
    task.ts                  # TaskGraph CRUD + proxies + TaskGraphManager
    task-types.ts            # TaskGraph type definitions
    skill.ts                 # SkillGraph CRUD + proxies + SkillGraphManager
    skill-types.ts           # SkillGraph type definitions
  cli/
    index.ts                 # Commander CLI (3 commands)
    indexer.ts               # ProjectIndexer (3 queues, scan, watch, drain)
  lib/
    multi-config.ts          # Multi-project config (YAML + Zod)
    embedder.ts              # Embeddings (@xenova/transformers)
    watcher.ts               # File watching (chokidar)
    project-manager.ts       # Multi-project lifecycle + creates managers
    promise-queue.ts         # Serial PromiseQueue
    frontmatter.ts           # YAML frontmatter + markdown serialization/parsing
    file-mirror.ts           # File mirror helpers (write/delete .notes/ .tasks/ .skills/ files)
    file-import.ts           # Reverse import from mirror files (parseNoteFile, parseTaskFile, parseSkillFile)
    mirror-watcher.ts        # MirrorWriteTracker + watcher for reverse import from IDE edits
    parsers/
      docs.ts                # Markdown → Chunk[] (headings, code blocks)
      code.ts                # TS/JS → ParsedFile (ts-morph AST)
      codeblock.ts           # Symbol extraction from code blocks
    search/
      bm25.ts                # BM25Index class, tokenizer, RRF fusion
      docs.ts                # Hybrid (BM25 + vector) search over DocGraph
      code.ts                # Hybrid search over CodeGraph
      knowledge.ts           # Hybrid search over KnowledgeGraph
      tasks.ts               # Hybrid search over TaskGraph
      skills.ts              # Hybrid search over SkillGraph
      files.ts               # File-level cosine search (docs/code)
      file-index.ts          # Cosine search over FileIndexGraph
  api/
    index.ts                 # createMcpServer() + transports (stdio/HTTP)
    rest/
      index.ts               # Express app + SPA fallback
      validation.ts          # Zod schemas + validation middleware
      knowledge.ts           # Knowledge REST routes (via KnowledgeGraphManager)
      tasks.ts               # Task REST routes (via TaskGraphManager)
      skills.ts              # Skills REST routes (via SkillGraphManager)
      docs.ts                # Docs search routes (via DocGraphManager)
      code.ts                # Code search routes (via CodeGraphManager)
      files.ts               # Files REST routes (via FileIndexGraphManager)
      graph.ts               # Graph export endpoint
      tools.ts               # Tools explorer REST routes (list, get, call)
      websocket.ts           # WebSocket server
    tools/
      docs/                  # 10 MCP doc tools (via DocGraphManager)
      code/                  # 5 MCP code tools (via CodeGraphManager)
      knowledge/             # 12 MCP knowledge tools (via KnowledgeGraphManager)
      tasks/                 # 13 MCP task tools (via TaskGraphManager)
      skills/                # 14 MCP skill tools (via SkillGraphManager)
      file-index/            # 3 MCP file index tools (via FileIndexGraphManager)
      context/               # 1 MCP context tool (get_context — project/workspace discovery)
  tests/
    *.test.ts                # Jest test suites (26 suites, 1178 tests)
    helpers.ts               # Test utilities (fakeEmbed, setupMcpClient)
    __mocks__/               # Jest mocks for ESM-only packages (chokidar, @xenova/transformers, mime)
    fixtures/                # Test fixtures (markdown, TypeScript)
ui/
  src/                       # React UI (FSD architecture — see section 10)
  vite.config.ts             # Vite config with /api proxy
  package.json               # UI dependencies
  README.md                  # UI development guide
```

---

## 15. Dependencies

### Backend

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server + transports (stdio, StreamableHTTP) |
| `@xenova/transformers` | Embedding models (ONNX runtime) |
| `graphology` | In-memory directed graph |
| `chokidar` | File system watching |
| `commander` | CLI argument parsing |
| `express` + `cors` | REST API |
| `multer` | Multipart file upload (attachments) |
| `ws` | WebSocket server |
| `yaml` | YAML config parsing |
| `zod` | Schema validation |
| `micromatch` | Glob pattern matching |
| `mime` | IANA MIME type lookup (file index) |
| `ts-morph` | TypeScript AST parsing |
| `dotenv` | Environment variable loading |

### Frontend

| Package | Purpose |
|---------|---------|
| `react` + `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `@mui/material` + `@mui/icons-material` | Component library |
| `cytoscape` | Graph visualization |
| `react-markdown` + `remark-gfm` | Markdown rendering |
| `@uiw/react-md-editor` | Markdown editor |
| `vite` | Build tool + dev server |
