---
title: "Task Management"
sidebar_label: "Task Management"
sidebar_position: 5
description: "Manage tasks with a kanban workflow, priorities, and cross-graph links to code, docs, and knowledge notes."
keywords: [tasks, kanban, workflow, priorities, assignees, task links, project management]
---

# Task Management

Graph Memory includes a lightweight task management system. Unlike standalone project management tools, tasks here live alongside your code, documentation, and knowledge notes -- connected to the exact context they need.

## Creating tasks

```
tasks_create({
  title: "Fix auth redirect loop",
  description: "When users log in with an expired session, the app enters a redirect loop between /login and /dashboard.",
  priority: "high",
  tags: ["auth", "bug"]
})
```

Tasks support the following fields:

| Field | Description |
|-------|-------------|
| `title` | What needs to be done |
| `description` | Detailed description (markdown) |
| `status` | Workflow status (defaults to `backlog`) |
| `priority` | `critical`, `high`, `medium`, or `low` |
| `tags` | Free-form labels for filtering |
| `assignee` | Team member ID |
| `dueDate` | Deadline |
| `estimate` | Effort estimate (numeric, e.g., hours or story points) |
| `createdBy` | Author who created the task (set automatically from config) |
| `updatedBy` | Author who last updated the task (set automatically from config) |

## Kanban workflow

Tasks follow a kanban model with six statuses:

```
backlog → todo → in_progress → review → done
                                       → cancelled
```

| Status | Meaning |
|--------|---------|
| `backlog` | Identified but not prioritized yet |
| `todo` | Prioritized and ready to start |
| `in_progress` | Actively being worked on |
| `review` | Work complete, awaiting review |
| `done` | Completed |
| `cancelled` | Won't be done |

Move tasks between statuses with the `tasks_move` tool:

```
tasks_move({ taskId: "fix-auth-redirect-loop", status: "in_progress" })
```

:::info
When a task moves to `done` or `cancelled`, its completion timestamp is set automatically. If you reopen it by moving it back to another status, the timestamp is cleared.
:::

## Priorities

Four priority levels control how tasks are sorted:

| Priority | Meaning |
|----------|---------|
| `critical` | Drop everything, fix now |
| `high` | Important, do soon |
| `medium` | Normal priority |
| `low` | Nice to have |

When you list tasks, they are sorted by priority first (critical at the top), then by due date (earliest first). Tasks without a due date appear after those with one.

```
tasks_list({ status: "todo" })
```

## Optimistic locking

Every task has a `version` field that starts at 1 and increments on each mutation. The `tasks_update` and `tasks_move` tools accept an optional `expectedVersion` parameter. When provided, the operation succeeds only if the task's current version matches the expected value. If another update happened in between, the operation fails with a `version_conflict` error containing the current and expected versions. This prevents concurrent updates from silently overwriting each other.

## Task relationships

Tasks can be connected to other tasks in three ways:

### Subtasks

Break large tasks into smaller pieces:

```
tasks_link({
  fromId: "write-auth-tests",
  toId: "implement-authentication",
  kind: "subtask_of"
})
```

When you view the parent task with `tasks_get`, its subtasks are listed automatically.

### Dependencies

Indicate that one task blocks another:

```
tasks_link({
  fromId: "fix-database-migration",
  toId: "deploy-v2",
  kind: "blocks"
})
```

`tasks_get` shows both what a task blocks and what blocks it, so you can see the full dependency picture.

### Related tasks

For tasks that are associated but don't have a hard dependency:

```
tasks_link({
  fromId: "update-auth-docs",
  toId: "fix-auth-redirect-loop",
  kind: "related_to"
})
```

## Cross-graph context

Tasks become much more useful when linked to the rest of your project. You can connect a task to code, documentation, knowledge notes, files, or skills:

```
tasks_create_link({
  taskId: "fix-auth-redirect-loop",
  targetId: "src/auth.ts::login",
  targetGraph: "code",
  kind: "fixes"
})
```

Some practical uses:

- **Link to the code a task modifies** -- "this task fixes this function"
- **Link to relevant documentation** -- "see the auth flow docs for expected behavior"
- **Link to a knowledge note** -- "the bug investigation note explains the root cause"
- **Link to a skill** -- "use this debugging recipe to troubleshoot"

When you view a task with `tasks_get`, all cross-graph links are included in the response, giving your AI assistant full context about what the task involves.

:::tip
Before starting a task, ask your AI assistant to look up the task's cross-graph links. It can read the linked code, check the relevant documentation, and review any related knowledge notes -- all in one step.
:::

## Searching tasks

```
tasks_search({ query: "authentication issues" })
```

Task search uses the same hybrid approach as other graphs -- combining keyword matching with semantic similarity. You can also filter by status, priority, tag, or assignee when listing:

```
tasks_list({ status: "in_progress", tag: "auth" })
```

## Assignees

Tasks have an optional `assignee` field for team member tracking. This enables filtering tasks by who they're assigned to and seeing workload distribution.

## File mirror

Every task is automatically saved as a markdown file in your project's `.tasks/` directory:

```
.tasks/fix-auth-redirect-loop/task.md
```

The file includes full metadata in YAML frontmatter:

```markdown
---
id: fix-auth-redirect-loop
status: in_progress
priority: high
tags: [auth, bug]
assignee: alice
dueDate: 2026-03-20T00:00:00.000Z
estimate: 4
---

# Fix Auth Redirect Loop

When users log in with an expired session, the app enters a redirect loop
between /login and /dashboard.
```

### Editing in your IDE

You can open task files in your editor, modify the content or status, and save. Changes sync back to the graph automatically. This means you can:

- Edit task descriptions in your favorite editor
- Change task status by editing the frontmatter
- Commit tasks to git alongside your code
- Attach files by placing them in the task's directory (e.g., `.tasks/fix-auth-redirect-loop/screenshot.png`)

:::tip
The `.tasks/` directory works well with version control. Committing it means your task history is preserved alongside the code, and team members can see tasks without needing access to the Graph Memory server.
:::

## When to use Graph Memory tasks

Graph Memory tasks are not meant to replace full project management tools like Jira, Linear, or GitHub Issues. They serve a different purpose:

- **AI-accessible** -- your AI assistant can create, update, and search tasks without external API keys
- **Contextually linked** -- tasks connect directly to code symbols, doc sections, and knowledge notes
- **Local-first** -- everything lives in the project directory, works offline
- **Semantically searchable** -- find tasks by meaning, not just keywords

Think of them as **working memory** for AI-human collaboration -- a place to track what needs to happen and connect it to the relevant context.
