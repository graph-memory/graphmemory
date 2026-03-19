# SPEC.md — mcp-graph-memory

> **Full documentation**: [docs/](docs/README.md)

## What it is

An MCP server that turns a project directory into a queryable semantic knowledge base.
Indexes markdown documentation, TypeScript/JavaScript source code, and all project files
into six interconnected graph structures. Supports multi-project operation, workspaces,
access control, and real-time updates.

## Six graphs

| Graph | Storage | Description |
|-------|---------|-------------|
| **DocGraph** | `docs.json` | Markdown chunks with cross-file links and code block extraction |
| **CodeGraph** | `code.json` | AST symbols (functions, classes, interfaces) via tree-sitter |
| **KnowledgeGraph** | `knowledge.json` | User/LLM-created notes with typed relations |
| **FileIndexGraph** | `file-index.json` | All project files with metadata and directory hierarchy |
| **TaskGraph** | `tasks.json` | Tasks with kanban workflow, priorities, assignees |
| **SkillGraph** | `skills.json` | Reusable recipes with steps, triggers, usage tracking |

See [docs/graphs-overview.md](docs/graphs-overview.md) for data models, node IDs, and edge types.

## 58 MCP tools

| Group | Count | Condition |
|-------|-------|-----------|
| Context | 1 | always |
| Docs + Code blocks + Cross-graph | 10 | docs enabled |
| Code | 5 | code enabled |
| File index | 3 | always |
| Knowledge | 12 | always |
| Tasks | 13 | always |
| Skills | 14 | always |

See [docs/api-mcp.md](docs/api-mcp.md) for schemas and [docs/mcp-tools-guide.md](docs/mcp-tools-guide.md) for usage guide.

## Key features

- **Hybrid search**: BM25 + vector cosine, fused via RRF, BFS graph expansion — [docs/search.md](docs/search.md)
- **Embeddings**: local ONNX (Xenova/bge-m3 default) or remote HTTP proxy — [docs/embeddings.md](docs/embeddings.md)
- **File mirror**: `.notes/`, `.tasks/`, `.skills/` markdown files with reverse import — [docs/file-mirror.md](docs/file-mirror.md)
- **Cross-graph links**: phantom proxy nodes connecting any graph to any graph — [docs/graphs-overview.md](docs/graphs-overview.md)
- **Auth**: password login (JWT cookies) + API keys (Bearer) — [docs/authentication.md](docs/authentication.md)
- **ACL**: 4-level chain (graph → project → workspace → server → default) — [docs/authentication.md](docs/authentication.md)
- **REST API**: Express with Zod validation — [docs/api-rest.md](docs/api-rest.md)
- **WebSocket**: real-time push events — [docs/api-websocket.md](docs/api-websocket.md)
- **Web UI**: React 19 + MUI 7 (FSD architecture) — [docs/ui-architecture.md](docs/ui-architecture.md)
- **Multi-project**: one process, multiple projects, YAML hot-reload — [docs/cli.md](docs/cli.md)
- **Workspaces**: shared knowledge/tasks/skills across projects — [docs/configuration.md](docs/configuration.md)
- **Team**: `.team/` directory for task assignees — [docs/team.md](docs/team.md)
- **Docker**: multi-platform image (amd64 + arm64) — [docs/docker.md](docs/docker.md)

## Configuration

All config via `graph-memory.yaml`. See [docs/configuration.md](docs/configuration.md) and [graph-memory.yaml.example](graph-memory.yaml.example).

## CLI

```bash
mcp-graph-memory serve --config graph-memory.yaml    # HTTP server (primary)
mcp-graph-memory mcp --config graph-memory.yaml -p X # stdio (IDE)
mcp-graph-memory index --config graph-memory.yaml -p X # index + exit
mcp-graph-memory users add --config graph-memory.yaml  # add user
```

See [docs/cli.md](docs/cli.md) for full reference.
