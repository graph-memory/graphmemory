---
title: "What is Graph Memory?"
sidebar_label: "Overview"
sidebar_position: 1
description: "Graph Memory is an MCP server that turns your project into a queryable semantic knowledge base with 58 AI tools, web UI, and six interconnected graphs."
keywords: [graph memory, MCP server, semantic search, knowledge graph, AI tools]
---

# What is Graph Memory?

Graph Memory is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that turns any project directory into a queryable semantic knowledge base. It indexes your markdown docs, source code, and files into six interconnected graphs, then exposes them as **58 MCP tools** and a full-featured **web UI**.

![Graph Memory Dashboard](/img/screenshots/dashboard-dark.png)

## Who is it for?

- **Developers** who want their AI assistant (Claude, Cursor, Windsurf) to deeply understand their codebase
- **Teams** that need a persistent knowledge base that AI assistants can read and write to
- **Anyone** tired of AI losing context between conversations

## What it does

| Feature | Description |
|---------|-------------|
| **Docs indexing** | Parses markdown into heading-based chunks with cross-file links and code block extraction |
| **Code indexing** | Extracts functions, classes, interfaces via tree-sitter AST parsing (TypeScript/JavaScript) |
| **File index** | Indexes all project files with metadata, language detection, directory hierarchy |
| **Knowledge graph** | Persistent notes and facts with typed relations and cross-graph links |
| **Task management** | Kanban workflow with priorities, assignees, due dates, and cross-graph context |
| **Skills** | Reusable recipes with steps, triggers, and usage tracking |
| **Hybrid search** | BM25 keyword + vector cosine similarity with graph expansion |
| **Real-time** | File watching + WebSocket push to UI |
| **Multi-project** | One process manages multiple projects from a single config |
| **Web UI** | Dashboard, kanban board, code browser, search, prompt builder |

## How it works

```
Your Project → Graph Memory → AI Assistant
     │              │               │
  files,         6 graphs,       58 MCP tools
  docs,          embeddings,     for search,
  code           web UI          CRUD, linking
```

1. **Point** Graph Memory at your project directory
2. **It indexes** docs, code, and files into six interconnected graphs
3. **It embeds** every node locally using an embedding model (~560 MB, no API calls)
4. **AI assistants** query the graphs through 58 MCP tools
5. **You manage** knowledge, tasks, and skills through MCP tools or the web UI
6. **File mirror** syncs notes/tasks/skills to `.notes/`, `.tasks/`, `.skills/` folders for IDE editing

## Key principles

- **Everything is local** — embeddings run on your machine, no data leaves your network
- **Zero config to start** — `npm install -g @graphmemory/server && graphmemory serve`
- **Graphs, not chunks** — structured graphs with relationships, not flat vector stores
- **AI-native** — designed for MCP clients, not just humans
- **Multi-project** — one server, many projects, shared workspaces
