---
title: "Code Tools"
sidebar_label: "Code"
sidebar_position: 6
description: "5 MCP tools for searching and inspecting indexed source code — list files, browse symbols, semantic search, and full symbol retrieval."
keywords: [code tools, code_search, code_get_symbol, code_list_files, code_get_file_symbols, source code, tree-sitter]
---

# Code Tools

These 5 tools work with **indexed source code files** (TypeScript/JavaScript). Graph Memory uses tree-sitter AST parsing to extract functions, classes, interfaces, type aliases, and other symbols from your source files.

:::info
These tools require the **code graph** to be enabled.
:::

## code_list_files

Lists all indexed source code files.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `filter` | No | — | Substring filter on file path |
| `limit` | No | — | Maximum number of results |

### Returns

Array of `{ fileId, symbolCount }` — each entry is a source file with the number of symbols extracted from it.

### When to use

Get an overview of all indexed source files. Useful for understanding project structure.

---

## code_get_file_symbols

Lists all symbols in a source file, sorted by line number.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `fileId` | Yes | File ID (e.g. `"src/auth.ts"`) |

### Returns

Array of `{ id, kind, name, signature, startLine, endLine, isExported }` — every function, class, interface, and other symbol in the file.

### When to use

Get an outline of a file's structure, like an IDE's symbol panel. Use this before `code_get_symbol` to find the specific symbol you want to read.

---

## code_search

Semantic search over code symbols with optional graph expansion.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query (natural language) |
| `topK` | No | 5 | Number of seed results for BFS expansion |
| `bfsDepth` | No | 1 | How many hops to expand through graph connections |
| `maxResults` | No | 5 | Maximum results returned |
| `minScore` | No | 0.3 | Minimum relevance score (0-1) |
| `bfsDecay` | No | 0.8 | Score decay factor per BFS hop |
| `searchMode` | No | `hybrid` | `hybrid`, `vector`, or `keyword` |
| `includeBody` | No | `false` | Include the full source body in results |

### Returns

Array of `{ id, fileId, kind, name, signature, docComment, startLine, endLine, score, body? }` — matching symbols ranked by relevance.

### When to use

The primary tool for finding code. Use natural language queries like "Find the function that handles password hashing" or "Where is the database connection configured?" Always prefer `code_search` over manually browsing files.

---

## code_get_symbol

Retrieves the full source body of a specific symbol.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `nodeId` | Yes | Symbol node ID (e.g. `"src/auth.ts::hashPassword"`) |

### Returns

`{ id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported, crossLinks? }` — the complete implementation including the full source code body and any cross-graph links.

### When to use

After `code_search` finds a relevant symbol, use `code_get_symbol` to read the full implementation. Node IDs follow the format `fileId::symbolName`.

---

## code_search_files

File-level semantic search over source files.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query |
| `limit` | No | 10 | Maximum results |
| `minScore` | No | 0.3 | Minimum relevance score |

### Returns

Array of `{ fileId, symbolCount, score }` — matching source files ranked by relevance.

### When to use

When you want to find which source files are relevant before drilling into individual symbols. This searches at the file level, while `code_search` searches at the symbol level.
