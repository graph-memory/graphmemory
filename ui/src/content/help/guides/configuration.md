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
    graphs:
      docs:
        pattern: "docs/**/*.md"
      code:
        pattern: "src/**/*.ts"
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
| `corsOrigins` | — | Allowed CORS origins (array of strings) |
| `defaultAccess` | `rw` | Default access for unknown users: `deny`, `r`, `rw` |
| `embedding.model` | `Xenova/bge-m3` | Default model for all graphs |
| `embedding.remote` | — | Remote embedding API URL (delegates instead of local model) |
| `embedding.remoteApiKey` | — | API key for remote embedding |
| `embeddingApi.enabled` | `false` | Expose local model via `POST /api/embed` |
| `embeddingApi.apiKey` | — | API key for the embedding endpoint |

## Project settings

Each project needs at least `projectDir`:

| Field | Default | Description |
|---|---|---|
| `projectDir` | **(required)** | Root directory to index |
| `graphMemory` | `.graph-memory` | Where graph JSON files are stored (relative to projectDir) |
| `excludePattern` | `node_modules/**` | Glob to exclude (project-level fallback, overridden by graph-level) |
| `tsconfig` | — | Path to tsconfig.json (enables import resolution in code graph) |
| `chunkDepth` | `4` | Max heading depth for markdown chunking |
| `embedding.maxChars` | `8000` | Max characters fed to the embedding model per node (inherits: graph → project → workspace → server) |
| `access` | — | Per-user access overrides for this project |

> **Legacy fields:** `docsPattern` and `codePattern` still work but are deprecated. Use `graphs.docs.pattern` and `graphs.code.pattern` instead.

### Per-graph configuration

Each graph can be individually configured with `enabled`, `pattern`, `excludePattern`, `embedding`, and `access`:

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphs:
      docs:
        enabled: true                      # Set false to disable this graph
        pattern: "docs/**/*.md"            # Glob for files to index
        excludePattern: "docs/archive/**"  # Glob to exclude
        embedding:                          # Full embedding config (no merge with parent)
          model: "Xenova/bge-m3"
          pooling: "cls"
          normalize: true
        access:                             # Per-graph access control
          bob: rw
      code:
        enabled: true
        pattern: "src/**/*.ts"
        embedding:
          model: "Xenova/bge-base-en-v1.5"
      knowledge:
        access:
          bob: rw                           # bob gets rw on knowledge
      tasks:
        enabled: true
      files:
        enabled: true
      skills:
        enabled: true
```

Graphs without a specific `embedding` block use the project-level `embedding`, then the server-level `embedding`. The same model string is loaded only once, even if used by multiple graphs.

Graph-level `embedding` is a complete block (first-defined-wins, no field-by-field merge with parent).

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
| `access` | Per-user access for shared graphs (overrides `server.access`) |
| `embedding` | Embedding config for shared graphs (overrides `server.embedding`) |

## Users & authentication

Define users for REST API and UI authentication. MCP stdio mode does not use authentication — identity comes from the `author` config.

```yaml
users:
  alice:
    name: "Alice"
    email: "alice@example.com"
    apiKey: "mgm-key-abc123"
    passwordHash: "$scrypt$16384$8$1$salt$hash"   # generated by: graphmemory users add

server:
  jwtSecret: "your-secret-key-here"    # required when users are defined
  accessTokenTtl: "15m"                # JWT access token lifetime (default: 15m)
  refreshTokenTtl: "7d"                # JWT refresh token lifetime (default: 7d)
```

| Field | Description |
|---|---|
| `name` | Display name (used as createdBy/updatedBy in notes/tasks/skills) |
| `email` | Email address (for UI login and mirror files) |
| `apiKey` | Bearer token for programmatic API/MCP access |
| `passwordHash` | Scrypt hash for UI password login (generate with `graphmemory users add`) |

Two authentication methods:
- **UI login**: email + password → JWT cookies (httpOnly, SameSite=Strict)
- **API access**: `Authorization: Bearer <apiKey>` header

When a user authenticates, their `name` and `email` are used as the author for mutations, overriding the root `author` config.

## Access control

Access control restricts who can read or write to projects, workspaces, and individual graphs. Access levels are `deny`, `r` (read-only), or `rw` (read-write).

### Server-level defaults

```yaml
server:
  defaultAccess: rw            # Access for users not listed in access maps
  access:                       # Server-level per-user access
    alice: rw
    bob: r
```

`defaultAccess` applies to any authenticated user not explicitly listed. Default is `rw`.

### Per-project access

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    access:
      bob: rw                   # bob gets rw on this project (overrides server.access)
```

### Per-workspace access

```yaml
workspaces:
  backend:
    projects: [api-gateway, catalog-service]
    access:
      alice: rw
      bob: r                    # bob gets read-only on shared graphs
```

### Per-graph access

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    access:
      bob: r                    # bob is read-only on this project...
    graphs:
      knowledge:
        access:
          bob: rw               # ...but gets rw on knowledge specifically
```

### Resolution order

Access is resolved from most specific to least specific:

1. **Graph-level** `access` (e.g., `graphs.knowledge.access.bob`)
2. **Project-level** `access` (e.g., `projects.my-app.access.bob`)
3. **Workspace-level** `access` (for shared graphs)
4. **Server-level** `access` (e.g., `server.access.bob`)
5. **`server.defaultAccess`** (fallback, default `rw`)

## Team directory setup

For team environments, combine `users` with access control to give each team member appropriate permissions:

```yaml
users:
  alice:
    name: "Alice (Tech Lead)"
    email: "alice@company.com"
    apiKey: "mgm-key-alice-secret"
  bob:
    name: "Bob (Developer)"
    email: "bob@company.com"
    apiKey: "mgm-key-bob-secret"
  ci:
    name: "CI Bot"
    email: "ci@company.com"
    apiKey: "mgm-key-ci-secret"

server:
  defaultAccess: deny            # Deny unknown users
  access:
    alice: rw
    bob: rw
    ci: r                        # CI can only read

projects:
  production-app:
    projectDir: "/path/to/app"
    access:
      ci: r                      # CI can read project data
```

## Embedding API configuration

Expose the server's local embedding model as an HTTP API for other services or Graph Memory instances to use:

```yaml
server:
  embeddingApi:
    enabled: true                # Enable POST /api/embed endpoint
    apiKey: "emb-secret-key"     # API key for embedding requests (separate from user apiKeys)
```

When enabled, `POST /api/embed` accepts `{ text: "..." }` or `{ texts: ["..."] }` and returns embeddings from the server's configured model. Authenticate with `Authorization: Bearer <apiKey>` using the `embeddingApi.apiKey`.

## Remote embedding setup

Instead of running the embedding model locally, delegate to a remote embedding API (e.g., another Graph Memory instance with `embeddingApi` enabled, or any compatible service):

```yaml
server:
  embedding:
    model: "Xenova/bge-m3"
    remote: "http://gpu-server:3000/api/embed"
    remoteApiKey: "emb-secret-key"
```

When `remote` is set, the server sends embedding requests to the remote URL instead of loading the model locally. This is useful for:
- Running on machines without GPU/enough RAM for the model
- Sharing a single model instance across multiple Graph Memory servers
- Using a dedicated embedding service

The `remote` and `remoteApiKey` fields can be set at server, project, or graph level following the same embedding resolution order.

## CORS origins

Configure allowed origins for Cross-Origin Resource Sharing when the UI or API is accessed from a different domain:

```yaml
server:
  corsOrigins:
    - "http://localhost:5173"       # Vite dev server
    - "https://my-app.example.com"  # Production frontend
```

When `corsOrigins` is not set, CORS headers are not added. Set this when the web UI or REST API is accessed from a different origin than the server.

## Common patterns

### Docs-only project (no code indexing)

```yaml
projects:
  wiki:
    projectDir: "/path/to/wiki"
    graphs:
      docs:
        pattern: "**/*.md"
      code:
        enabled: false
```

### Code-only project (no docs)

```yaml
projects:
  library:
    projectDir: "/path/to/library"
    graphs:
      docs:
        enabled: false
      code:
        pattern: "src/**/*.ts"
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
