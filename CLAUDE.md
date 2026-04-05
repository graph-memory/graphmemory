# CLAUDE.md

## Project overview

MCP server that builds a semantic graph memory from a project directory — indexing
markdown docs, TypeScript/JavaScript source code, and all project files into seven
stores (docs, code, files, knowledge, tasks, epics, skills). Exposes 70 MCP tools + REST API + Web UI.

**Full documentation**: see [docs/](docs/README.md)

## Commands

```bash
npm run build          # tsc → dist/ (server + UI)
npm run dev            # tsc --watch
npm run cli:dev        # tsx src/cli/index.ts (no build needed)
```

Run tests:
```bash
npm test                               # all tests
npm test -- --testPathPatterns=search   # specific test file
npm run test:watch                     # watch mode
npx tsx src/tests/embedder.test.ts     # real model test (slow, excluded from Jest)
```

CLI commands (after build):
```bash
node dist/cli/index.js serve                                         # zero-config: cwd as project
node dist/cli/index.js serve --config graph-memory.yaml              # multi-project HTTP server
node dist/cli/index.js index --config graph-memory.yaml --project X  # index and exit
node dist/cli/index.js serve --config graph-memory.yaml --reindex    # force re-index
graphmemory users add --config graph-memory.yaml                     # add user interactively
```

## Architecture

SQLite storage layer (better-sqlite3 + sqlite-vec + FTS5): DocsStore, CodeStore, FilesStore, KnowledgeStore, TasksStore, EpicsStore, SkillsStore.
One DB per workspace. StoreManager wraps store lifecycle + project-scoped access.
MCP tools and REST routes are thin adapters over store methods.

See [docs/architecture.md](docs/architecture.md) for diagrams and directory structure.

## Key design decisions

- **CommonJS** (`module: "CommonJS"` in tsconfig)
- **SQLite storage**: better-sqlite3 + sqlite-vec (vector search) + FTS5 (keyword search), one DB per workspace
- **tree-sitter** (web-tree-sitter WASM) for AST parsing — supports TS/JS/TSX/JSX, extensible to other languages
- **Hybrid search**: BM25 keyword + vector cosine, fused via RRF, with BFS graph expansion
- **Three serial queues**: docs, code, file index — independent Promise chains, concurrent with each other
- **Mutation serialization**: `PromiseQueue` per project for write operations (MCP + REST)
- **File mirror**: `.notes/`, `.tasks/`, `.skills/` markdown files with reverse import from IDE
- **Cross-graph links**: phantom proxy nodes (`@docs::`, `@code::`, `@files::`, `@tasks::`, `@knowledge::`, `@skills::`)
- **Auth**: password login (scrypt + JWT cookies) for UI, API keys (Bearer) for programmatic access
- **ACL**: graph > project > workspace > server > defaultAccess

## Configuration

All config via `graph-memory.yaml`. See [docs/configuration.md](docs/configuration.md) for full reference.

## Conventions

- TypeScript strict mode — no implicit `any`, no unused vars/params
- Error handling: `.catch()` with Pino logger + `process.exit(1)` for fatal CLI errors
- Async errors in indexer queue logged via Pino, don't stop the queue
- Logging: Pino with `createLogger('component')` child loggers; pretty by default, `LOG_JSON=1` for JSON
- Tests: Jest + ts-jest; ESM deps mocked via `moduleNameMapper`
- MCP tests: `InMemoryTransport.createLinkedPair()` + fake embeddings
- `embedder.test.ts` loads real model (slow) — excluded from Jest, run with `npx tsx`
