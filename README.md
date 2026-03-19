# graphmemory

An MCP server that builds a **semantic graph memory** from a project directory.
Indexes markdown docs, TypeScript/JavaScript source code, and all project files into six graph structures,
then exposes them as **58 MCP tools** + **REST API** + **Web UI**.

## Quick start

### Docker (recommended)

```bash
# 1. Create graph-memory.yaml
cat > graph-memory.yaml << 'EOF'
server:
  host: "0.0.0.0"
  port: 3000
  modelsDir: "/data/models"

projects:
  my-app:
    projectDir: "/data/projects/my-app"
EOF

# 2. Run
docker run -d \
  --name graph-memory \
  -p 3000:3000 \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app:ro \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server
```

Open http://localhost:3000 — the web UI is ready. The embedding model (~560 MB) downloads on first startup.

### npm

```bash
npm install -g @graphmemory/server
graphmemory serve --config graph-memory.yaml
```

### From source

```bash
git clone https://github.com/graph-memory/graphmemory.git
cd graphmemory
npm install && cd ui && npm install && cd ..
npm run build
node dist/cli/index.js serve --config graph-memory.yaml
```

## Connect an MCP client

Start the server, then connect MCP clients to `http://localhost:3000/mcp/{projectId}`.

**Claude Desktop** — add via **Settings > Connectors** in the app, enter the URL:

```
http://localhost:3000/mcp/my-app
```

**Claude Code** — in `.mcp.json` at project root:

```json
{
  "mcpServers": {
    "project-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp/my-app"
    }
  }
}
```

**Cursor / Windsurf / other clients** — enter the URL directly in settings:

```
http://localhost:3000/mcp/my-app
```

See [docs/cli.md](docs/cli.md) for stdio transport and other connection options.

## What it does

| Feature | Description |
|---------|-------------|
| **Docs indexing** | Parses markdown into heading-based chunks with cross-file links and code block extraction |
| **Code indexing** | Extracts AST symbols (functions, classes, interfaces) via tree-sitter |
| **File index** | Indexes all project files with metadata, language detection, directory hierarchy |
| **Knowledge graph** | Persistent notes and facts with typed relations and cross-graph links |
| **Task management** | Kanban workflow with priorities, assignees, and cross-graph context |
| **Skills** | Reusable recipes with steps, triggers, and usage tracking |
| **Hybrid search** | BM25 keyword + vector cosine similarity with BFS graph expansion |
| **Real-time** | File watching + WebSocket push to UI |
| **Multi-project** | One process manages multiple projects with YAML hot-reload |
| **Workspaces** | Share knowledge/tasks/skills across related projects |
| **Auth & ACL** | Password login (JWT), API keys, 4-level access control |

## 58 MCP tools

| Group | Tools |
|-------|-------|
| **Context** | `get_context` |
| **Docs** | `list_topics`, `get_toc`, `search`, `get_node`, `search_topic_files` |
| **Code blocks** | `find_examples`, `search_snippets`, `list_snippets`, `explain_symbol` |
| **Cross-graph** | `cross_references` |
| **Code** | `list_files`, `get_file_symbols`, `search_code`, `get_symbol`, `search_files` |
| **Files** | `list_all_files`, `search_all_files`, `get_file_info` |
| **Knowledge** | `create_note`, `update_note`, `delete_note`, `get_note`, `list_notes`, `search_notes`, `create_relation`, `delete_relation`, `list_relations`, `find_linked_notes`, `add_note_attachment`, `remove_note_attachment` |
| **Tasks** | `create_task`, `update_task`, `delete_task`, `get_task`, `list_tasks`, `search_tasks`, `move_task`, `link_task`, `create_task_link`, `delete_task_link`, `find_linked_tasks`, `add_task_attachment`, `remove_task_attachment` |
| **Skills** | `create_skill`, `update_skill`, `delete_skill`, `get_skill`, `list_skills`, `search_skills`, `recall_skills`, `bump_skill_usage`, `link_skill`, `create_skill_link`, `delete_skill_link`, `find_linked_skills`, `add_skill_attachment`, `remove_skill_attachment` |

## Web UI

Dashboard, Knowledge (notes CRUD), Tasks (kanban board with drag-drop), Skills (recipes),
Docs browser, Files browser, Prompts (AI prompt generator), Search (cross-graph),
Graph (Cytoscape.js visualization), Tools (MCP explorer), Help.

Light/dark theme. Real-time WebSocket updates. Login page when auth is configured.

## Configuration

All configuration via `graph-memory.yaml`. Only `projects.<id>.projectDir` is required:

```yaml
server:
  host: "127.0.0.1"
  port: 3000
  embedding:
    model: "Xenova/bge-m3"

projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphs:
      docs:
        include: "**/*.md"               # default
      code:
        include: "**/*.{js,ts,jsx,tsx}"  # default
      skills:
        enabled: false
```

See [docs/configuration.md](docs/configuration.md) for full reference and [graph-memory.yaml.example](graph-memory.yaml.example) for all options.

## Authentication

```yaml
users:
  alice:
    name: "Alice"
    email: "alice@example.com"
    apiKey: "mgm-key-abc123"
    passwordHash: "$scrypt$..."   # generated by: graphmemory users add

server:
  jwtSecret: "your-secret"
  defaultAccess: rw
```

- **UI login**: email + password → JWT cookies (httpOnly, SameSite=Strict)
- **API access**: `Authorization: Bearer <apiKey>`
- **ACL**: graph > project > workspace > server > defaultAccess (`deny` / `r` / `rw`)

See [docs/authentication.md](docs/authentication.md).

## Docker Compose

```yaml
services:
  graph-memory:
    image: ghcr.io/graph-memory/graphmemory-server
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

See [docs/docker.md](docs/docker.md).

## Development

```bash
npm run dev              # tsc --watch (backend)
cd ui && npm run dev     # Vite on :5173, proxies /api → :3000
npm test                 # 1240 tests across 28 suites
```

## Documentation

Full documentation is in [docs/](docs/README.md):

- **Concepts**: [docs indexing](docs/concepts-docs-indexing.md), [code indexing](docs/concepts-code-indexing.md), [tasks](docs/concepts-tasks.md), [skills](docs/concepts-skills.md), [knowledge](docs/concepts-knowledge.md), [file index](docs/concepts-file-index.md)
- **Architecture**: [system architecture](docs/architecture.md), [graphs overview](docs/graphs-overview.md), [search algorithms](docs/search.md), [embeddings](docs/embeddings.md)
- **API**: [REST API](docs/api-rest.md), [MCP tools guide](docs/mcp-tools-guide.md), [WebSocket](docs/api-websocket.md)
- **Operations**: [CLI](docs/cli.md), [configuration](docs/configuration.md), [Docker](docs/docker.md), [npm](docs/npm-package.md)
- **Security**: [authentication](docs/authentication.md), [security](docs/security.md)
- **UI**: [architecture](docs/ui-architecture.md), [features](docs/ui-features.md), [patterns](docs/ui-patterns.md)
- **Development**: [testing](docs/testing.md), [API patterns](docs/api-patterns.md)

## License

ISC
