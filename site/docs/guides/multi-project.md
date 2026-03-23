---
title: "Multi-Project Setup"
sidebar_label: "Multi-Project Setup"
sidebar_position: 2
description: "Run a single Graph Memory server with multiple projects, each with its own MCP endpoint and independent graphs."
keywords: [multi-project, configuration, YAML, projects, endpoints, graph-memory.yaml]
---

# Multi-Project Setup

A single Graph Memory server can manage multiple projects simultaneously. Each project gets its own set of graphs, its own MCP endpoint, and its own configuration.

## Configuration

Define your projects in `graph-memory.yaml`:

```yaml
server:
  host: "127.0.0.1"
  port: 3000

projects:
  frontend:
    projectDir: "/home/dev/apps/frontend"

  api:
    projectDir: "/home/dev/apps/api"

  docs:
    projectDir: "/home/dev/apps/docs"
```

Start the server with the config file:

```bash
graphmemory serve --config graph-memory.yaml
```

## Independent MCP Endpoints

Each project gets its own MCP endpoint:

| Project | MCP Endpoint |
|---------|-------------|
| `frontend` | `http://localhost:3000/mcp/frontend` |
| `api` | `http://localhost:3000/mcp/api` |
| `docs` | `http://localhost:3000/mcp/docs` |

Connect each AI workspace to its corresponding project endpoint. This keeps context isolated — searching in the `api` project only returns results from the `api` codebase.

## Independent Graphs

Each project maintains its own six graphs:

- **DocGraph** — markdown documentation
- **CodeGraph** — source code symbols
- **FileIndexGraph** — all files and directories
- **KnowledgeGraph** — notes and decisions
- **TaskGraph** — tasks and work items
- **SkillGraph** — reusable procedures

Graph data is stored in each project's `.graph-memory/` directory (or a custom path set via `graphMemory`):

```yaml
projects:
  api:
    projectDir: "/home/dev/apps/api"
    graphMemory: "/home/dev/data/api-graphs"   # custom storage path
```

## Per-Project Configuration

Each project can override server-level settings:

```yaml
server:
  model:
    name: "Xenova/bge-m3"
    dtype: "q8"

projects:
  frontend:
    projectDir: "/home/dev/apps/frontend"
    chunkDepth: 3
    maxFileSize: 2097152    # 2 MB limit for this project
    graphs:
      code:
        include: "**/*.{ts,tsx,vue}"    # also index Vue files

  api:
    projectDir: "/home/dev/apps/api"
    author:
      name: "API Bot"
      email: "api-bot@company.com"
    graphs:
      docs:
        include: "**/*.{md,mdx}"        # include MDX files
```

## Project Selector in Web UI

The Web UI at `http://localhost:3000` includes a project selector dropdown. Switch between projects to browse their graphs, search content, and manage tasks independently.

## Memory-efficient indexing

When managing multiple projects, Graph Memory indexes them **sequentially** in three phases per project: docs → files → code. Embedding models are loaded lazily — the ONNX pipeline only initializes when the first embedding is needed — and each phase completes before the next begins. This means only one model is resident in memory at a time, keeping peak memory low regardless of how many projects you configure.

For setups with three or more projects using the default model, this reduces peak memory by up to **~3 GB** compared to loading all models simultaneously.

## Indexing Individual Projects

You can index a single project without starting the server:

```bash
graphmemory index --config graph-memory.yaml --project api
```

Or re-index all projects:

```bash
graphmemory index --config graph-memory.yaml --reindex
```

## Per-Project Access Control

Restrict access to specific projects per user:

```yaml
users:
  alice:
    name: "Alice"
    email: "alice@example.com"
    apiKey: "mgm-key-abc123"
    passwordHash: "$scrypt$..."

projects:
  frontend:
    projectDir: "/home/dev/apps/frontend"
    access:
      alice: rw     # Alice has full access

  api:
    projectDir: "/home/dev/apps/api"
    access:
      alice: r      # Alice can only read
```
