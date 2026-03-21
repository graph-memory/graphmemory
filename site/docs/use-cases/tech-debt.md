---
title: "Tech Debt Tracking"
sidebar_label: "Tech Debt Tracking"
sidebar_position: 4
description: "Track and manage technical debt by linking tasks to code symbols, prioritizing work, and monitoring progress."
keywords: [tech debt, technical debt, tasks, kanban, code quality, tracking, prioritization]
---

# Tech Debt Tracking

**Scenario:** Your team wants to systematically track technical debt, link it to specific code, and manage remediation over time.

## The Problem

Technical debt accumulates silently. TODO comments in code are forgotten. Refactoring ideas live in people's heads. Without a structured way to track debt and connect it to the affected code, it grows until it becomes a crisis.

## The Workflow

### 1. Create Tasks for Debt Items

When you identify technical debt, create a task:

```
create_task({
  title: "Refactor auth middleware to use strategy pattern",
  description: "The current auth middleware has a growing switch statement for different auth methods (JWT, API key, OAuth). This should be refactored to a strategy pattern for extensibility.",
  priority: "medium",
  status: "backlog",
  tags: ["tech-debt", "auth", "refactoring"]
})
```

Use consistent tags like `tech-debt` to make filtering easy.

### 2. Link Tasks to Code

Connect the task to the specific code that needs attention:

```
create_task_link({
  taskId: "refactor-auth-middleware-to-use-strategy-pattern",
  targetId: "src/middleware/auth.ts::authenticate",
  targetGraph: "code",
  kind: "fixes"
})
```

Now when anyone works on `auth.ts`, they can discover the linked debt item:

```
find_linked_tasks({ targetId: "src/middleware/auth.ts", targetGraph: "code" })
```

### 3. Prioritize

List debt items by priority:

```
list_tasks({ tag: "tech-debt", status: "backlog" })
list_tasks({ tag: "tech-debt", priority: "high" })
```

Search for debt related to a specific area:

```
search_tasks({ query: "authentication refactoring" })
```

### 4. Track Progress

Move tasks through the kanban workflow as work progresses:

```
move_task({ taskId: "refactor-auth-middleware-to-use-strategy-pattern", status: "in_progress" })
```

The task workflow follows: `backlog` → `todo` → `in_progress` → `review` → `done`

When completed:

```
move_task({ taskId: "refactor-auth-middleware-to-use-strategy-pattern", status: "done" })
```

`move_task` automatically sets `completedAt` when moving to `done`.

### 5. Create Dependency Chains

Some debt items depend on others:

```
link_task({
  fromId: "refactor-auth-middleware-to-use-strategy-pattern",
  toId: "add-oauth-provider-support",
  kind: "blocks"
})
```

View the full dependency graph for a task:

```
get_task({ taskId: "add-oauth-provider-support" })
```

This returns `blockedBy`, `blocks`, `subtasks`, and `related` items.

### 6. Document the Why

Create knowledge notes to explain the context behind debt items:

```
create_note({
  title: "Auth middleware technical debt context",
  content: "The auth middleware was originally designed for JWT-only auth. As we added API keys and OAuth, the code became a growing conditional chain...",
  tags: ["tech-debt", "auth"]
})

create_relation({
  fromId: "auth-middleware-technical-debt-context",
  toId: "refactor-auth-middleware-to-use-strategy-pattern",
  targetGraph: "tasks",
  kind: "documents"
})
```

## Key Tools

| Tool | Purpose |
|------|---------|
| `create_task` | Create a debt tracking item |
| `create_task_link` | Link task to affected code |
| `find_linked_tasks` | Discover debt when working on code |
| `list_tasks` | Filter by tag, priority, or status |
| `search_tasks` | Find debt items by concept |
| `move_task` | Track remediation progress |
| `link_task` | Create dependency chains |
| `get_task` | See full task details with dependencies |
| `create_note` | Document context behind debt items |

## Tips

- Use a consistent `tech-debt` tag across all debt tasks for easy filtering.
- Link debt tasks to specific code symbols, not just files — this makes them discoverable when the exact function is being modified.
- Review the debt backlog periodically with `list_tasks({ tag: "tech-debt", status: "backlog" })`.
- When fixing debt, update the task status — the kanban board in the Web UI gives a visual overview of progress.
