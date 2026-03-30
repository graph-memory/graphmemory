---
title: "CLI Reference"
sidebar_label: "CLI Reference"
sidebar_position: 5
description: "Graph Memory CLI commands — serve, index, and users add."
keywords: [CLI, commands, serve, index, users]
---

# CLI Reference

```bash
graphmemory <command> [options]
```

## `serve` — start the server

Primary mode. Starts HTTP server with MCP endpoints, REST API, web UI, and WebSocket.

```bash
# Zero-config: use current directory as project
graphmemory serve

# With config file
graphmemory serve --config graph-memory.yaml

# Force re-index from scratch
graphmemory serve --reindex
```

| Option | Default | Description |
|--------|---------|-------------|
| `--config` | `graph-memory.yaml` | Config file path (optional) |
| `--host` | `127.0.0.1` | Bind address |
| `--port` | `3000` | Port |
| `--reindex` | `false` | Discard saved graphs, re-index everything |
| `--log-level` | `info` | Log level: fatal/error/warn/info/debug/trace |

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level threshold (also settable via `--log-level`) |
| `LOG_JSON` | `0` | Set to `1` for JSON log output (recommended for Docker/production) |

### What happens on startup

1. Reads config, creates project manager
2. Loads embedding models for all projects (blocking)
3. Indexes all projects (blocking)
4. Starts HTTP server (MCP + REST + Web UI + WebSocket)

Models and indexing complete **before** the server starts listening.

### Endpoints

| Path | Description |
|------|-------------|
| `/` | Web UI |
| `/mcp/{projectId}` | MCP endpoint for AI clients |
| `/api/*` | REST API |
| `/api/ws` | WebSocket |

## `index` — one-shot indexing

Indexes a project and exits. Useful for CI/CD or pre-warming.

```bash
# Zero-config
graphmemory index

# Specific project
graphmemory index --config graph-memory.yaml --project my-app

# Force re-index
graphmemory index --config graph-memory.yaml --reindex
```

| Option | Default | Description |
|--------|---------|-------------|
| `--config` | `graph-memory.yaml` | Config file path |
| `--project` | all | Specific project ID to index |
| `--reindex` | `false` | Discard saved graphs |

## `users add` — add a user

Interactive command to create a user in the config file.

```bash
graphmemory users add --config graph-memory.yaml
```

Prompts for:
1. **User ID** — alphanumeric identifier (e.g. `alice`)
2. **Name** — display name
3. **Email** — for UI login
4. **Password** — hashed with scrypt

Generates an API key (`mgm-...`) and writes the user to your config file.

## `--reindex` flag

Both `serve` and `index` support `--reindex`:

- Discards persisted graph JSON files
- Re-indexes all files from scratch

:::tip Automatic re-index
Graph Memory automatically detects model changes and data version upgrades. If either differs from what's stored, graphs are re-indexed without needing `--reindex`.
:::
