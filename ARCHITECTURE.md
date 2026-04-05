# Architecture

> **Full documentation**: [docs/architecture.md](docs/architecture.md)

```
┌──────────────────────────────────────────────────────────────────────┐
│                              CLI                                     │
│                   src/cli/index.ts (Commander)                       │
│                                                                      │
│   index ──── scan + embed + save + exit                              │
│   serve ──── HTTP server + MCP + REST API + UI + WebSocket           │
│   users ──── user management (add users to config)                   │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                              ▼
     ┌─────────────┐            ┌──────────────────┐
     │ YAML Config │            │ ProjectManager   │
     │ (Zod valid) │            │ (multi-project)  │
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
     │      SQLite Store (better-sqlite3)       │
     │                                          │
     │   DocsStore ────── markdown chunks       │
     │   CodeStore ────── AST symbols           │
     │   FilesStore ───── all project files     │
     │   KnowledgeStore   user notes + facts    │
     │   TasksStore ───── tasks + kanban        │
     │   EpicsStore ───── epic grouping         │
     │   SkillsStore ──── reusable recipes      │
     │                                          │
     │   sqlite-vec (vector) + FTS5 (keyword)   │
     └──────────────────┬───────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
     ┌────────┐   ┌──────────┐   ┌──────────┐
     │  MCP   │   │ REST API │   │    UI    │
     │ Tools  │   │ Express  │   │  React   │
     │ (70)   │   │ + WS     │   │  + Vite  │
     └────────┘   └──────────┘   └──────────┘
```

## Detailed documentation

| Topic | Document |
|-------|----------|
| System architecture | [docs/architecture.md](docs/architecture.md) |
| Configuration | [docs/configuration.md](docs/configuration.md) |
| CLI commands | [docs/cli.md](docs/cli.md) |
| Indexing pipeline | [docs/indexer.md](docs/indexer.md) |
| File watching | [docs/watcher.md](docs/watcher.md) |
| Graph types | [docs/graphs-overview.md](docs/graphs-overview.md) |
| Search algorithms | [docs/search.md](docs/search.md) |
| Embedding system | [docs/embeddings.md](docs/embeddings.md) |
| REST API | [docs/api-rest.md](docs/api-rest.md) |
| MCP tools | [docs/api-mcp.md](docs/api-mcp.md) |
| Authentication | [docs/authentication.md](docs/authentication.md) |
| Security | [docs/security.md](docs/security.md) |
| File mirror | [docs/file-mirror.md](docs/file-mirror.md) |
| UI architecture | [docs/ui-architecture.md](docs/ui-architecture.md) |
| Testing | [docs/testing.md](docs/testing.md) |
