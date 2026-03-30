---
title: "Task Tools"
sidebar_label: "Tasks"
sidebar_position: 9
description: "17 MCP tools for managing tasks — create, update, move, reorder, bulk operations, link, search, and attach files to tasks with Kanban workflow support."
keywords: [task tools, tasks_create, tasks_move, tasks_link, kanban, task management, cross-graph links]
---

# Task Tools

These 17 tools manage the **task graph** — a Kanban-style task system with priorities, assignees, due dates, and cross-graph context. Tasks are mirrored to `.tasks/` markdown files for IDE access.

:::info
These tools are **always available**. Mutation tools (marked below) are hidden when the task graph is set to `readonly`.
:::

## tasks_create {#tasks_create}

> **Mutation** — hidden in readonly mode

Creates a new task.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `title` | Yes | — | Task title |
| `description` | Yes | — | Task description (markdown supported) |
| `priority` | Yes | — | Priority: `critical`, `high`, `medium`, `low` |
| `status` | No | `"backlog"` | Status: `backlog`, `todo`, `in_progress`, `review`, `done`, `cancelled` |
| `tags` | No | — | Array of tags |
| `dueDate` | No | — | Due date as Unix timestamp in milliseconds |
| `estimate` | No | — | Estimated effort in hours (number) |
| `assignee` | No | — | Assignee name or ID |

### Returns

`{ taskId }` — the generated task ID.

---

## tasks_update {#tasks_update}

> **Mutation** — hidden in readonly mode

Partially updates a task. Only send fields you want to change.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Task ID to update |
| All tasks_create fields | No | Any field from tasks_create can be updated |
| `expectedVersion` | No | Current version for optimistic locking — fails with `version_conflict` if the task has been updated since |

### Returns

`{ taskId, updated }`.

:::tip
Use `tasks_move` instead of `tasks_update` for status changes — it handles `completedAt` automatically.
:::

---

## tasks_delete {#tasks_delete}

> **Mutation** — hidden in readonly mode

Deletes the task, all its relations, proxy nodes, and mirror directory.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Task ID to delete |

### Returns

`{ taskId, deleted }`.

---

## tasks_get

Fetches a task with all its relations and cross-graph links.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Task ID |

### Returns

`{ id, title, description, status, priority, tags, dueDate, estimate, assignee, completedAt, createdAt, updatedAt, version, attachments, subtasks, blockedBy, blocks, related, crossLinks? }` — includes resolved relation arrays.

---

## tasks_list

Lists tasks with optional filters, sorted by priority (critical first) then due date (earliest first, nulls last).

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `status` | No | — | Filter by status |
| `priority` | No | — | Filter by priority |
| `tag` | No | — | Filter by tag |
| `filter` | No | — | Substring match on title |
| `assignee` | No | — | Filter by assignee |
| `limit` | No | 50 | Maximum results |

### Returns

Array of `{ id, title, description, status, priority, tags, dueDate, estimate, assignee, completedAt, version, createdAt, updatedAt, attachments }`.

:::note
Descriptions are truncated to 500 characters in list results. Use `tasks_get` to retrieve the full description.
:::

---

## tasks_search

Hybrid semantic search over tasks.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query (natural language) |
| `topK` | No | 5 | Seed results for BFS |
| `bfsDepth` | No | 1 | BFS expansion hops |
| `maxResults` | No | 5 | Maximum results |
| `minScore` | No | 0.5 | Minimum relevance score |
| `bfsDecay` | No | 0.8 | Score decay per hop |
| `searchMode` | No | `hybrid` | `hybrid`, `vector`, or `keyword` |

### Returns

Array of `{ id, title, description, status, priority, tags, score }`.

---

## tasks_move {#tasks_move}

> **Mutation** — hidden in readonly mode

Changes a task's status with automatic `completedAt` management.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Task ID |
| `status` | Yes | New status |
| `expectedVersion` | No | Current version for optimistic locking — fails with `version_conflict` if the task has been updated since |

### Returns

`{ taskId, status, completedAt }`.

### Behavior

- Moving to `done` or `cancelled` automatically sets `completedAt` to now.
- Moving to any other status automatically clears `completedAt`.

### When to use

Always use `tasks_move` instead of `tasks_update` for status changes. It properly manages completion timestamps.

---

## tasks_reorder {#tasks_reorder}

> **Mutation** — hidden in readonly mode

Sets the display order of tasks within a status column. Pass an ordered array of task IDs to define their position. Tasks not included in the array keep their existing order and appear after the explicitly ordered ones.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `status` | Yes | The status column to reorder (e.g., `todo`, `in_progress`) |
| `taskIds` | Yes | Ordered array of task IDs defining the new display order |

### Returns

`{ status, ordered }` — the status column and the number of tasks reordered.

### When to use

Use `tasks_reorder` when the priority-based default sort is not sufficient and you need manual control over task ordering within a column, such as arranging a sprint backlog or ordering items for a review queue.

---

## tasks_bulk_move {#tasks_bulk_move}

> **Mutation** — hidden in readonly mode

Move multiple tasks to a new status in one operation.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskIds` | Yes | Array of task IDs to move (1–100) |
| `status` | Yes | Target status for all tasks |

### Returns

`{ moved }` — array of task IDs that were successfully moved. Tasks that don't exist are silently skipped.

---

## tasks_bulk_priority {#tasks_bulk_priority}

> **Mutation** — hidden in readonly mode

Update priority for multiple tasks in one operation.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskIds` | Yes | Array of task IDs to update (1–100) |
| `priority` | Yes | New priority for all tasks |

### Returns

`{ updated }` — array of task IDs that were successfully updated.

---

## tasks_bulk_delete {#tasks_bulk_delete}

> **Mutation** — hidden in readonly mode

Delete multiple tasks in one operation. This action is irreversible.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskIds` | Yes | Array of task IDs to delete (1–100) |

### Returns

`{ deleted }` — array of task IDs that were successfully deleted.

---

## tasks_link {#tasks_link}

> **Mutation** — hidden in readonly mode

Creates a relation between two tasks.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `fromId` | Yes | Source task ID |
| `toId` | Yes | Target task ID |
| `kind` | Yes | Relation type: `subtask_of`, `blocks`, or `related_to` |

### Returns

`{ fromId, toId, kind, created }`.

---

## tasks_create_link {#tasks_create_link}

> **Mutation** — hidden in readonly mode

Links a task to another task (same-graph) or to a node in the docs, code, files, knowledge, or skills graph (cross-graph). Omit `targetGraph` for task-to-task links.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Source task ID |
| `targetId` | Yes | Target task ID (same-graph) or target node ID in external graph (cross-graph) |
| `targetGraph` | No | Target graph: `"docs"`, `"code"`, `"files"`, `"knowledge"`, `"skills"`. Omit for task-to-task links. |
| `kind` | Yes | Relation type (free-form string) |
| `projectId` | No | Target project ID (for cross-project links) |

### Returns

`{ taskId, targetId, targetGraph, kind, created }`.

### When to use

Connect tasks to the code, docs, or files they relate to. For instance, link a bug fix task to the function it modifies.

---

## tasks_delete_link {#tasks_delete_link}

> **Mutation** — hidden in readonly mode

Deletes a link from a task to another task (same-graph) or to a node in an external graph (cross-graph). Omit `targetGraph` for task-to-task links. Orphaned proxy nodes are cleaned up automatically.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Task ID |
| `targetId` | Yes | Target node ID |
| `targetGraph` | No | Target graph. Omit for task-to-task links. |
| `projectId` | No | Target project ID |

### Returns

`{ taskId, targetId, deleted }`.

---

## tasks_find_linked

Reverse lookup: finds all tasks that link to a specific node in another graph.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `targetId` | Yes | Target node ID |
| `targetGraph` | Yes | Which graph the target is in |
| `kind` | No | Filter by relation kind |
| `projectId` | No | Target project ID |

### Returns

Array of `{ taskId, title, kind, status, priority, tags }`.

### When to use

Before modifying code, check for related tasks. For instance: "Are there open tasks related to this file?"

---

## tasks_add_attachment {#tasks_add_attachment}

> **Mutation** — hidden in readonly mode

Attaches a file to a task.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Task ID |
| `filePath` | Yes | Absolute path to the file on disk |

### Returns

`{ filename, mimeType, size, addedAt }`.

:::note
Max 10 MB per file. Max 20 attachments per entity.
:::

---

## tasks_remove_attachment {#tasks_remove_attachment}

> **Mutation** — hidden in readonly mode

Removes a file attachment from a task.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `taskId` | Yes | Task ID |
| `filename` | Yes | Filename to remove |

### Returns

`{ deleted: filename }`.
