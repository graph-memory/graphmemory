# Documentation

## General

- [Overview](overview.md) — what Graph Memory is and what it does
- [Architecture](architecture.md) — system architecture, layers, data flow, directory structure

## Concepts

- [How Documentation Indexing Works](concepts-docs-indexing.md) — from markdown to semantic graph: parsing, chunking, links, code blocks
- [How Code Indexing Works](concepts-code-indexing.md) — from source to graph: tree-sitter AST, symbols, imports, relationships
- [Task Management — Principles](concepts-tasks.md) — kanban workflow, priorities, relationships, cross-graph context
- [Skills — Purpose and Design](concepts-skills.md) — reusable recipes, triggers, recall, usage tracking
- [Knowledge Graph — Purpose and Design](concepts-knowledge.md) — persistent memory layer, cross-graph links, proxy lifecycle
- [File Index — Purpose and Design](concepts-file-index.md) — complete project map, metadata, directory hierarchy

## Server

- [CLI](cli.md) — CLI commands (`serve`, `index`, `users add`), startup sequences
- [Configuration](configuration.md) — full `graph-memory.yaml` reference

## Indexing

- [Indexer](indexer.md) — indexing pipeline, three serial queues, dispatch logic
- [Watcher](watcher.md) — file watching, real-time indexing, mirror file reverse import

## Graphs

- [Graphs Overview](graphs-overview.md) — graph types, managers, persistence, cross-graph links, node IDs
- [DocGraph](graph-docs.md) — markdown document chunks, parsing, code block extraction
- [CodeGraph](graph-code.md) — AST symbols, tree-sitter parsing, supported languages
- [KnowledgeGraph](graph-knowledge.md) — user/LLM notes, relations, cross-graph links, attachments
- [FileIndexGraph](graph-file-index.md) — all project files, directory hierarchy, language/MIME detection
- [TaskGraph](graph-tasks.md) — kanban tasks, priorities, assignees, cross-graph links
- [SkillGraph](graph-skills.md) — reusable recipes, triggers, usage tracking

## Search & Embeddings

- [Search](search.md) — hybrid BM25 + vector search, BFS expansion, RRF fusion
- [Embeddings](embeddings.md) — embedding models, configuration, remote embedding, embedding API

## API

- [REST API](api-rest.md) — full endpoint reference
- [REST API Patterns](api-patterns.md) — middleware chain, validation, auth, error handling, mutation serialization
- [MCP Tools Reference](api-mcp.md) — all 58 MCP tools with input/output schemas
- [MCP Tools Guide](mcp-tools-guide.md) — detailed descriptions, when to use, best practices
- [WebSocket](api-websocket.md) — real-time event types and format

## Auth & Security

- [Authentication](authentication.md) — password login, JWT cookies, API keys, ACL resolution
- [Security](security.md) — CSRF, XSS, timing attacks, SSRF, path traversal protections

## Features

- [File Mirror](file-mirror.md) — markdown mirroring for notes/tasks/skills, reverse import from IDE
- [Team Management](team.md) — `.team/` directory, task assignees

## Deployment

- [npm Package](npm-package.md) — `@graphmemory/server` installation and usage
- [Docker](docker.md) — Docker image, Docker Compose, volume mounts

## UI

- [UI Architecture](ui-architecture.md) — React + MUI + FSD stack, routing, auth flow
- [UI Features](ui-features.md) — all pages: dashboard, kanban, code browser, prompt generator, etc.
- [UI Patterns](ui-patterns.md) — FSD conventions, page patterns, hooks, state management, WebSocket, ACL

## Development

- [Testing](testing.md) — Jest test suites, test patterns, CI
