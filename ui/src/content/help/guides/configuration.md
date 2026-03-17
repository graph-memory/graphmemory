# Configuration Guide

All configuration is done via a single `graph-memory.yaml` file. This guide covers every setting and common patterns.

## Basic structure

```yaml
author:
  name: "Your Name"
  email: "you@example.com"

server:
  port: 3000

projects:
  my-app:
    projectDir: "/path/to/my-app"
    docsPattern: "docs/**/*.md"
    codePattern: "src/**/*.ts"
```

The only required field is `projects.*.projectDir`. Everything else has sensible defaults.

## Author settings

The `author` block sets who is recorded as the creator/updater of notes, tasks, and skills. Written in git-style format (`"Name <email>"`) in mirror files.

```yaml
author:
  name: "Your Name"
  email: "you@example.com"
```

Can be overridden per project or per workspace.

## Server settings

| Field | Default | Description |
|---|---|---|
| `host` | `127.0.0.1` | Bind address. Use `0.0.0.0` for Docker or remote access |
| `port` | `3000` | HTTP server port |
| `sessionTimeout` | `1800` | Idle MCP session timeout in seconds (30 min) |
| `modelsDir` | `~/.graph-memory/models` | Where embedding models are cached locally |
| `embeddingModel` | `Xenova/all-MiniLM-L6-v2` | Default model for all graphs |

## Project settings

Each project needs at least `projectDir`:

| Field | Default | Description |
|---|---|---|
| `projectDir` | **(required)** | Root directory to index |
| `graphMemory` | `.graph-memory` | Where graph JSON files are stored (relative to projectDir) |
| `docsPattern` | `**/*.md` | Glob for markdown files. Empty string `""` disables docs |
| `codePattern` | `**/*.{js,ts,jsx,tsx}` | Glob for source files. Empty string `""` disables code |
| `excludePattern` | `node_modules/**` | Glob to exclude. Comma-separated for multiple patterns |
| `tsconfig` | — | Path to tsconfig.json (enables import resolution in code graph) |
| `chunkDepth` | `4` | Max heading depth for markdown chunking |
| `embedMaxChars` | `2000` | Max characters fed to the embedding model per node |

### Per-graph embedding models

Override the embedding model for specific graphs:

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    docsModel: "Xenova/all-MiniLM-L6-v2"
    codeModel: "Xenova/bge-base-en-v1.5"
    knowledgeModel: "Xenova/all-MiniLM-L6-v2"
    taskModel: "Xenova/all-MiniLM-L6-v2"
    filesModel: "Xenova/all-MiniLM-L6-v2"
    skillsModel: "Xenova/all-MiniLM-L6-v2"
```

Graphs without a specific model use `embeddingModel` (project-level, then server-level). The same model string is loaded only once, even if used by multiple graphs.

## Workspaces

Workspaces let multiple projects share the same knowledge, task, and skill graphs. Each project keeps its own docs, code, and file index graphs.

```yaml
projects:
  api-gateway:
    projectDir: "./api-gateway"
    docsPattern: "docs/**/*.md"
    codePattern: "src/**/*.ts"

  catalog-service:
    projectDir: "./catalog-service"
    docsPattern: "docs/**/*.md"
    codePattern: "src/**/*.ts"

workspaces:
  backend:
    projects: [api-gateway, catalog-service]
    graphMemory: "./.workspace-backend"
    mirrorDir: "./.workspace-backend"
    author:
      name: "Backend Team"
      email: "backend@example.com"
```

| Field | Description |
|---|---|
| `projects` | List of project IDs that share this workspace |
| `graphMemory` | Where shared graph JSON files are stored |
| `mirrorDir` | Where shared `.notes/`, `.tasks/`, `.skills/` mirror files are written |
| `author` | Author for shared notes/tasks/skills (overrides root author) |

## Common patterns

### Docs-only project (no code indexing)

```yaml
projects:
  wiki:
    projectDir: "/path/to/wiki"
    docsPattern: "**/*.md"
    codePattern: ""
```

### Code-only project (no docs)

```yaml
projects:
  library:
    projectDir: "/path/to/library"
    docsPattern: ""
    codePattern: "src/**/*.ts"
```

### Multiple exclude patterns

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    excludePattern: "node_modules/**,dist/**,coverage/**,.git/**"
```

### Docker deployment

```yaml
server:
  host: "0.0.0.0"
  port: 3000
  modelsDir: "/data/models"

projects:
  my-app:
    projectDir: "/data/projects/my-app"
```

## Hot reload

When using the `serve` command, the config file is watched for changes. You can add, remove, or update projects without restarting the server.

## Automatic re-indexing

Each graph stores which embedding model was used. If you change the model in config, the graph is automatically discarded and re-indexed on next startup — no `--reindex` flag needed.
