---
title: "Cross-Graph Tools"
sidebar_label: "Cross-Graph"
sidebar_position: 5
description: "The cross_references tool bridges code definitions and documentation examples to give complete context for any symbol."
keywords: [cross_references, cross-graph, code and docs, symbol lookup, bridge]
---

# Cross-Graph Tools

The cross-graph tool bridges the code graph and docs graph, giving you a unified view of a symbol across both source code and documentation.

:::info
This tool requires **both the docs graph and code graph** to be enabled.
:::

## cross_references

Returns the complete picture for a symbol: its source code definition, documentation mentions, and code examples from docs.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `symbol` | Yes | Symbol name to look up (e.g. `"hashPassword"`, `"UserService"`) |

### Returns

```json
{
  "definitions": [...],
  "documentation": [...],
  "examples": [...]
}
```

| Field | Description |
|-------|-------------|
| `definitions` | Source code symbols from the code graph (signatures, file locations) |
| `documentation` | Documentation sections that mention the symbol |
| `examples` | Code blocks from docs that reference the symbol |

### When to use

Use `cross_references` when you need **complete context** about a symbol. Instead of making separate calls to `search_code`, `search`, and `find_examples`, this single tool gives you everything:

- The actual code definition (from source files)
- The documentation that explains it (from markdown)
- The usage examples (from code blocks in docs)

This is particularly useful before modifying a function or class — you see its implementation, how it is documented, and what examples reference it, all at once.
