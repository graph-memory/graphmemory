---
title: "Code Block Tools"
sidebar_label: "Code Blocks"
sidebar_position: 4
description: "4 MCP tools for finding and searching code examples embedded inside markdown documentation files."
keywords: [code blocks, code examples, find_examples, search_snippets, explain_symbol, documentation snippets]
---

# Code Block Tools

These 4 tools work with **code blocks inside markdown documentation** — fenced code blocks that show examples, usage patterns, and configuration snippets. They do not work with source code files (use [Code Tools](code.md) for that).

:::info
These tools require the **docs graph** to be enabled.
:::

## find_examples

Finds code blocks in documentation that mention a specific symbol.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `symbol` | Yes | — | Symbol name to search for (e.g. `"UserService"`, `"createApp"`) |
| `limit` | No | 20 | Maximum results to return |

### Returns

Array of `{ id, fileId, language, symbols, content, parentId, parentTitle }` — each entry is a code block that references the symbol, along with the parent documentation section it appears in.

### When to use

When you want to see how a symbol is used in documentation examples. For instance: "Show me examples of how `UserService` is used in the docs."

---

## search_snippets

Semantic search over code blocks extracted from documentation.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query (natural language) |
| `topK` | No | 10 | Maximum results |
| `minScore` | No | 0.3 | Minimum relevance score |
| `language` | No | — | Filter by language (e.g. `"typescript"`, `"python"`) |

### Returns

Array of `{ id, fileId, language, symbols, content, score }` — matching code blocks ranked by relevance.

### When to use

When you want to find code examples by what they do, not just which symbols they contain. For instance: "Find examples of error handling middleware."

---

## list_snippets

Lists code blocks with optional filters.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `fileId` | No | — | Filter by documentation file |
| `language` | No | — | Filter by language (e.g. `"typescript"`) |
| `filter` | No | — | Substring match on code content |
| `limit` | No | 20 | Maximum results to return |

### Returns

Array of `{ id, fileId, language, symbols, preview }` — each entry includes a short preview of the code block.

### When to use

Browsing all code examples in documentation, optionally narrowed by language or file.

---

## explain_symbol

Finds a code example for a symbol along with its surrounding prose explanation.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `symbol` | Yes | — | Symbol name to look up |
| `limit` | No | 10 | Maximum results to return |

### Returns

Array of `{ codeBlock, explanation, fileId }` — each entry contains a code block referencing the symbol and the text section that explains it.

### When to use

When you want to understand how a symbol works with both its code example and the documentation that explains it. This is more informative than `find_examples` because it includes the prose context.
