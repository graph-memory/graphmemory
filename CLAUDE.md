# CLAUDE.md

## Project overview

MCP server that builds a semantic graph memory from a project directory — indexing both
**markdown docs** and **TypeScript/JavaScript source code**.

Exposes up to 57 tools over stdio MCP and HTTP (Streamable HTTP) transports:
- Docs: `list_topics`, `get_toc`, `search`, `get_node`, `search_topic_files`
- Code blocks: `find_examples`, `search_snippets`, `list_snippets`, `explain_symbol`
- Cross-graph: `cross_references` (requires both docs + code)
- Code: `list_files`, `get_file_symbols`, `search_code`, `get_symbol`, `search_files`
- File index: `list_all_files`, `search_all_files`, `get_file_info`
- Knowledge: `create_note`, `update_note`, `delete_note`, `get_note`, `list_notes`, `search_notes`, `create_relation`, `delete_relation`, `list_relations`, `find_linked_notes`, `add_note_attachment`, `remove_note_attachment`
- Tasks: `create_task`, `update_task`, `delete_task`, `get_task`, `list_tasks`, `search_tasks`, `move_task`, `link_task`, `create_task_link`, `delete_task_link`, `find_linked_tasks`, `add_task_attachment`, `remove_task_attachment`
- Skills: `create_skill`, `update_skill`, `delete_skill`, `get_skill`, `list_skills`, `search_skills`, `link_skill`, `create_skill_link`, `delete_skill_link`, `find_linked_skills`, `add_skill_attachment`, `remove_skill_attachment`, `recall_skills`, `bump_skill_usage`

Docs tools are only registered when `docsPattern` is set.
Code tools are only registered when `codePattern` is set.
File index tools, knowledge tools, task tools, and skill tools are always registered.

## Commands

```bash
npm run build          # tsc → dist/
npm run dev            # tsc --watch
npm run cli:dev        # tsx src/cli/index.ts (no build needed)
```

Run tests with Jest:
```bash
npm test                               # run all tests (1116 tests across 24 suites)
npm test -- --testPathPatterns=search   # run a specific test file
npm run test:watch                     # watch mode
npx tsx src/tests/embedder.test.ts     # embedding model (loads real model — slow, excluded from Jest)
npx tsx src/tests/parser.debug.ts      # debug script, no assertions
```

Test suites:
- `mcp-docs.test.ts` — MCP docs tools integration (list_topics, get_toc, search, get_node, search_topic_files)
- `mcp-code.test.ts` — MCP code tools integration (list_files, get_file_symbols, search_code, get_symbol, search_files)
- `mcp-knowledge.test.ts` — MCP knowledge tools integration (CRUD notes + relations + search + cross-graph links)
- `mcp-codeblocks.test.ts` — MCP code block tools integration (find_examples, search_snippets, list_snippets, explain_symbol, cross_references)
- `knowledge-graph.test.ts` — knowledge graph CRUD + search + cross-graph proxy unit test
- `search.test.ts` — docs BFS+cosine search unit test
- `graph.test.ts` — docs graph CRUD unit test
- `code-graph.test.ts` — code graph CRUD unit test
- `code-parser.test.ts` — ts-morph AST parser unit test
- `codeblock-parser.test.ts` — code block extraction + symbol extraction
- `file-index-graph.test.ts` — file index graph CRUD + directory chain + search unit test
- `mcp-file-index.test.ts` — MCP file index tools integration (list_all_files, search_all_files, get_file_info + cross-graph links to files)
- `task-graph.test.ts` — task graph CRUD + search + cross-graph proxy + persistence unit test
- `mcp-tasks.test.ts` — MCP task tools integration (CRUD tasks + relations + search + cross-graph links)
- `skill-graph.test.ts` — skill graph CRUD + search + cross-graph proxy + persistence unit test
- `mcp-skills.test.ts` — MCP skill tools integration (CRUD skills + relations + search + cross-graph links)
- `watcher.test.ts` — chokidar watcher unit test
- `multi-config.test.ts` — YAML multi-config parsing + Zod validation unit test
- `promise-queue.test.ts` — PromiseQueue serial execution unit test
- `rest-api.test.ts` — REST API integration (Express routes, Zod validation, CRUD)
- `file-mirror.test.ts` — frontmatter serialization + file mirror helpers + manager integration
- `file-import.test.ts` — reverse import parsing (parseNoteFile, parseTaskFile, diffRelations)
- `mirror-watcher.test.ts` — MirrorWriteTracker + importFromFile/deleteFromFile integration + round-trip tests

CLI commands (after build) — all require `--config graph-memory.yaml`:
```bash
# Multi-project HTTP server (primary mode — REST API + MCP + UI + WebSocket)
node dist/cli/index.js serve --config graph-memory.yaml

# Single-project stdio (for MCP clients like Claude Desktop)
node dist/cli/index.js mcp --config graph-memory.yaml --project my-app

# Index one project and exit
node dist/cli/index.js index --config graph-memory.yaml --project my-app

# Force re-index from scratch (discard persisted graphs)
node dist/cli/index.js serve --config graph-memory.yaml --reindex
node dist/cli/index.js mcp --config graph-memory.yaml --project my-app --reindex
node dist/cli/index.js index --config graph-memory.yaml --reindex
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed breakdown with diagrams.

```
src/
  graphs/            # graph data layer — CRUD, persistence, manager classes (unified API)
    manager-types.ts # GraphManagerContext, ExternalGraphs, EmbedFn, noopContext, resolveExternalGraph
    docs.ts          # DocGraph CRUD + persistence + DocGraphManager class
    code.ts          # CodeGraph CRUD + persistence + CodeGraphManager class
    code-types.ts    # CodeNodeKind, CodeNodeAttributes, CodeEdgeKind, CodeGraph
    knowledge.ts     # KnowledgeGraph CRUD + persistence + KnowledgeGraphManager class
    knowledge-types.ts # KnowledgeNodeAttributes, KnowledgeEdgeAttributes, KnowledgeGraph, slugify
    file-index.ts    # FileIndexGraph CRUD + persistence + FileIndexGraphManager class
    file-index-types.ts # FileIndexNodeAttributes, FileIndexEdgeAttributes, FileIndexGraph
    file-lang.ts     # extension→language lookup map + MIME via `mime` library
    attachment-types.ts # AttachmentMeta interface + scanAttachments() helper
    task.ts          # TaskGraph CRUD + persistence + TaskGraphManager class
    task-types.ts    # TaskNodeAttributes, TaskEdgeAttributes, TaskGraph, TaskStatus, TaskPriority
    skill.ts         # SkillGraph CRUD + persistence + SkillGraphManager class
    skill-types.ts   # SkillNodeAttributes, SkillEdgeAttributes, SkillGraph, SkillSource
  lib/               # core logic — no side effects, importable independently
    multi-config.ts  # YAML multi-project config parsing + Zod validation
    project-manager.ts # ProjectManager: multi-project lifecycle (add/remove/save/shutdown)
    promise-queue.ts # PromiseQueue: serial Promise chain for mutation serialization
    embedder.ts      # named model registry with dedup; embed(title, content, modelName?) + embedBatch(inputs, modelName?)
    watcher.ts       # chokidar wrapper: startWatcher()
    frontmatter.ts   # serializeMarkdown/parseMarkdown — YAML frontmatter + markdown body
    file-mirror.ts   # writeNoteFile/writeTaskFile/writeSkillFile/deleteMirrorDir + attachment helpers — file mirror for .notes/, .tasks/, and .skills/
    file-import.ts   # parseNoteFile/parseTaskFile/parseSkillFile/diffRelations — reverse import from mirror files
    parsers/
      docs.ts        # markdown → Chunk[] (Chunk type defined here); extracts fenced code blocks as child chunks
      code.ts        # ts-morph → ParsedFile (nodes + typed edges)
      codeblock.ts   # extractSymbols() — ts-morph symbol extraction from code block text
    search/
      bm25.ts        # BM25Index class, tokenizer, Reciprocal Rank Fusion (RRF)
      docs.ts        # Hybrid (BM25+vector) search over DocGraph
      code.ts        # Hybrid search over CodeGraph
      files.ts       # cosine file-level search (searchDocFiles, searchCodeFiles)
      file-index.ts  # cosine search over FileIndexGraph (file nodes only)
      knowledge.ts   # Hybrid search over KnowledgeGraph
      tasks.ts       # Hybrid search over TaskGraph
      skills.ts      # Hybrid search over SkillGraph
  cli/
    index.ts         # Commander CLI — 'index', 'mcp', and 'serve' commands
    indexer.ts       # unified ProjectIndexer: one walk, three serial queues (docs, code, file index)
  api/
    index.ts         # createMcpServer() + startStdioServer() + startHttpServer() + startMultiProjectHttpServer()
    rest/
      index.ts       # Express app factory, CORS, JSON body parsing, SPA fallback, error handler
      validation.ts  # Zod schemas + validation middleware for all endpoints
      knowledge.ts   # Knowledge CRUD REST routes
      tasks.ts       # Task CRUD REST routes
      skills.ts      # Skills CRUD REST routes
      docs.ts        # Docs search REST routes
      code.ts        # Code search REST routes
      files.ts       # Files REST routes
      graph.ts       # Graph export endpoint (for UI visualization)
      tools.ts       # Tools explorer REST routes (list, get, call MCP tools via HTTP)
      websocket.ts   # WebSocket server for real-time push to UI
    tools/
      docs/          # list-topics.ts, get-toc.ts, search.ts, get-node.ts, search-files.ts, find-examples.ts, search-snippets.ts, list-snippets.ts, explain-symbol.ts, cross-references.ts
      code/          # list-files.ts, get-file-symbols.ts, search-code.ts, get-symbol.ts, search-files.ts
      file-index/    # list-all-files.ts, search-all-files.ts, get-file-info.ts
      knowledge/     # create-note.ts, update-note.ts, delete-note.ts, get-note.ts, list-notes.ts, search-notes.ts, create-relation.ts, delete-relation.ts, list-relations.ts, find-linked-notes.ts, add-attachment.ts, remove-attachment.ts
      tasks/         # create-task.ts, update-task.ts, delete-task.ts, get-task.ts, list-tasks.ts, search-tasks.ts, move-task.ts, link-task.ts, create-task-link.ts, delete-task-link.ts, find-linked-tasks.ts, add-attachment.ts, remove-attachment.ts
      skills/        # create-skill.ts, update-skill.ts, delete-skill.ts, get-skill.ts, list-skills.ts, search-skills.ts, link-skill.ts, create-skill-link.ts, delete-skill-link.ts, find-linked-skills.ts, add-attachment.ts, remove-attachment.ts, recall-skills.ts, bump-skill-usage.ts
  tests/
    *.test.ts        # Jest test suites (1116 tests across 24 suites)
    helpers.ts       # shared test utilities (unitVec, fakeEmbed, setupMcpClient, text/json)
    __mocks__/       # Jest mocks for ESM-only packages (chokidar, @xenova/transformers, mime)
    fixtures/
      *.md           # markdown fixtures for docs tests
      code/          # TypeScript fixtures for code-parser tests
        tsconfig.json  # moduleResolution: bundler — enables import edge resolution
ui/                  # React web UI (Feature-Sliced Design)
  src/
    app/             # App.tsx (routes), theme.ts, styles.css
    pages/           # dashboard, knowledge, tasks, skills, docs, files, prompts, search, graph, tools, help
    widgets/         # layout (sidebar + project selector + theme toggle)
    features/        # note-crud, task-crud, skill-crud
    entities/        # project, note, task, skill, file, doc, code, graph
    shared/          # api/client.ts, lib/useWebSocket.ts, lib/ThemeModeContext.tsx
    content/         # help articles + prompt templates (markdown) bundled into the UI
demo-project/        # Demo "TaskFlow" project for testing and demonstration
  src/               # 18 TypeScript files (models, services, controllers, middleware, utils)
  docs/              # 11 markdown docs (architecture, API, guides, changelog)
  scripts/seed.sh    # Seeds 15 notes + 20 tasks + 10 skills + relations via REST API
  tsconfig.json      # TypeScript config for ts-morph code indexing
```

## Key design decisions

- **CommonJS** (`module: "CommonJS"` in tsconfig): no `.js` extensions in imports
- **Graph manager classes**: each graph has a Manager class (`DocGraphManager`,
  `CodeGraphManager`, `FileIndexGraphManager`, `KnowledgeGraphManager`,
  `TaskGraphManager`, `SkillGraphManager`) that serves as the unified API for all operations (read and
  write). Managers encapsulate embedding, cross-graph cleanup, dirty marking, and
  event emission. MCP tools and REST handlers are thin adapters calling manager
  methods. Managers live in `src/graphs/` alongside the pure CRUD functions they wrap.
  `GraphManagerContext` provides `markDirty()`, `emit()`, and optional `projectDir` for
  file mirroring; `noopContext()` is used in tests (no file I/O without `projectDir`)
- **Six graphs**: `DocGraph` (markdown chunks), `CodeGraph` (AST symbols),
  `KnowledgeGraph` (user/LLM-created facts and notes with typed relations),
  `FileIndexGraph` (all project files and directories with metadata),
  `TaskGraph` (task tracking with status, priority, due dates, estimates), and
  `SkillGraph` (reusable recipes/procedures with steps, triggers, and usage tracking); stored
  as `docs.json`, `code.json`, `knowledge.json`, `file-index.json`, `tasks.json`, and `skills.json` in the `graphMemory` directory
- **Unified indexer**: `ProjectIndexer` does one `chokidar` walk of `projectDir` with `**/*`,
  dispatches each file to the docs, code, and/or file index serial queue via micromatch pattern matching
- **Three serial queues**: docs, code, and file index each have an independent Promise chain;
  docs and code queues use `embedBatch()` to embed all chunks/symbols per file in one forward
  pass; file index queue embeds one file path at a time via `embed()`
- **Doc graph node IDs**: `"fileId"` for file root, `"fileId::Title"` for sections,
  `"fileId::Title::2"` for duplicate headings
- **Code graph node IDs**: `"fileId"` for file root, `"fileId::Name"` for top-level symbols,
  `"fileId::Class::method"` for methods
- **Code block extraction**: fenced code blocks (` ```lang ... ``` `) in markdown are extracted
  as child chunks with `language` and `symbols` fields; TS/JS/TSX/JSX blocks are parsed with
  ts-morph (virtual source file, `useInMemoryFileSystem`) to extract top-level symbol names;
  other languages or parse failures → `symbols = []`; untagged blocks → `language = undefined`;
  code block chunk IDs: `"fileId::Section::code-1"`; level = parent level + 1
- **Doc graph edges**: sibling (chunk→next chunk in same file) + cross-file link
  (chunk→target file root when a markdown `[text](./other.md)` link exists)
- **Code graph edges**: `contains` (file→symbol, class→method), `imports` (file→imported file
  resolved by ts-morph), `extends` (class→base class), `implements` (class→interface)
- **Dangling edges**: `updateCodeFile` skips cross-file edges whose target is not yet indexed;
  re-indexing the source file will re-attempt them, but re-indexing the target alone does not
  restore edges from other files (those files must be re-indexed)
- **ts-morph**: shared `Project` instance via `getProject(codeDir, tsconfig?)`; tries to load
  `tsconfig.json` from `codeDir`, falls back to minimal options with `skipFileDependencyResolution: true`
  (import edges disabled in fallback mode); `resetProject()` clears between test runs
- **Knowledge graph**: CRUD-only graph (no file indexing); notes have title, content, tags,
  embedding; slug IDs from title (`my-fact`, dedup `::2`, `::3`); free-form edge kinds
  (e.g. `relates_to`, `depends_on`); embedded at create/update time via `title + content`;
  search uses BFS+cosine like docs/code graphs; supports file attachments stored in
  `.notes/{id}/` directory alongside `note.md`; **file mirror**: every create/update/delete
  writes a `.notes/{id}/note.md` file (markdown with YAML frontmatter — tags, timestamps, relations)
- **File index graph**: indexes ALL project files (not just docs/code pattern-matched); nodes for
  both files and directories with `contains` edges (dir→child); language detection from
  extension lookup map in `file-lang.ts`, MIME detection via `mime` npm library; file nodes have path embeddings for semantic
  search, directory nodes have empty embeddings; `rebuildDirectoryStats()` computes aggregate
  `size` and `fileCount` on directory nodes after scan
- **Task graph**: CRUD-only graph (no file indexing, like KnowledgeGraph); tasks have title,
  description, status (kanban), priority, tags, dueDate, estimate, completedAt; slug IDs from
  title (shared `slugify` with generalized `{ hasNode }` interface); task↔task edges:
  `subtask_of`, `blocks`, `related_to`; `move_task` auto-manages `completedAt` (sets on
  done/cancelled, clears on reopen); `get_task` enriches with subtasks/blockedBy/blocks/related;
  `list_tasks` sorts by priority order (critical=0→low=3) then dueDate ascending (nulls last);
  TaskGraph has its own cross-graph proxy system for linking to docs/code/files/knowledge;
  supports file attachments stored in `.tasks/{id}/` directory alongside `task.md`;
  **file mirror**: every create/update/delete/move writes a `.tasks/{id}/task.md` file (markdown
  with YAML frontmatter — status, priority, tags, dueDate, estimate, timestamps, relations)
- **Skill graph**: CRUD-only graph (no file indexing, like KnowledgeGraph/TaskGraph); skills have
  title, description, steps (string[]), triggers (string[]), source (`learned`|`manual`|`imported`),
  tags, usageCount, lastUsedAt; slug IDs from title (shared `slugify`); skill↔skill edges:
  `depends_on`, `related_to`, `variant_of`; `get_skill` enriches with dependsOn/dependedBy/related/variants;
  `recall_skills` uses lower minScore (0.3) for higher recall in task contexts;
  `bump_skill_usage` increments usageCount + sets lastUsedAt; BM25 TextExtractor includes triggers;
  SkillGraph has its own cross-graph proxy system for linking to docs/code/files/knowledge/tasks;
  supports file attachments stored in `.skills/{id}/` directory alongside `skill.md`;
  **file mirror**: every create/update/delete writes a `.skills/{id}/skill.md` file (markdown
  with YAML frontmatter — source, tags, triggers, timestamps, relations)
- **Cross-graph links**: `create_relation` supports `targetGraph: "docs"|"code"|"files"|"tasks"`
  to link a note to a doc chunk, code symbol, file/directory, or task; `create_task_link` supports
  `targetGraph: "docs"|"code"|"files"|"knowledge"` to link a task to external nodes; `create_skill_link`
  supports `targetGraph: "docs"|"code"|"files"|"knowledge"|"tasks"` to link a skill to external nodes; all
  implemented via phantom proxy nodes (ID format: `@docs::guide.md::Setup`, `@code::auth.ts::Foo`,
  `@files::src/config.ts`, `@tasks::my-task`, `@knowledge::my-note`, `@skills::add-rest-endpoint`); proxy nodes have empty
  embeddings and are excluded from list/get/search; orphaned proxies are cleaned up on delete
  and by the indexer when files are removed (`cleanupProxies`)
- **Cross-graph tools**: `cross_references` is the only tool that requires both `docGraph` and
  `codeGraph`; registered only when both are available; bridges definitions (code) ↔ examples (docs)
- **Graph persistence**: graphology `export()`/`import()` serialized as JSON with embedding
  model metadata; filenames: `docs.json`, `code.json`, `knowledge.json`, `file-index.json`,
  `tasks.json`, and `skills.json` in `graphMemory` directory. Each JSON file wraps the
  graphology export with `{ embeddingModel: "...", graph: {...} }`. On load, if the configured
  model differs from the stored model, the graph is automatically discarded and re-indexed
- **File mirror (write)**: `KnowledgeGraphManager`, `TaskGraphManager`, and `SkillGraphManager` write markdown files to
  `{projectDir}/.notes/{id}/note.md`, `{projectDir}/.tasks/{id}/task.md`, and `{projectDir}/.skills/{id}/skill.md` on every mutation.
  Files use YAML frontmatter (id, tags, timestamps, relations) + markdown body (`# Title\n\nContent`).
  Relation entries only include outgoing edges. File I/O is synchronous (`writeFileSync`),
  wrapped in try/catch (errors logged to stderr, never thrown). `projectDir` in
  `GraphManagerContext` is optional — when absent (tests, `noopContext()`), no files are written
- **Attachments**: notes, tasks, and skills support file attachments stored alongside their mirror files
  in `.notes/{id}/`, `.tasks/{id}/`, and `.skills/{id}/` directories. `AttachmentMeta` (filename, mimeType, size,
  addedAt) is built by `scanAttachments()` which scans the directory excluding the markdown file.
  Managers provide `addAttachment()`, `removeAttachment()`, `syncAttachments()`, `listAttachments()`.
  REST API supports multipart upload, download, list, and delete. MCP tools: `add_note_attachment`,
  `remove_note_attachment`, `add_task_attachment`, `remove_task_attachment`, `add_skill_attachment`,
  `remove_skill_attachment`
- **Reverse import (read)**: A separate chokidar watcher on `.notes/`, `.tasks/`, and `.skills/` detects
  external file edits (e.g. from IDE) and syncs them back to the graph. `MirrorWriteTracker`
  prevents feedback loops by comparing file mtime after our own writes. On startup,
  `scanMirrorDirs()` imports any files newer than the graph's `updatedAt`. Manager methods
  `importFromFile()` and `deleteFromFile()` update the graph without re-writing the mirror
  file. Relation changes in frontmatter are diffed and applied via `diffRelations()`
- **Embeddings**: default model `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers`; L2-normalized,
  cosine similarity = dot product; empty `[]` means not yet embedded; named model registry in
  `embedder.ts` with `Map<string, Pipeline>` keyed by name and dedup by model string (same
  model loaded only once); `embed(title, content, modelName?)` for single items,
  `embedBatch(inputs, modelName?)` for batch; per-graph models configured via `docsModel`,
  `codeModel`, etc. with fallback to `embeddingModel`; `createMcpServer` accepts
  `EmbedFn | Partial<EmbedFnMap>` — single function for tests, per-graph map for CLI;
  indexer passes model names (`docsModelName`, `codeModelName`, `filesModelName`) to
  embed/embedBatch calls
- **File-level embeddings**: `fileEmbedding` field on root nodes (doc level=1, code kind=`file`);
  code embeds file path only, docs embed file path + h1 title; used by `search_files`/`search_topic_files`
  (simple cosine similarity, no BFS); `minScore` default 0.3, `topK` default 10
- **Hybrid search**: all BFS-based search modules use BM25 keyword search + vector cosine
  similarity, fused via Reciprocal Rank Fusion (RRF). `BM25Index` class in `src/lib/search/bm25.ts`
  is maintained incrementally by each graph manager (add/remove/update on CRUD). Tokenizer
  splits whitespace, punctuation, and camelCase (`getUserById` → `[get, user, by, id]`).
  `searchMode` parameter: `hybrid` (default), `vector` (embedding only), `keyword` (BM25 only).
  RRF formula: `score(d) = 1/(k+rank_vector) + 1/(k+rank_bm25)`, k=60 default
- **`minScore` default**: 0.5 for docs/code node search; 0.3 for file-level search
- **`bfsDecay` default 0.8**: each BFS hop multiplies score by 0.8; used to prune early
- **HTTP transport**: multi-project HTTP server at `/mcp/{projectId}` using
  `StreamableHTTPServerTransport` from MCP SDK; each HTTP session gets its own
  `McpServer` + transport pair but all share the same graph instances via `ProjectManager`;
  session map keyed by `randomUUID()`; idle sessions swept every 60s (default timeout 30 min
  via `sessionTimeout`); stdio remains default transport for single-project mode
- **Multi-project**: `ProjectManager` manages multiple projects from a single process.
  Each project has its own 6 graphs, embedFns, indexer, watcher, and mutation queue.
  YAML config hot-reload (add/remove/change projects without restart). Auto-save every 30s.
  `PromiseQueue` serializes mutation tool handlers per project to prevent race conditions
- **REST API**: Express app on the same HTTP server (`/api/*`). CRUD endpoints for knowledge,
  tasks, and skills; search endpoints for docs/code/files; graph export for visualization; tools
  explorer (list/get/call MCP tools via HTTP). Zod validation on all request bodies and
  query params. Response format: `{ results: [...] }` for lists, direct object for singles,
  204 for DELETEs
- **WebSocket**: `/api/ws` for real-time push to UI. Events: `note:created|updated|deleted`,
  `task:created|updated|deleted|moved`, `note:attachment:added|deleted`,
  `task:attachment:added|deleted`, `skill:created|updated|deleted`,
  `skill:attachment:added|deleted`, `graph:updated`. Single endpoint, all projects —
  UI filters by current `projectId` client-side
- **Web UI**: React 19 + Vite + MUI 7 in `ui/` directory. Feature-Sliced Design architecture.
  Pages: Dashboard (stats + recent activity), Knowledge (notes CRUD), Tasks (kanban board
  with configurable column visibility, drag-drop with drop-zone highlights, inline creation,
  filter bar, due date/estimate badges, quick actions on hover, scrollable columns),
  Skills (skill/recipe management with triggers and usage tracking),
  Docs (browse indexed documentation), Files (browser),
  Prompts (AI prompt generator with scenarios, roles, styles, live preview, export as skill),
  Search (cross-graph),
  Graph (cytoscape.js visualization), Tools (MCP tools explorer with live execution),
  Help (built-in searchable documentation). Light/dark theme toggle. Built output served as
  static files from HTTP server with SPA fallback. Dev server: Vite on :5173, proxies `/api` to :3000
- **`--reindex` flag**: all three CLI commands (`index`, `mcp`, `serve`) support `--reindex`
  to discard persisted graphs and re-create them from scratch. When set, `load*()` functions
  return fresh empty graphs (skip disk read), and the indexer re-indexes all files since
  no mtime data exists in the fresh graphs
- **Docker**: multi-stage Dockerfile (node:24-alpine). Build stage: `npm run build` (server + UI).
  Runtime stage: production deps + dist/ + ui/dist/. Entry: `node dist/cli/index.js serve`.
  Three volume mounts: `/data/config/graph-memory.yaml` (config), `/data/projects/` (project dirs),
  `/data/models/` (embedding model cache). GitHub Actions workflow builds and pushes to
  `ghcr.io/prih/mcp-graph-memory` on push to `main` or version tags

## Configuration

All configuration is via `graph-memory.yaml` (multi-project YAML). See `graph-memory.yaml.example` for full reference.

**Server settings** (`server:`): `host`, `port`, `sessionTimeout`, `modelsDir`, `embeddingModel`

**Per-project settings** (`projects.<id>:`): `projectDir` (required), `graphMemory`, `docsPattern`, `codePattern`, `excludePattern`, `tsconfig`, `embeddingModel`, `docsModel`, `codeModel`, `knowledgeModel`, `taskModel`, `filesModel`, `skillsModel`, `chunkDepth`, `maxTokensDefault`, `embedMaxChars`

## Conventions

- TypeScript strict mode — no implicit `any`, no unused vars/params
- Error handling: `.catch()` with `process.stderr.write` + `process.exit(1)` for fatal CLI errors
- Async errors in the indexer queue are logged to stderr but do not stop the queue (intentional)
- Tests use Jest with ts-jest; ESM-only deps (`@xenova/transformers`, `chokidar`, `mime`) mocked via `moduleNameMapper`
- MCP tests use `InMemoryTransport.createLinkedPair()` + fake unit-vector embeddings — no model loading
- `embedder.test.ts` loads a real model (slow) — excluded from Jest, run with `npx tsx`
- `parser.debug.ts` is a manual debug script (no assertions), not part of the test suite
