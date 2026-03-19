# CLAUDE.md

## Project overview

MCP server that builds a semantic graph memory from a project directory — indexing
markdown docs, TypeScript/JavaScript source code, and all project files into six
interconnected graphs. Exposes 58 MCP tools + REST API + Web UI.

**Full documentation**: see [docs/](docs/README.md)

## Commands

```bash
npm run build          # tsc → dist/ (server + UI)
npm run dev            # tsc --watch
npm run cli:dev        # tsx src/cli/index.ts (no build needed)
```

Run tests:
```bash
npm test                               # all tests (1240 tests across 28 suites)
npm test -- --testPathPatterns=search   # specific test file
npm run test:watch                     # watch mode
npx tsx src/tests/embedder.test.ts     # real model test (slow, excluded from Jest)
```

CLI commands (after build):
```bash
node dist/cli/index.js serve --config graph-memory.yaml              # multi-project HTTP server
node dist/cli/index.js mcp --config graph-memory.yaml --project X    # single-project stdio
node dist/cli/index.js index --config graph-memory.yaml --project X  # index and exit
node dist/cli/index.js serve --config graph-memory.yaml --reindex    # force re-index
graphmemory users add --config graph-memory.yaml                # add user interactively
```

## Architecture

Six graphs on Graphology: DocGraph, CodeGraph, KnowledgeGraph, FileIndexGraph, TaskGraph, SkillGraph.
Each has a Manager class (unified API for CRUD + search + embedding + events + file mirror).
MCP tools and REST routes are thin adapters over managers.

See [docs/architecture.md](docs/architecture.md) for diagrams and directory structure.

## Key design decisions

- **CommonJS** (`module: "CommonJS"` in tsconfig)
- **Graph managers** encapsulate everything: embed → CRUD → dirty → emit → file mirror → proxy cleanup
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
- Error handling: `.catch()` with `process.stderr.write` + `process.exit(1)` for fatal CLI errors
- Async errors in indexer queue logged to stderr, don't stop the queue
- Tests: Jest + ts-jest; ESM deps mocked via `moduleNameMapper`
- MCP tests: `InMemoryTransport.createLinkedPair()` + fake embeddings
- `embedder.test.ts` loads real model (slow) — excluded from Jest, run with `npx tsx`
