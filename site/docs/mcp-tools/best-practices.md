---
title: "Best Practices"
sidebar_label: "Best Practices"
sidebar_position: 11
description: "Tips for getting the most out of Graph Memory's MCP tools — search before create, use cross-graph links, manage context budget, and handle errors."
keywords: [best practices, tips, search before create, cross-graph links, context budget, error handling]
---

# Best Practices

Tips for getting the most out of Graph Memory's MCP tools.

## Start with get_context

Always call `get_context` at the beginning of a session. It tells you which project you're connected to and whether it belongs to a workspace, helping you understand the scope of cross-project operations. Skipping this can lead to wasted calls against disabled graphs.

## Search before you create

Before creating a note, task, or skill, search for existing ones first. This prevents duplicates that fragment your knowledge base.

```
1. notes_search("authentication approach")    -- check if it exists
2. notes_create(title: "Auth approach", ...)   -- only if no match
```

The same applies to tasks and skills. A quick `tasks_search` or `skills_search` call costs very little and can save you from maintaining duplicate entries.

## Use search tools instead of browsing

The `docs_search`, `code_search`, and `notes_search` tools use hybrid search (keyword + semantic + graph expansion) and are far more effective than manually browsing with `list_*` tools. Use list tools for broad overviews; use search tools when you know what you are looking for.

## Recall skills for complex tasks

At the start of any non-trivial task, call `skills_recall` with a description of what you are about to do. It uses a lower relevance threshold than `skills_search`, so it catches procedures that might be tangentially relevant. If a skill helps, call `skills_bump_usage` afterward so it surfaces more easily next time.

## Use cross-graph links

Connect related items across graphs:

- **Notes to code** — link architecture decisions to the functions they describe
- **Tasks to files** — link bug fix tasks to the affected source files
- **Skills to docs** — link deployment procedures to the relevant configuration docs

Use `notes_create_link`, `tasks_create_link`, or `skills_create_link` to build these connections. They enable powerful reverse lookups later (e.g., "What tasks are related to this file?").

## Use docs_cross_references for symbols

When you need to understand a code symbol, use `docs_cross_references` instead of making separate calls to `code_search`, `docs_search`, and `docs_find_examples`. It returns the source definition, documentation, and usage examples in one call.

## Use tasks_move for status changes

Always use `tasks_move` instead of `tasks_update` when changing a task's status. `tasks_move` automatically manages the `completedAt` timestamp — setting it when a task moves to `done` or `cancelled`, and clearing it when moving back to an active status.

## Manage context budget

MCP responses can be large, especially for search results. To keep context manageable:

- **Lower `maxResults`** when you only need a few matches (default is 20)
- **Raise `minScore`** to filter out low-relevance results (default is 0.5 for most tools)
- **Use `docs_get_toc` before `docs_get_node`** — scan a document's structure before fetching full sections
- **Use `code_search_files` / `docs_search_files` first** — find the right file before searching within it
- **Set `includeBody: false`** on `code_search` (the default) — fetch full bodies with `code_get_symbol` only for the results you need

## Handle errors gracefully

MCP tool errors are returned with `isError: true`. Common error scenarios:

| Error | Cause | Solution |
|-------|-------|----------|
| Node not found | Invalid ID or deleted node | Search again to find the current ID |
| Graph not available | Graph disabled in config | Check `get_context` for available graphs |
| Readonly | Graph set to readonly | Mutation tools are not available; use read tools only |
| Validation error | Missing required parameter | Check the tool's parameter requirements |

## Link everything

The more connections you create between items, the more useful graph expansion becomes. When BFS search expands from a matching node through its relations, it discovers related items that keyword search alone would miss. Build a habit of linking notes, tasks, and skills to the code and docs they relate to.
