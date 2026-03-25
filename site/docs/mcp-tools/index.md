---
title: "MCP Tools Overview"
sidebar_label: "Overview"
sidebar_position: 1
description: "Overview of Graph Memory's 58 MCP tools — transport, authentication, tool visibility, and a complete reference table grouped by category."
keywords: [MCP tools, Model Context Protocol, API, tool reference, graph memory]
---

# MCP Tools Overview

Graph Memory exposes **58 MCP tools** that let AI assistants read, search, and write to your project's knowledge base. These tools are the primary interface between your AI assistant and Graph Memory.

![MCP Tools Explorer in Web UI](/img/screenshots/tools-dark.png)

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open protocol that lets AI assistants call tools on external servers. When your assistant (Claude, Cursor, Windsurf, etc.) connects to Graph Memory, it discovers the available tools and can call them to search docs, manage tasks, save notes, and more.

## Transport

Graph Memory uses **Streamable HTTP** transport. Each project gets its own MCP endpoint:

```
POST /mcp/{projectId}
```

Each request creates a session. Sessions share graph instances and are automatically cleaned up after 60 minutes of inactivity (configurable via `server.sessionTimeout`).

## Authentication

When users are configured in `graph-memory.yaml`, MCP endpoints require an API key:

```
Authorization: Bearer <apiKey>
```

Without users configured, MCP is open (no authentication required). See [Authentication](/docs/security/authentication) for details on API key setup.

## Tool visibility

Not all 58 tools are always visible. The tools available in a given session depend on three factors:

| Factor | Effect |
|--------|--------|
| **Graph enabled** | Disabled graphs have no tools registered at all |
| **Graph readonly** | Readonly graphs hide mutation tools (create, update, delete) for all users |
| **User access level** | Users with `r` (read) access see only read tools; users with `deny` see no tools for that graph |

This means your AI assistant only sees the tools it is allowed to use. Mutation tools that would fail due to permissions are simply not registered.

## Response format

All tools return JSON. Successful responses contain the result data. Errors are flagged with `isError: true`.

## Mutation serialization

Write operations (create, update, delete) are automatically serialized through a queue. This prevents race conditions when multiple AI sessions write to the same graph concurrently. Read operations (list, get, search) run freely without queueing.

## All tools by category

| Group | Tools | Count | Requires |
|-------|-------|-------|----------|
| **[Context](context.md)** | `get_context` | 1 | Always available |
| **[Docs](docs.md)** | `docs_list_files`, `docs_get_toc`, `docs_search`, `docs_get_node`, `docs_search_files` | 5 | Docs graph enabled |
| **[Code Blocks](code-blocks.md)** | `docs_find_examples`, `docs_search_snippets`, `docs_list_snippets`, `docs_explain_symbol` | 4 | Docs graph enabled |
| **[Cross-Graph](cross-graph.md)** | `docs_cross_references` | 1 | Docs + Code graphs enabled |
| **[Code](code.md)** | `code_list_files`, `code_get_file_symbols`, `code_search`, `code_get_symbol`, `code_search_files` | 5 | Code graph enabled |
| **[File Index](file-index.md)** | `files_list`, `files_search`, `files_get_info` | 3 | File Index graph enabled |
| **[Knowledge](knowledge.md)** | `notes_create`, `notes_update`, `notes_delete`, `notes_get`, `notes_list`, `notes_search`, `notes_create_link`, `notes_delete_link`, `notes_list_links`, `notes_find_linked`, `notes_add_attachment`, `notes_remove_attachment` | 12 | Knowledge graph enabled |
| **[Tasks](tasks.md)** | `tasks_create`, `tasks_update`, `tasks_delete`, `tasks_get`, `tasks_list`, `tasks_search`, `tasks_move`, `tasks_link`, `tasks_create_link`, `tasks_delete_link`, `tasks_find_linked`, `tasks_add_attachment`, `tasks_remove_attachment` | 13 | Tasks graph enabled |
| **[Skills](skills.md)** | `skills_create`, `skills_update`, `skills_delete`, `skills_get`, `skills_list`, `skills_search`, `skills_recall`, `skills_bump_usage`, `skills_link`, `skills_create_link`, `skills_delete_link`, `skills_find_linked`, `skills_add_attachment`, `skills_remove_attachment` | 14 | Skills graph enabled |

**Total: 58 tools**
