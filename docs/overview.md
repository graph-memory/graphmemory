# Overview

**graphmemory** is an MCP (Model Context Protocol) server that turns a project directory into a queryable semantic knowledge base. It indexes markdown documentation, TypeScript/JavaScript source code, and all project files into six interconnected graph structures, then exposes them as 58 MCP tools + REST API + web UI.

## What it does

- **Parses markdown documentation** into heading-based chunks with cross-file links and fenced code block extraction
- **Parses TypeScript/JavaScript source code** via tree-sitter AST — extracts functions, classes, interfaces, types, enums, and their relationships
- **Indexes all project files** into a file index graph with directory hierarchy, language/MIME detection
- **Stores knowledge** (facts, notes, decisions) in a dedicated knowledge graph with typed relations, file attachments, and cross-graph links
- **Tracks tasks** with kanban workflow, priorities, due dates, estimates, assignees, and cross-graph links
- **Manages skills** (reusable recipes/procedures) with steps, triggers, usage tracking, and cross-graph links
- **Embeds every node** locally using `Xenova/bge-m3` by default (no external API calls); supports per-graph models with configurable pooling, normalization, dtype, and prefixes
- **Answers search queries** via hybrid search (BM25 keyword + vector cosine similarity) with BFS graph expansion
- **Watches for file changes** and re-indexes incrementally in real time

## Key features

| Feature | Description |
|---------|-------------|
| **6 graph types** | DocGraph, CodeGraph, KnowledgeGraph, FileIndexGraph, TaskGraph, SkillGraph |
| **58 MCP tools** | Full CRUD + search across all graphs, cross-graph linking, attachments |
| **Multi-project** | One process manages multiple projects with independent graphs |
| **Workspaces** | Share knowledge/tasks/skills across related projects (e.g. microservices) |
| **REST API** | Express-based HTTP API for all CRUD operations |
| **Web UI** | React 19 + MUI 7 dashboard with kanban board, code browsing, search |
| **Real-time updates** | WebSocket push events on every mutation |
| **Authentication** | Password-based login with JWT cookies, API keys for programmatic access |
| **Access control** | 5-level ACL: graph > project > workspace > server > default |
| **File mirror** | Notes, tasks, skills mirrored to `.notes/`, `.tasks/`, `.skills/` markdown files |
| **Reverse import** | Edit mirror files in IDE — changes sync back to the graph automatically |
| **Team management** | `.team/` directory with team members for task assignment |
| **Embedding API** | Expose the server's embedding model as a REST endpoint for other services |
| **Remote embedding** | Delegate embedding to a remote GPU server via HTTP |
| **Docker** | Multi-platform image (amd64 + arm64) on GHCR |
| **npm package** | `@graphmemory/server` on npm |

## Transports

| Transport | Command | Use case |
|-----------|---------|----------|
| **HTTP** | `serve` | MCP clients, multiple sessions sharing one server |
| **REST API** | `serve` | Web UI, custom integrations, scripts |

## Requirements

- **Node.js** >= 22
- The default embedding model (`Xenova/bge-m3`, ~560 MB) downloads on first startup

## Repository

- GitHub: https://github.com/graph-memory/graphmemory
- npm: `@graphmemory/server`
- Docker: `ghcr.io/graph-memory/graphmemory-server`
