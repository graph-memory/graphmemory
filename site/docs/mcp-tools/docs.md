---
title: "Docs Tools"
sidebar_label: "Docs"
sidebar_position: 3
description: "5 MCP tools for searching and reading indexed markdown documentation — list topics, get table of contents, semantic search, and more."
keywords: [docs tools, search, documentation, markdown, list_topics, get_toc, get_node]
---

# Docs Tools

These 5 tools let you explore and search the project's indexed markdown documentation. Graph Memory parses markdown files into heading-based chunks, so you can search and retrieve individual sections.

:::info
These tools require the **docs graph** to be enabled.
:::

## list_topics

Lists all indexed markdown files.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `filter` | No | — | Substring filter on file path or title |
| `limit` | No | 50 | Maximum number of results |

### Returns

Array of `{ fileId, title, chunks }` — each entry is one indexed markdown file with its title and the number of chunks (sections) it contains.

### When to use

Get an overview of all available documentation before drilling into specific topics.

---

## get_toc

Returns the table of contents for a specific documentation file.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `fileId` | Yes | File ID (e.g. `"docs/auth.md"`) |

### Returns

Array of `{ id, title, level }` — the heading hierarchy of the file. Use the `id` values with `get_node` to retrieve full content.

### When to use

Before reading a long document, check its structure to find the section you need.

---

## search

Semantic search across all documentation sections with optional graph expansion.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query (natural language) |
| `topK` | No | 5 | Number of seed results for BFS expansion |
| `bfsDepth` | No | 1 | How many hops to expand through graph connections |
| `maxResults` | No | 20 | Maximum results returned |
| `minScore` | No | 0.5 | Minimum relevance score (0-1) |
| `bfsDecay` | No | 0.8 | Score decay factor per BFS hop |
| `searchMode` | No | `hybrid` | `hybrid`, `vector`, or `keyword` |

### Returns

Array of `{ id, fileId, title, content, level, score }` — matching documentation sections ranked by relevance.

### When to use

This is the primary tool for finding documentation. Always prefer `search` over manually browsing files. It uses hybrid search (keyword + semantic) with graph expansion to find the most relevant sections.

---

## get_node

Retrieves the full content of a specific documentation section.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `nodeId` | Yes | Node ID (e.g. `"docs/auth.md::JWT Tokens"`) |

### Returns

`{ id, fileId, title, content, level, mtime }` — the complete text of the section.

### When to use

After `search` finds a relevant section, use `get_node` to read the full content. Node IDs follow the format `fileId::heading`.

---

## search_topic_files

File-level semantic search — finds relevant documentation files by path and title.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query |
| `topK` | No | 10 | Maximum results |
| `minScore` | No | 0.3 | Minimum relevance score |

### Returns

Array of `{ fileId, title, score }` — matching files ranked by relevance.

### When to use

When you want to find which documentation files are relevant before drilling into individual sections. This searches at the file level, while `search` searches at the section level.
