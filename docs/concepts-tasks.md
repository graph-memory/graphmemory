# Task Management — Principles and Design

## The idea

Tasks in Graph Memory aren't just a todo list — they're a **knowledge-connected workflow**. Every task lives in the same graph ecosystem as code, documentation, notes, and skills. This means a task like "Fix auth redirect loop" can be directly linked to the code symbol it needs to change, the documentation that explains the expected behavior, the note that captured the original bug report, and the skill recipe for debugging auth issues.

## Kanban workflow

Tasks follow a kanban model with six statuses:

```
backlog → todo → in_progress → review → done
                                       → cancelled
```

| Status | Meaning |
|--------|---------|
| `backlog` | Identified but not prioritized |
| `todo` | Prioritized, ready to start |
| `in_progress` | Actively being worked on |
| `review` | Work complete, awaiting review |
| `done` | Completed |
| `cancelled` | Won't be done |

### Automatic completedAt

The `move_task` tool manages `completedAt` automatically:
- Moving to `done` or `cancelled` → sets `completedAt` to current time
- Moving from `done`/`cancelled` to any other status → clears `completedAt` (reopening)

This is also enforced when changing status via `update_task` — the automation is consistent regardless of how the status changes.

## Priority model

Four priority levels with explicit sort ordering:

| Priority | Sort order | Meaning |
|----------|-----------|---------|
| `critical` | 0 (first) | Drop everything, fix now |
| `high` | 1 | Important, do soon |
| `medium` | 2 | Normal priority |
| `low` | 3 | Nice to have |

### Sorting

`list_tasks` sorts by:
1. **Priority** (critical first → low last)
2. **Due date** (earliest first, null dates sort to the end)

This ensures the most urgent and time-sensitive tasks always appear at the top.

## Task relationships

Tasks connect to other tasks via three relationship types:

### `subtask_of` — hierarchy

```
"Write auth tests" → [subtask_of] → "Implement authentication"
```

Creates a parent-child hierarchy. `get_task` enriches the parent with its subtasks list.

### `blocks` — dependencies

```
"Fix database migration" → [blocks] → "Deploy v2.0"
```

Indicates that one task must be completed before another can proceed. `get_task` enriches with both `blockedBy` (incoming) and `blocks` (outgoing) lists.

### `related_to` — associations

```
"Update docs for auth" → [related_to] → "Fix auth redirect loop"
```

Free-form association for tasks that are related but don't have a dependency.

## Enriched task view

`get_task` returns more than just the task fields — it traverses the graph to include:

- **subtasks** — all tasks that have a `subtask_of` edge pointing to this task
- **blockedBy** — all tasks with `blocks` edges pointing to this task (things blocking us)
- **blocks** — all tasks this task blocks (things we're blocking)
- **related** — all tasks with `related_to` edges (both directions, deduplicated)
- **crossLinks** — links to docs, code, files, knowledge, skills nodes

This gives an LLM or UI a complete picture of a task's context in one call.

## Cross-graph links

Tasks can link to nodes in any other graph:

```
create_task_link({
  taskId: "fix-auth-redirect-loop",
  targetId: "src/auth.ts::login",
  targetGraph: "code",
  kind: "fixes"
})
```

This is powerful for:
- **Linking tasks to the code they modify** — "this task fixes this function"
- **Linking tasks to relevant docs** — "see the auth flow documentation"
- **Linking tasks to knowledge notes** — "the bug report note explains the root cause"
- **Linking tasks to skills** — "use this debugging recipe"

## Assignees and team

Tasks have an `assignee` field referencing a team member ID from the `.team/` directory. This enables:
- **Filtering** — "show me all tasks assigned to Alice"
- **Kanban views** — see who's working on what
- **Team awareness** — an LLM knows which person to ask about a task

See [Team Management](team.md) for details on the `.team/` directory.

## File mirror

Every task is mirrored to `.tasks/{id}/task.md` with full frontmatter:

```markdown
---
id: fix-auth-redirect-loop
status: in_progress
priority: high
tags: [auth, bug]
assignee: alice
dueDate: 2026-03-20T00:00:00.000Z
estimate: 4
completedAt: null
---

# Fix Auth Redirect Loop

When users log in with an expired session...
```

This means:
- Tasks are **version-controlled** alongside code
- You can **edit tasks in your IDE** — changes sync back to the graph
- Tasks **survive server restarts** (persisted as both JSON and markdown)
- Tasks support **file attachments** stored alongside the task.md file

## Why not just use Jira/Linear/GitHub Issues?

Graph Memory tasks aren't meant to replace your project management tool. They serve a different purpose:

1. **LLM-accessible** — an AI assistant can create, update, search, and relate tasks using MCP tools, without needing API keys for external services
2. **Contextually linked** — tasks are connected to code symbols, documentation sections, and knowledge notes in the same graph
3. **Local-first** — everything is in the project directory, works offline
4. **Semantically searchable** — "what tasks are related to authentication?" uses vector search, not just keyword matching
5. **Recipe-aware** — tasks can reference skills (recipes) for how to accomplish them

Think of them as **working memory** for the AI-human collaboration, not as a permanent project management system.

## Configuration

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphs:
      tasks:
        enabled: true           # can be disabled
        access:
          bob: r                # bob can only view tasks, not modify
```
