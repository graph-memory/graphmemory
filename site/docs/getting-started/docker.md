---
title: "Docker"
sidebar_label: "Docker"
sidebar_position: 6
description: "Run Graph Memory with Docker or Docker Compose. Multi-platform images for amd64 and arm64."
keywords: [docker, docker compose, container, deployment]
---

# Docker

Graph Memory provides multi-platform Docker images (amd64 + arm64) on GitHub Container Registry.

## Quick start

```bash
docker run -d \
  --name graph-memory \
  -p 3000:3000 \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app:ro \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server
```

## Docker Compose

```yaml
services:
  graph-memory:
    image: ghcr.io/graph-memory/graphmemory-server
    ports:
      - "3000:3000"
    volumes:
      - ./graph-memory.yaml:/data/config/graph-memory.yaml:ro
      - /path/to/my-app:/data/projects/my-app:ro
      - models:/data/models
    restart: unless-stopped

volumes:
  models:
```

## Volume mounts

| Container path | Purpose |
|---------------|---------|
| `/data/config/graph-memory.yaml` | Config file (read-only) |
| `/data/projects/<name>` | Project directories (read-only for indexing) |
| `/data/models` | Embedding model cache (persist across restarts) |

:::tip Persist the model cache
Use a named volume for `/data/models` to avoid re-downloading the ~560 MB embedding model on every container restart.
:::

## Config for Docker

In your `graph-memory.yaml`, use the container paths:

```yaml
projects:
  my-app:
    projectDir: "/data/projects/my-app"

server:
  host: "0.0.0.0"    # bind to all interfaces inside container
  modelsDir: "/data/models"
```

## Zero-config Docker

Mount your project at `/data/projects/my-project` and run without a config file:

```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd):/data/projects/my-project:ro \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server
```
