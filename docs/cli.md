# CLI Commands

```bash
graphmemory <command> [options]
```

## `serve` — HTTP server

Primary mode. Starts HTTP server with MCP endpoints, REST API, web UI, and WebSocket.

```bash
# Zero-config: use current directory as a single project
graphmemory serve

# With config file: multi-project, custom settings
graphmemory serve --config graph-memory.yaml
```

When no `--config` is provided and `graph-memory.yaml` is not found, the current directory becomes the project. The project ID is the directory name.

### Startup sequence

1. Load YAML config, create `ProjectManager`
2. Add all projects (load graphs from disk, or fresh if `--reindex`)
3. Start HTTP server (MCP + REST API + static UI + WebSocket)
4. Validate `jwtSecret` if users are configured (warns if missing)
5. Start auto-save (30s interval for dirty projects)
6. Background: per project — load embedding models → start indexing
7. Handle `SIGINT`/`SIGTERM`: shutdown all projects gracefully

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
| `--config` | `graph-memory.yaml` | Path to config (optional — uses cwd if not found) |
| `--host` | from config or `127.0.0.1` | Bind address |
| `--port` | from config or `3000` | Port |
| `--reindex` | `false` | Discard persisted graphs, re-index from scratch |
| `--debug` | `false` | Log MCP tool calls and responses to stderr |

## `index` — one-shot scan

Indexes a project and exits. Useful for CI/CD or as a pre-start step.

```bash
# Zero-config: index current directory
graphmemory index

# With config
graphmemory index --config graph-memory.yaml --project my-app [--reindex]
```

### Startup sequence

1. Load graphs from disk (or fresh if `--reindex`) + load embedding models
2. Run `scan()` + `drain()` (walks directory, embeds all files)
3. Save all graphs to disk, exit

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | `graph-memory.yaml` | Path to config (optional — uses cwd if not found) |
| `--project` | all projects | Project ID to index (omit to index all) |
| `--reindex` | `false` | Discard persisted graphs |

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

Both main commands (`index`, `serve`) support `--reindex`:

- Discards persisted graph JSON files
- Creates fresh empty graphs
- Re-indexes all files from scratch

### Automatic re-index

Each graph JSON file stores a data version and embedding model fingerprint. On load, if either differs from the current config, the graph is automatically discarded and re-indexed — no `--reindex` needed. This covers both model changes and schema upgrades (e.g. new embedding content, path normalization changes).

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
