# CLI Commands

All commands require `--config graph-memory.yaml`.

```bash
graphmemory <command> --config graph-memory.yaml [options]
```

## `serve` — multi-project HTTP server

Primary mode. Starts HTTP server with MCP endpoints, REST API, web UI, and WebSocket.

```bash
graphmemory serve --config graph-memory.yaml [--host <addr>] [--port <n>] [--reindex]
```

### Startup sequence

1. Load YAML config, create `ProjectManager`
2. Add all projects (load graphs from disk, or fresh if `--reindex`)
3. Start HTTP server (MCP + REST API + static UI + WebSocket)
4. Validate `jwtSecret` if users are configured (warns if missing)
5. Start auto-save (30s interval for dirty projects)
6. Background: per project — load embedding models → start indexing
7. Watch YAML for hot-reload (add/remove/change projects without restart)
8. Handle `SIGINT`/`SIGTERM`: shutdown all projects gracefully

### Endpoints

| Path | Description |
|------|-------------|
| `/` | Web UI (static files from `ui/dist/`) |
| `/mcp/{projectId}` | MCP HTTP endpoint |
| `/api/*` | REST API |
| `/api/ws` | WebSocket |

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | (required) | Path to `graph-memory.yaml` |
| `--host` | from config or `127.0.0.1` | Bind address |
| `--port` | from config or `3000` | Port |
| `--reindex` | `false` | Discard persisted graphs, re-index from scratch |

## `mcp` — single-project stdio

For MCP clients like Claude Desktop, Cursor, Windsurf.

```bash
graphmemory mcp --config graph-memory.yaml --project my-app [--reindex]
```

### Startup sequence

1. Load existing graphs from disk (or fresh if `--reindex`)
2. Start MCP server on stdio **immediately** (available with persisted data)
3. Background: load embedding model → start file watcher → run initial scan
4. After scan completes: save updated graphs
5. Handle `SIGINT`/`SIGTERM`: drain queue, save graphs, exit

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | (required) | Path to `graph-memory.yaml` |
| `--project` | (required) | Project ID from config |
| `--reindex` | `false` | Discard persisted graphs |

## `index` — one-shot scan

Indexes a project and exits. Useful for CI/CD or as a pre-start step.

```bash
graphmemory index --config graph-memory.yaml --project my-app [--reindex]
```

### Startup sequence

1. Load graphs from disk (or fresh if `--reindex`) + load embedding models
2. Run `scan()` + `drain()` (walks directory, embeds all files)
3. Save all graphs to disk, exit

### Options

Same as `mcp` command.

## `users add` — add a user

Interactive command to add a user to the config file.

```bash
graphmemory users add --config graph-memory.yaml
```

### Interactive prompts

1. **User ID** — alphanumeric identifier (e.g. `alice`)
2. **Name** — display name
3. **Email** — for UI login
4. **Password** — hidden input, with confirmation

### What it does

- Hashes the password with scrypt (`$scrypt$N$r$p$salt$hash`)
- Generates a random API key (`mgm-{random base64url}`)
- Writes the user block into `graph-memory.yaml` (finds existing `users:` section or creates new one)
- Validates the config after writing

## `--reindex` flag

All three main commands (`index`, `mcp`, `serve`) support `--reindex`:

- Discards persisted graph JSON files
- Creates fresh empty graphs
- Re-indexes all files from scratch

### Automatic re-index on model change

Each graph JSON file stores the embedding model fingerprint (model + pooling + normalize + dtype + documentPrefix). On load, if the configured model differs from the stored model, the graph is automatically discarded and re-indexed — no `--reindex` needed.

## MCP client configuration

### HTTP transport (recommended)

The primary connection method. Start the server with `serve`, then connect MCP clients to `http://localhost:3000/mcp/{projectId}`.

**Claude Desktop** — add via **Settings > Connectors** in the app, enter the URL:

```
http://localhost:3000/mcp/my-app
```

**Claude Code** — run in your project directory:

```bash
claude mcp add --transport http --scope project graph-memory http://localhost:3000/mcp/my-app
```

Or add to `.mcp.json` manually:

```json
{
  "mcpServers": {
    "graph-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp/my-app"
    }
  }
}
```

**Cursor / Windsurf / other clients** — enter the MCP URL directly in settings:

```
http://localhost:3000/mcp/my-app
```

Multiple clients can connect to the same server simultaneously. Each session gets its own MCP instance but shares graph data.

### stdio transport (debugging / single project)

The `mcp` command runs a single-project MCP server over stdin/stdout. Primarily useful for debugging or testing a single project without starting the full HTTP server.

```bash
graphmemory mcp --config graph-memory.yaml --project my-app
```

The MCP client launches this as a subprocess. No web UI, no REST API, no WebSocket — just the MCP tool interface over stdio.

For most use cases, prefer the HTTP transport above — it provides the full feature set (multi-project, web UI, REST API, real-time updates) and supports multiple concurrent clients.

## Development commands

```bash
npm run build          # Build server + UI → dist/
npm run build:server   # Build server only
npm run build:ui       # Build UI only
npm run dev            # tsc --watch (server)
npm run cli:dev        # tsx src/cli/index.ts (run without build)
npm test               # Run all tests
npm run test:watch     # Watch mode
```
