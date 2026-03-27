---
title: "Epic Tools"
sidebar_label: "Epics"
sidebar_position: 10
description: "8 MCP tools for managing epics — create, update, delete, search, and link tasks to epics for high-level progress tracking."
keywords: [epic tools, epics_create, epics_link_task, epics, progress tracking, task grouping]
---

# Epic Tools

These 8 tools manage **epics** — high-level initiatives that group related tasks together with automatic progress tracking. Epics live in the task graph alongside tasks but use a separate node type.

:::info
These tools require the **task graph** to be enabled. Mutation tools (marked below) are hidden when the task graph is set to `readonly`.
:::

## epics_create {#epics_create}

> **Mutation** — hidden in readonly mode

Creates a new epic.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `title` | Yes | — | Epic title |
| `description` | Yes | — | Epic description (markdown supported) |
| `status` | No | `"open"` | Status: `open`, `in_progress`, `done`, `cancelled` |
| `tags` | No | — | Array of tags |

### Returns

`{ epicId }` — the generated epic ID.

---

## epics_update {#epics_update}

> **Mutation** — hidden in readonly mode

Partially updates an epic. Only send fields you want to change.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `epicId` | Yes | Epic ID to update |
| `title` | No | New title |
| `description` | No | New description |
| `status` | No | New status: `open`, `in_progress`, `done`, `cancelled` |
| `tags` | No | New tags array |

### Returns

`{ epicId, updated }`.

---

## epics_delete {#epics_delete}

> **Mutation** — hidden in readonly mode

Deletes the epic and all its `belongs_to` edges. Linked tasks are not deleted — they are simply unlinked from the epic.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `epicId` | Yes | Epic ID to delete |

### Returns

`{ epicId, deleted }`.

---

## epics_get

Fetches an epic with its linked tasks and progress information.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `epicId` | Yes | Epic ID |

### Returns

`{ id, title, description, status, tags, createdAt, updatedAt, progress, tasks }` — where `progress` is `{ done, total }` and `tasks` is an array of linked task summaries.

---

## epics_list

Lists epics with optional filters.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `status` | No | — | Filter by status |
| `tag` | No | — | Filter by tag |
| `filter` | No | — | Substring match on title |
| `limit` | No | 50 | Maximum results |

### Returns

Array of `{ id, title, description, status, tags, createdAt, updatedAt, progress }`.

:::note
Descriptions are truncated to 500 characters in list results. Use `epics_get` to retrieve the full description.
:::

---

## epics_search

Hybrid semantic search over epics.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query (natural language) |
| `topK` | No | 5 | Seed results for BFS |
| `maxResults` | No | 5 | Maximum results |
| `minScore` | No | 0.5 | Minimum relevance score |
| `searchMode` | No | `hybrid` | `hybrid`, `vector`, or `keyword` |

### Returns

Array of `{ id, title, description, status, tags, score }`.

---

## epics_link_task {#epics_link_task}

> **Mutation** — hidden in readonly mode

Links a task to an epic. Each task can belong to at most one epic. If the task already belongs to a different epic, the old link is replaced.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `epicId` | Yes | Epic ID |
| `taskId` | Yes | Task ID to link |

### Returns

`{ epicId, taskId, linked }`.

---

## epics_unlink_task {#epics_unlink_task}

> **Mutation** — hidden in readonly mode

Removes a task from an epic.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `epicId` | Yes | Epic ID |
| `taskId` | Yes | Task ID to unlink |

### Returns

`{ epicId, taskId, unlinked }`.
