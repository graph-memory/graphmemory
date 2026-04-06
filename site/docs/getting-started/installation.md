---
title: "Installation"
sidebar_label: "Installation"
sidebar_position: 2
description: "Install Graph Memory via npm, npx, or Docker. Requires Node.js 22+."
keywords: [install, npm, npx, docker, setup]
---

# Installation

## npm (recommended)

```bash
npm install -g @graphmemory/server
```

This installs the `graphmemory` command globally. Requires **Node.js >= 22**.

## npx (no install)

```bash
npx @graphmemory/server serve
```

Downloads and runs without permanent installation.

## Docker

```bash
docker run -d \
  --name graph-memory \
  -p 3000:3000 \
  -v $(pwd):/data/projects/my-project:ro \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server
```

See [Docker](./docker) for full Docker and Docker Compose setup.

## From source

```bash
git clone https://github.com/graph-memory/graphmemory.git
cd graphmemory
npm install
npm run build
node dist/cli/index.js serve
```

## First startup

On first run, Graph Memory downloads the default embedding model (`Xenova/jina-embeddings-v2-small-en`, ~33 MB). This is cached at `~/.graph-memory/models/` and reused on subsequent starts.

## System requirements

- **Node.js** >= 22
- **Disk**: ~33 MB for the default embedding model + graph storage
- **RAM**: ~500 MB during indexing (depends on project size)
- **OS**: macOS, Linux, Windows (via WSL or native)
