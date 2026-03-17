# mcp-graph-memory

An MCP server that builds a **semantic graph memory** from a project directory.
It indexes markdown documentation and TypeScript/JavaScript source code into graph structures,
then exposes them as MCP tools that any AI assistant can use to navigate and search the project.

## Quick start with Docker

### 1. Create a config file

Create `graph-memory.yaml` — paths must be relative to the container filesystem:

```yaml
server:
  host: "0.0.0.0"
  port: 3000
  modelsDir: "/data/models"

projects:
  my-app:
    projectDir: "/data/projects/my-app"
    docsPattern: "docs/**/*.md"
    codePattern: "src/**/*.{ts,tsx}"
    excludePattern: "node_modules/**,dist/**"
```

### 2. Run with Docker

```bash
docker run -d \
  --name graph-memory \
  -p 3000:3000 \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app:ro \
  -v graph-memory-models:/data/models \
  ghcr.io/prih/mcp-graph-memory
```

Three mounts:
| Mount | Container path | Description |
|-------|---------------|-------------|
| **Config** | `/data/config/graph-memory.yaml` | Your config file (read-only) |
| **Projects** | `/data/projects/` | Project directories to index (read-only, unless you use knowledge/tasks/skills — then remove `:ro`) |
| **Models** | `/data/models/` | Embedding model cache — use a named volume so models persist across container restarts |

The embedding model (`Xenova/all-MiniLM-L6-v2`, ~90MB) is downloaded on first startup. Subsequent starts use the cached model from the volume.

### 3. Run with Docker Compose

```yaml
# docker-compose.yaml
services:
  graph-memory:
    image: ghcr.io/prih/mcp-graph-memory
    ports:
      - "3000:3000"
    volumes:
      - ./graph-memory.yaml:/data/config/graph-memory.yaml:ro
      - /path/to/my-app:/data/projects/my-app
      - models:/data/models
    restart: unless-stopped

volumes:
  models:
```

```bash
docker compose up -d
```

### 4. Connect

- **Web UI**: `http://localhost:3000`
- **MCP (Streamable HTTP)**: `http://localhost:3000/mcp/my-app`
- **REST API**: `http://localhost:3000/api/projects`

To force re-index all projects from scratch:

```bash
docker run --rm \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app \
  -v graph-memory-models:/data/models \
  ghcr.io/prih/mcp-graph-memory serve --config /data/config/graph-memory.yaml --reindex
```

> **Multiple projects**: mount each project directory separately and add entries to `graph-memory.yaml`. The config file is watched for changes — add or remove projects without restarting the container.

## What it does

- Parses **markdown files** into heading-based chunks, links related files via graph edges
- Extracts **fenced code blocks** from markdown — parses TS/JS blocks with ts-morph for symbol extraction
- Parses **TypeScript/JavaScript source** via ts-morph — extracts functions, classes, interfaces,
  types, enums, and their relationships (`contains`, `imports`, `extends`, `implements`)
- Indexes **all project files** into a file index graph with directory hierarchy, language/MIME detection
- Stores **facts and notes** in a dedicated knowledge graph with typed relations, file attachments, and cross-graph links; mirrors to `.notes/{id}/` directories
- Tracks **tasks** in a task graph with status (kanban), priority, due dates, estimates, file attachments, and cross-graph links; mirrors to `.tasks/{id}/` directories
- Manages **skills** (recipes/procedures) in a skill graph with steps, triggers, usage tracking, file attachments, and cross-graph links; mirrors to `.skills/{id}/` directories
- Embeds every node locally using `Xenova/all-MiniLM-L6-v2` by default (no external API calls); supports per-graph models
- Answers search queries via **hybrid search** (BM25 keyword + vector cosine similarity) with BFS graph expansion
- Watches for file changes and re-indexes incrementally

## MCP tools (58)

### Context tool (always enabled)

| Tool               | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `get_context`      | Returns current project and workspace context (project ID, workspace ID, workspace projects, available graphs) |

### Docs tools (enabled when `--docs-pattern` is set)

| Tool               | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `list_topics`      | List all indexed markdown files with title and chunk count     |
| `get_toc`          | Return the table of contents for a specific file               |
| `search`           | Hybrid search over docs (BM25 + vector) with BFS expansion    |
| `get_node`         | Fetch full content of a specific doc chunk by ID               |
| `search_topic_files` | Semantic file-level search over docs (by file path + title) |

### Code block tools (enabled when `--docs-pattern` is set)

| Tool               | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `find_examples`    | Find code blocks in docs containing a specific symbol          |
| `search_snippets`  | Semantic search over code blocks extracted from docs           |
| `list_snippets`    | List code blocks with filters (file, language, content)        |
| `explain_symbol`   | Find code example + surrounding text explanation for a symbol  |

### Cross-graph tools (requires both docs + code)

| Tool               | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `cross_references` | Full picture: definitions (code) + examples + docs for a symbol |

### Code tools (enabled when `--code-pattern` is set)

| Tool               | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `list_files`       | List all indexed source files with symbol counts               |
| `get_file_symbols` | List all symbols in a file (sorted by line)                    |
| `search_code`      | Hybrid search over code (BM25 + vector) with BFS expansion    |
| `get_symbol`       | Fetch full source body of a specific symbol by ID              |
| `search_files`     | Semantic file-level search over code (by file path)            |

### File index tools (always enabled)

| Tool               | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `list_all_files`   | List all project files/dirs with filters (directory, extension, language) |
| `search_all_files` | Semantic search over files by path                             |
| `get_file_info`    | Get full metadata for a file or directory                      |

### Knowledge tools (always enabled)

| Tool               | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `create_note`      | Create a note with title, content, and tags                    |
| `update_note`      | Update an existing note's title, content, or tags              |
| `delete_note`      | Delete a note and its relations                                |
| `get_note`         | Fetch a note by ID                                             |
| `list_notes`       | List notes with optional filter and tag                        |
| `search_notes`     | Hybrid search over notes (BM25 + vector) with BFS expansion   |
| `create_relation`  | Create a relation between notes or to doc/code/files/task nodes |
| `delete_relation`  | Delete a relation (note-to-note or cross-graph)                |
| `list_relations`   | List all relations for a note (includes cross-graph links)     |
| `find_linked_notes`| Reverse lookup: find all notes that link to a doc/code/file/task node |
| `add_note_attachment` | Attach a file to a note (by absolute path)                    |
| `remove_note_attachment` | Remove an attachment from a note                          |

### Task tools (always enabled)

| Tool               | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `create_task`      | Create a task with title, description, priority, tags, status, dueDate, estimate |
| `update_task`      | Update any task fields (partial update)                        |
| `delete_task`      | Delete a task and its relations                                |
| `get_task`         | Fetch a task with subtasks, blockedBy, blocks, and related     |
| `list_tasks`       | List tasks with filters (status, priority, tag, filter text)   |
| `search_tasks`     | Hybrid search over tasks (BM25 + vector) with BFS expansion   |
| `move_task`        | Change task status with auto completedAt management            |
| `link_task`        | Create task↔task relations (subtask_of, blocks, related_to)    |
| `create_task_link` | Link a task to a doc/code/file/knowledge node                  |
| `delete_task_link` | Remove a cross-graph link from a task                          |
| `find_linked_tasks`| Reverse lookup: find all tasks that link to a target node      |
| `add_task_attachment` | Attach a file to a task (by absolute path)                  |
| `remove_task_attachment` | Remove an attachment from a task                         |

### Skill tools (always enabled)

| Tool               | Description                                                    |
|--------------------|----------------------------------------------------------------|
| `create_skill`     | Create a skill (recipe/procedure) with steps, triggers, and metadata |
| `update_skill`     | Update any skill fields (partial update)                       |
| `delete_skill`     | Delete a skill and its relations                               |
| `get_skill`        | Fetch a skill with dependsOn/dependedBy/related/variants + cross-links |
| `list_skills`      | List skills with filters (source, tag, filter text)            |
| `search_skills`    | Hybrid search over skills (BM25 + vector) with BFS expansion  |
| `link_skill`       | Create skill↔skill relations (depends_on, related_to, variant_of) |
| `create_skill_link`| Link a skill to a doc/code/file/knowledge/task node            |
| `delete_skill_link`| Remove a cross-graph link from a skill                         |
| `find_linked_skills`| Reverse lookup: find all skills that link to a target node    |
| `add_skill_attachment` | Attach a file to a skill (by absolute path)               |
| `remove_skill_attachment` | Remove an attachment from a skill                      |
| `recall_skills`    | Recall relevant skills for a task context (lower minScore for higher recall) |
| `bump_skill_usage` | Increment skill usage counter + set lastUsedAt                 |

## Installation (from source)

```bash
npm install
npm run build
```

## Usage

### 1. Create `graph-memory.yaml`

```yaml
server:
  host: "127.0.0.1"
  port: 3000
  sessionTimeout: 1800
  embeddingModel: "Xenova/all-MiniLM-L6-v2"

projects:
  my-app:
    projectDir: "/path/to/my-app"
    docsPattern: "docs/**/*.md"
    codePattern: "src/**/*.{ts,tsx}"
    excludePattern: "node_modules/**,dist/**"
    tsconfig: "./tsconfig.json"
    codeModel: "Xenova/bge-base-en-v1.5"
    skillsModel: "Xenova/all-MiniLM-L6-v2"
```

Per-graph models are optional — any graph without its own model uses `server.embeddingModel` (default `Xenova/all-MiniLM-L6-v2`). The same model string is loaded only once (deduplication).

All fields are optional except `projectDir` — see [`graph-memory.yaml.example`](graph-memory.yaml.example) for the full list.

### 2. Run

```bash
# Multi-project HTTP server (primary mode — serves all projects)
node /path/to/mcp-graph-memory/dist/cli/index.js serve --config graph-memory.yaml

# Single-project stdio (for MCP clients like Claude Desktop)
node /path/to/mcp-graph-memory/dist/cli/index.js mcp --config graph-memory.yaml --project my-app

# Index one project and exit
node /path/to/mcp-graph-memory/dist/cli/index.js index --config graph-memory.yaml --project my-app

# Force re-index from scratch (discard persisted graphs)
node /path/to/mcp-graph-memory/dist/cli/index.js serve --config graph-memory.yaml --reindex
```

All three commands (`serve`, `mcp`, `index`) support `--reindex` to discard persisted graph JSON files and re-create graphs from scratch.

### Claude Desktop / MCP client configuration

**Stdio transport** (one project per process):

```json
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": [
        "/path/to/mcp-graph-memory/dist/cli/index.js",
        "mcp",
        "--config", "/path/to/graph-memory.yaml",
        "--project", "my-app"
      ]
    }
  }
}
```

**HTTP transport** (multi-project, multiple clients share one server):

Start the server:
```bash
node /path/to/mcp-graph-memory/dist/cli/index.js serve --config graph-memory.yaml
```

Then connect your MCP client to `http://localhost:3000/mcp/{projectId}` using the Streamable HTTP transport.

For Claude Desktop with HTTP transport:
```json
{
  "mcpServers": {
    "project-memory": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp/my-app"
    }
  }
}
```

For Cursor, Windsurf, or other MCP clients — use the Streamable HTTP URL:
```
http://localhost:3000/mcp/{projectId}
```

Each project configured in `graph-memory.yaml` gets its own MCP endpoint at `/mcp/{projectId}`. Multiple clients can connect to the same server simultaneously — each session gets its own MCP instance but shares graph data.

The server watches `graph-memory.yaml` for changes — add, remove, or update projects without restarting.

## Configuration

### `graph-memory.yaml`

YAML config file. All fields optional except `projects.*.projectDir`:

**Server settings** (`server:`):

| Field | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | `127.0.0.1` | HTTP server bind address |
| `port` | `number` | `3000` | HTTP server port |
| `sessionTimeout` | `number` | `1800` | Idle session timeout in seconds |
| `modelsDir` | `string` | `~/.graph-memory/models` | Local model cache directory |
| `embeddingModel` | `string` | `Xenova/all-MiniLM-L6-v2` | Default embedding model (fallback for all graphs) |

**Per-project settings** (`projects.<id>:`):

| Field | Type | Default | Description |
|---|---|---|---|
| `projectDir` | `string` | **(required)** | Root directory to index |
| `graphMemory` | `string` | `{projectDir}/.graph-memory` | Where to store graph JSON files |
| `docsPattern` | `string` | `**/*.md` | Glob for markdown files |
| `codePattern` | `string` | `**/*.{js,ts,jsx,tsx}` | Glob for source files |
| `excludePattern` | `string` | `node_modules/**` | Glob to exclude from indexing |
| `tsconfig` | `string` | — | Path to tsconfig.json |
| `embeddingModel` | `string` | (server default) | Embedding model for this project |
| `docsModel` | `string` | — | Embedding model for docs graph |
| `codeModel` | `string` | — | Embedding model for code graph |
| `knowledgeModel` | `string` | — | Embedding model for knowledge graph |
| `taskModel` | `string` | — | Embedding model for task graph |
| `filesModel` | `string` | — | Embedding model for file index graph |
| `skillsModel` | `string` | — | Embedding model for skills graph |
| `chunkDepth` | `number` | `4` | Max heading depth to chunk at |
| `maxTokensDefault` | `number` | `4000` | Default max tokens for responses |
| `embedMaxChars` | `number` | `2000` | Max chars fed to embedder per node |

## How graph IDs work

**Doc nodes**: `"docs/auth.md"` (file root), `"docs/auth.md::JWT Tokens"` (section),
`"docs/auth.md::Notes::2"` (duplicate heading)

**Code block nodes**: `"docs/auth.md::JWT Tokens::code-1"` (first code block in section)

**Code nodes**: `"src/lib/graph.ts"` (file), `"src/lib/graph.ts::updateFile"` (function),
`"src/lib/graph.ts::GraphStore::set"` (method)

**Knowledge nodes**: `"auth-uses-jwt"` (slug from title), `"auth-uses-jwt::2"` (dedup)

**File index nodes**: `"src/lib/config.ts"` (file), `"src/lib"` (directory), `"."` (root)

**Task nodes**: `"implement-auth"` (slug from title), `"implement-auth::2"` (dedup)

**Skill nodes**: `"add-rest-endpoint"` (slug from title), `"add-rest-endpoint::2"` (dedup)

**Cross-graph proxy nodes**: `"@docs::docs/auth.md::JWT Tokens"`, `"@code::src/auth.ts::Foo"`, `"@files::src/config.ts"`, `"@tasks::implement-auth"`, `"@knowledge::my-note"`, `"@skills::add-rest-endpoint"` (internal — resolved transparently in `list_relations`)

Pass these IDs to `get_node`, `get_symbol`, or `get_note` to fetch full content.

## Web UI

The `serve` command starts a web UI at `http://localhost:3000` with:

- **Dashboard** — project stats (notes, tasks, skills, docs, code, files) + recent activity
- **Knowledge** — notes CRUD, semantic search, relations, cross-graph links
- **Tasks** — kanban board with configurable columns, drag-drop with drop-zone highlights, inline task creation, filter bar (search/priority/tags), due date and estimate badges, quick actions on hover, scrollable columns
- **Skills** — skill/recipe management with triggers, steps, and usage tracking
- **Docs** — browse and search indexed markdown documentation
- **Files** — file browser with directory navigation, metadata, search
- **Prompts** — AI prompt generator with scenario presets, role/style/graph selection, live preview, copy & export as skill
- **Search** — unified semantic search across all 6 graphs
- **Graph** — interactive force-directed graph visualization (Cytoscape.js)
- **Tools** — MCP tools explorer with live execution from the browser
- **Help** — built-in searchable documentation on all tools and concepts

Light/dark theme toggle. Real-time updates via WebSocket.

### REST API

The HTTP server also exposes a REST API at `/api/*`:

```
GET    /api/projects                                  → list projects with stats
GET    /api/projects/:id/stats                        → per-graph node/edge counts

GET    /api/projects/:id/knowledge/notes              → list notes
POST   /api/projects/:id/knowledge/notes              → create note
GET    /api/projects/:id/knowledge/notes/:noteId      → get note
PUT    /api/projects/:id/knowledge/notes/:noteId      → update note
DELETE /api/projects/:id/knowledge/notes/:noteId      → delete note
GET    /api/projects/:id/knowledge/search?q=...       → search notes
POST   /api/projects/:id/knowledge/relations          → create relation
DELETE /api/projects/:id/knowledge/relations          → delete relation
GET    /api/projects/:id/knowledge/notes/:noteId/relations → list note relations
GET    /api/projects/:id/knowledge/linked?targetGraph=...&targetNodeId=... → find linked notes
POST   /api/projects/:id/knowledge/notes/:noteId/attachments  → upload attachment
GET    /api/projects/:id/knowledge/notes/:noteId/attachments  → list attachments
GET    /api/projects/:id/knowledge/notes/:noteId/attachments/:filename → download attachment
DELETE /api/projects/:id/knowledge/notes/:noteId/attachments/:filename → delete attachment

GET    /api/projects/:id/tasks                        → list tasks
POST   /api/projects/:id/tasks                        → create task
GET    /api/projects/:id/tasks/:taskId                → get task
PUT    /api/projects/:id/tasks/:taskId                → update task
DELETE /api/projects/:id/tasks/:taskId                → delete task
POST   /api/projects/:id/tasks/:taskId/move           → move task status
GET    /api/projects/:id/tasks/search?q=...           → search tasks
POST   /api/projects/:id/tasks/links                  → create task link
DELETE /api/projects/:id/tasks/links                  → delete task link
GET    /api/projects/:id/tasks/:taskId/relations      → list task relations
GET    /api/projects/:id/tasks/linked?targetGraph=...&targetNodeId=... → find linked tasks
POST   /api/projects/:id/tasks/:taskId/attachments    → upload attachment
GET    /api/projects/:id/tasks/:taskId/attachments    → list attachments
GET    /api/projects/:id/tasks/:taskId/attachments/:filename → download attachment
DELETE /api/projects/:id/tasks/:taskId/attachments/:filename → delete attachment

GET    /api/projects/:id/skills                        → list skills
POST   /api/projects/:id/skills                        → create skill
GET    /api/projects/:id/skills/:skillId               → get skill
PUT    /api/projects/:id/skills/:skillId               → update skill
DELETE /api/projects/:id/skills/:skillId               → delete skill
GET    /api/projects/:id/skills/search?q=...           → search skills
POST   /api/projects/:id/skills/links                  → create skill link
DELETE /api/projects/:id/skills/links                  → delete skill link
GET    /api/projects/:id/skills/:skillId/relations     → list skill relations
GET    /api/projects/:id/skills/linked?targetGraph=...&targetNodeId=... → find linked skills
POST   /api/projects/:id/skills/:skillId/attachments   → upload attachment
GET    /api/projects/:id/skills/:skillId/attachments   → list attachments
GET    /api/projects/:id/skills/:skillId/attachments/:filename → download attachment
DELETE /api/projects/:id/skills/:skillId/attachments/:filename → delete attachment

GET    /api/projects/:id/docs/search?q=...            → search docs
GET    /api/projects/:id/code/search?q=...            → search code
GET    /api/projects/:id/files                        → list files
GET    /api/projects/:id/files/search?q=...           → search files
GET    /api/projects/:id/graph?scope=...              → graph export

GET    /api/projects/:id/tools                        → list MCP tools
GET    /api/projects/:id/tools/:toolName              → tool details + schema
POST   /api/projects/:id/tools/:toolName/call         → call a tool
```

## Demo Project

A demo project (`demo-project/`) is included — a fictional "TaskFlow" project management API with:

- **18 TypeScript files** — models, services, controllers, middleware, utilities
- **11 markdown docs** — architecture, API reference, guides, changelog
- **Seed script** — creates 15 notes + 20 tasks + 10 skills + relations + cross-graph links via REST API

To try it:

```bash
# 1. Start the server (indexes code + docs automatically)
npm run build
node dist/cli/index.js serve --config graph-memory.yaml

# 2. Seed notes, tasks, and relations
./demo-project/scripts/seed.sh
```

The `demo-taskflow` project is pre-configured in `graph-memory.yaml`. Open `http://localhost:3000` to explore the data.

## Development

```bash
npm run dev   # watch mode (backend)
cd ui && npm run dev   # Vite dev server on :5173, proxies /api → :3000
```

Run tests:
```bash
npm test                                   # all tests (26 suites)
npm test -- --testPathPatterns=search       # run a specific test file
npm run test:watch                         # watch mode
```
