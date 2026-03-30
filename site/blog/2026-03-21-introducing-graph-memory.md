---
slug: introducing-graph-memory
title: "Introducing Graph Memory: Semantic Code Memory for AI Assistants"
authors: [graphmemory]
tags: [release, mcp, announcement]
description: "Graph Memory v1.3 — an MCP server that turns your project into a queryable semantic knowledge base with 70 AI tools."
---

We're excited to announce **Graph Memory** — an MCP server that turns any project directory into a queryable semantic knowledge base for AI assistants.

<!-- truncate -->

## The problem

AI coding assistants are powerful, but they lose context between conversations. They can't remember decisions your team made, don't know about your project's architecture patterns, and can't track tasks across sessions.

RAG (Retrieval-Augmented Generation) helps, but it treats your codebase as a bag of text chunks. It doesn't understand structure — that this function calls that one, that this doc explains that module, that this task blocks that feature.

## The solution: structured graphs

Graph Memory builds **six interconnected graphs** from your project:

- **Docs Graph** — markdown parsed into heading-based chunks with cross-file links
- **Code Graph** — tree-sitter AST parsing extracts functions, classes, imports, and their relationships
- **Knowledge Graph** — persistent notes and facts with typed relations
- **Task Graph** — kanban workflow with priorities, assignees, and cross-graph context
- **Skill Graph** — reusable recipes and procedures with triggers and usage tracking
- **File Index** — every project file with metadata and directory hierarchy

These graphs are interconnected. A note can link to a code symbol. A task can reference a doc section. A skill can point to the files it modifies. Your AI assistant navigates these connections through **70 MCP tools**.

## Getting started

```bash
npm install -g @graphmemory/server
cd your-project
graphmemory serve
```

Connect your AI assistant:

```bash
# Claude Code
claude mcp add --transport http --scope project graph-memory http://localhost:3000/mcp/your-project
```

That's it. Your AI assistant now has deep understanding of your codebase.

## What's in v1.3

- **MCP Authentication** — secure MCP sessions with API keys
- **Readonly Mode** — protect graphs from mutations while keeping them searchable
- **AI Prompt Builder** — generate optimized system prompts with 14 scenarios, 8 roles, and 6 interaction styles
- **Connect Dialog** — one-click MCP client setup from the Web UI
- **Hybrid Search** — BM25 keyword + vector cosine similarity with graph expansion

## Learn more

- [Documentation](/docs/getting-started)
- [GitHub](https://github.com/graph-memory/graphmemory)
- [npm](https://www.npmjs.com/package/@graphmemory/server)
