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

Each request creates a session. Sessions share graph instances and are automatically cleaned up after 30 minutes of inactivity.

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
| **[Docs](docs.md)** | `list_topics`, `get_toc`, `search`, `get_node`, `search_topic_files` | 5 | Docs graph enabled |
| **[Code Blocks](code-blocks.md)** | `find_examples`, `search_snippets`, `list_snippets`, `explain_symbol` | 4 | Docs graph enabled |
| **[Cross-Graph](cross-graph.md)** | `cross_references` | 1 | Docs + Code graphs enabled |
| **[Code](code.md)** | `list_files`, `get_file_symbols`, `search_code`, `get_symbol`, `search_files` | 5 | Code graph enabled |
| **[File Index](file-index.md)** | `list_all_files`, `search_all_files`, `get_file_info` | 3 | Always available |
| **[Knowledge](knowledge.md)** | `create_note`, `update_note`, `delete_note`, `get_note`, `list_notes`, `search_notes`, `create_relation`, `delete_relation`, `list_relations`, `find_linked_notes`, `add_note_attachment`, `remove_note_attachment` | 12 | Always available |
| **[Tasks](tasks.md)** | `create_task`, `update_task`, `delete_task`, `get_task`, `list_tasks`, `search_tasks`, `move_task`, `link_task`, `create_task_link`, `delete_task_link`, `find_linked_tasks`, `add_task_attachment`, `remove_task_attachment` | 13 | Always available |
| **[Skills](skills.md)** | `create_skill`, `update_skill`, `delete_skill`, `get_skill`, `list_skills`, `search_skills`, `recall_skills`, `bump_skill_usage`, `link_skill`, `create_skill_link`, `delete_skill_link`, `find_linked_skills`, `add_skill_attachment`, `remove_skill_attachment` | 14 | Always available |

**Total: 58 tools**
