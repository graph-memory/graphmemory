---
slug: getting-started-5-minutes
title: "Getting Started: From Zero to Semantic Search in 5 Minutes"
authors: [graphmemory]
tags: [tutorial, getting-started, mcp]
description: "Install Graph Memory, index your project, connect Claude Code, and run your first semantic search — all in under 5 minutes."
---

You have a codebase. You want your AI assistant to actually understand it — not just grep through it, but know the structure, remember decisions, and track work. Here's how to get there in 5 minutes.

<!-- truncate -->

## Minute 1: Install and serve

```bash
npm install -g @graphmemory/server
cd /path/to/your-project
graphmemory serve
```

No config file needed. Graph Memory uses your current directory as the project. On first run it downloads the embedding model (~560 MB, cached after that), then indexes your project in three phases: docs, files, code. The server starts on `http://localhost:3000`.

You'll see output like:

```
INFO  Registered model (lazy)         model="Xenova/bge-m3"
INFO  Starting indexing phase         phase="1/3 docs"
INFO  Starting indexing phase         phase="2/3 files"
INFO  Starting indexing phase         phase="3/3 code"
INFO  Indexed docs                    nodes=142 edges=89
INFO  Indexed code                    nodes=387 edges=512
INFO  Indexed files                   nodes=1203 edges=1202
```

## Minute 2: Connect Claude Code

```bash
claude mcp add --transport http --scope project graph-memory http://localhost:3000/mcp/your-project
```

Replace `your-project` with your directory name. If your project lives at `/home/dev/my-app`, the project ID is `my-app`.

For Cursor or Windsurf, add to `.mcp.json`:

```json
{
  "mcpServers": {
    "graph-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp/my-app"
    }
  }
}
```

Your AI assistant now has access to 70 MCP tools across six graphs.

## Minute 3: Search your code

Ask your assistant something about your codebase. Behind the scenes, it calls `docs_search` or `code_search`:

> "How does authentication work in this project?"

Graph Memory returns results from multiple graphs — the auth module's functions and classes from the Code Graph, the authentication docs from the Docs Graph, any related files from the File Index. Results are ranked using hybrid search: BM25 keyword matching plus vector cosine similarity, fused with Reciprocal Rank Fusion.

You can also search directly with specific tools:

> "Search the code graph for functions related to token validation"

This calls `code_search` with your query, returning matching symbols with their signatures, file locations, and relationships.

## Minute 4: Create a note

Your assistant can store knowledge that persists across conversations:

> "Create a note about our auth architecture: we use JWT tokens with scrypt password hashing, tokens expire after 24 hours, and refresh tokens are stored in HttpOnly cookies"

This calls `notes_create` with a title and content. The note is automatically embedded for semantic search. Next time any AI session asks about auth, this note shows up in search results.

The note also appears as a markdown file in `.notes/` inside your project directory. You can edit it directly in your IDE — changes sync back to the graph automatically.

## Minute 5: Link notes to code

Here's where graphs beat flat search. Connect your note to the actual code it describes:

> "Link the auth architecture note to the AuthService class in the code graph"

This calls `notes_create_link` with the note ID, the code symbol ID, and a relation kind like `"references"`. Now when someone searches for the AuthService class, the architecture note surfaces too. When someone reads the note, they can navigate to the code.

You can create links across all six graphs: notes to code symbols, tasks to doc sections, skills to files they modify.

## What you have now

After 5 minutes:

- **Docs Graph** — your markdown files parsed into heading-based chunks with cross-file links
- **Code Graph** — AST-parsed functions, classes, imports, and their call relationships
- **File Index** — every file in your project with metadata and directory hierarchy
- **Knowledge Graph** — your notes, searchable and linked to code
- **Task Graph** — ready for kanban workflow with priorities and assignees
- **Skill Graph** — ready to store reusable procedures and recipes

All searchable with hybrid BM25 + vector search. All interconnected through typed edges. All accessible through 70 MCP tools.

## Going further

Create a `graph-memory.yaml` to customize your setup — configure multiple projects, set up workspaces with shared knowledge, enable Redis caching, or add user authentication:

```bash
graphmemory serve --config graph-memory.yaml
```

For the full configuration reference, see the [Configuration docs](/docs/getting-started/configuration).
