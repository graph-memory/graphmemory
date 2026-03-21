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

Always call `get_context` at the beginning of a session. It tells you which graphs are available, so you know which tools will work. Skipping this can lead to wasted calls against disabled graphs.

## Search before you create

Before creating a note, task, or skill, search for existing ones first. This prevents duplicates that fragment your knowledge base.

```
1. search_notes("authentication approach")    -- check if it exists
2. create_note(title: "Auth approach", ...)   -- only if no match
```

The same applies to tasks and skills. A quick `search_tasks` or `search_skills` call costs very little and can save you from maintaining duplicate entries.

## Use search tools instead of browsing

The `search`, `search_code`, and `search_notes` tools use hybrid search (keyword + semantic + graph expansion) and are far more effective than manually browsing with `list_*` tools. Use list tools for broad overviews; use search tools when you know what you are looking for.

## Recall skills for complex tasks

At the start of any non-trivial task, call `recall_skills` with a description of what you are about to do. It uses a lower relevance threshold than `search_skills`, so it catches procedures that might be tangentially relevant. If a skill helps, call `bump_skill_usage` afterward so it surfaces more easily next time.

## Use cross-graph links

Connect related items across graphs:

- **Notes to code** — link architecture decisions to the functions they describe
- **Tasks to files** — link bug fix tasks to the affected source files
- **Skills to docs** — link deployment procedures to the relevant configuration docs

Use `create_relation`, `create_task_link`, or `create_skill_link` to build these connections. They enable powerful reverse lookups later (e.g., "What tasks are related to this file?").

## Use cross_references for symbols

When you need to understand a code symbol, use `cross_references` instead of making separate calls to `search_code`, `search`, and `find_examples`. It returns the source definition, documentation, and usage examples in one call.

## Use move_task for status changes

Always use `move_task` instead of `update_task` when changing a task's status. `move_task` automatically manages the `completedAt` timestamp — setting it when a task moves to `done` or `cancelled`, and clearing it when moving back to an active status.

## Manage context budget

MCP responses can be large, especially for search results. To keep context manageable:

- **Lower `maxResults`** when you only need a few matches (default is 20)
- **Raise `minScore`** to filter out low-relevance results (default is 0.5 for most tools)
- **Use `get_toc` before `get_node`** — scan a document's structure before fetching full sections
- **Use `search_files` / `search_topic_files` first** — find the right file before searching within it
- **Set `includeBody: false`** on `search_code` (the default) — fetch full bodies with `get_symbol` only for the results you need

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
