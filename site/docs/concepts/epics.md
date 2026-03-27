---
title: "Epics"
sidebar_label: "Epics"
sidebar_position: 6
description: "Epics group related tasks into larger initiatives with automatic progress tracking, status management, and task linking."
keywords: [epics, task grouping, progress tracking, initiatives, project planning]
---

# Epics

Epics are high-level initiatives that group related tasks together. While tasks represent individual units of work, epics represent the larger goals those tasks contribute to.

## Data model

Epics live in the **task graph** alongside tasks but are distinguished by a `nodeType` discriminator:

| Property | Tasks | Epics |
|----------|-------|-------|
| `nodeType` | `task` | `epic` |
| Graph | TaskGraph | TaskGraph |
| Statuses | `backlog`, `todo`, `in_progress`, `review`, `done`, `cancelled` | `open`, `in_progress`, `done`, `cancelled` |
| Tools | `tasks_*` (14 tools) | `epics_*` (8 tools) |

### Epic fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (derived from title) |
| `title` | What the epic is about |
| `description` | Detailed description (markdown) |
| `status` | Current status |
| `tags` | Free-form labels for filtering |
| `createdAt` | Creation timestamp |
| `updatedAt` | Last modification timestamp |
| `progress` | Computed: `{ done, total }` from linked tasks |

## Task-epic relationship

Tasks are linked to epics via `belongs_to` edges in the task graph:

```
Task A ──belongs_to──▶ Epic X
Task B ──belongs_to──▶ Epic X
Task C ──belongs_to──▶ Epic X
```

Key constraints:

- Each task can belong to **at most one epic** at a time.
- Linking a task to a new epic automatically removes the previous link.
- Deleting an epic removes all `belongs_to` edges but does **not** delete the linked tasks.
- Deleting a task removes its `belongs_to` edge from the epic.

Use `epics_link_task` and `epics_unlink_task` to manage these relationships.

## Epic statuses

| Status | Meaning |
|--------|---------|
| `open` | Epic created but work has not started |
| `in_progress` | Work is actively happening on linked tasks |
| `done` | All relevant work is complete |
| `cancelled` | Epic will not be completed |

Unlike tasks, epics do not have `backlog`, `todo`, or `review` statuses. Their lifecycle is intentionally simpler since the detailed workflow happens at the task level.

## Progress tracking

An epic's progress is computed automatically from its linked tasks:

- **`done`**: count of linked tasks with status `done`
- **`total`**: count of all linked tasks

For example, if an epic has 5 linked tasks and 3 of them are done, the progress is `{ done: 3, total: 5 }` (60%).

The web UI displays this as a progress bar on the epic card.

:::note
Cancelled tasks count toward the total but not toward done. If you want a cancelled task to stop affecting progress, unlink it from the epic.
:::

## Use cases

### Sprint or milestone planning

Group tasks that belong to the same sprint, milestone, or release:

```
epics_create({
  title: "v2.0 Release",
  description: "All tasks required for the v2.0 release.",
  tags: ["release", "v2.0"]
})
```

Then link relevant tasks:

```
epics_link_task({ epicId: "v2-0-release", taskId: "implement-auth-v2" })
epics_link_task({ epicId: "v2-0-release", taskId: "migrate-database" })
epics_link_task({ epicId: "v2-0-release", taskId: "update-api-docs" })
```

### Feature development

Track all tasks related to a large feature:

```
epics_create({
  title: "Authentication overhaul",
  description: "Replace the legacy auth system with OAuth 2.0 + PKCE.",
  tags: ["auth", "feature"]
})
```

### Workflow

A typical workflow with epics:

1. **Create an epic** for the initiative
2. **Create tasks** for the individual work items
3. **Link tasks** to the epic as they are identified
4. **Track progress** via `epics_get` or the web UI
5. **Move the epic** to `in_progress` when work begins
6. **Complete the epic** when all linked tasks are done (or enough are done to call it finished)

:::tip
Ask your AI assistant to check epic progress before standup meetings: "What's the status of the v2.0 release epic?" It will use `epics_get` to show you a summary of all linked tasks and their statuses.
:::
