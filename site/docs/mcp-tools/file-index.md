---
title: "File Index Tools"
sidebar_label: "File Index"
sidebar_position: 7
description: "3 MCP tools for browsing and searching all project files — not just code or docs, but everything in the project directory."
keywords: [file index, files_list, files_search, files_get_info, project files]
---

# File Index Tools

These 3 tools work with **all files in the project directory** — not just source code or markdown, but configuration files, images, data files, and everything else. The file index provides metadata like language detection, MIME types, and directory hierarchy.

:::info
These tools are **always available**, regardless of graph configuration.
:::

## files_list

Lists all project files and directories with optional filters.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `directory` | No | — | Filter by parent directory (e.g. `"src/lib"`) |
| `extension` | No | — | Filter by file extension (e.g. `".ts"`, `".json"`) |
| `language` | No | — | Filter by detected language (e.g. `"typescript"`, `"yaml"`) |
| `filter` | No | — | Substring match on file path |
| `limit` | No | 50 | Maximum results |

### Returns

Array of `{ filePath, kind, fileName, extension, language, mimeType, size }` — each entry includes full metadata.

### When to use

Browsing the project file tree with filters. Useful for questions like "What configuration files are in this project?" or "List all YAML files."

---

## files_search

Semantic search over all project files by path and name.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query (natural language) |
| `topK` | No | 10 | Maximum results |
| `minScore` | No | 0.3 | Minimum relevance score |

### Returns

Array of `{ filePath, fileName, extension, language, size, score }` — matching files ranked by relevance.

### When to use

When you need to find files by description rather than exact path. For instance: "Find files related to database configuration" or "Where are the test fixtures?"

---

## files_get_info

Returns full metadata for a specific file or directory.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `filePath` | Yes | File path relative to project root (e.g. `"src/lib/embedder.ts"`) |

### Returns

`{ filePath, kind, fileName, directory, extension, language, mimeType, size, mtime }` — complete metadata including modification time, MIME type, and parent directory.

### When to use

When you need detailed information about a specific file, such as its size, type, or last modification time.
