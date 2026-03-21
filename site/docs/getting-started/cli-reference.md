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

### What happens on startup

1. Loads config, creates project manager
2. Loads graphs from disk (or fresh if `--reindex`)
3. Starts HTTP server (MCP + REST + Web UI + WebSocket)
4. Background: loads embedding models, starts indexing

### Endpoints

| Path | Description |
|------|-------------|
| `/` | Web UI |
| `/mcp/{projectId}` | MCP endpoint for AI clients |

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
If you change the embedding model in config, Graph Memory automatically detects the mismatch and re-indexes without needing `--reindex`.
:::
