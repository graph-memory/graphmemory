---
title: "Team Management"
sidebar_label: "Team Management"
sidebar_position: 4
description: "Manage team members with .team/ directory files for task assignment and filtering."
keywords: [team, members, assignee, tasks, team directory, YAML, frontmatter]
---

# Team Management

Graph Memory tracks team members as markdown files in a `.team/` directory. Team members can be assigned to tasks, and tasks can be filtered by assignee.

## The .team/ Directory

Team member files live in the project directory (or workspace `mirrorDir`):

```
your-project/
  .team/
    alice.md
    bob.md
    charlie.md
```

Each file represents one team member. The filename (without `.md`) is the member ID.

## File Format

Each team member file uses YAML frontmatter:

```markdown
---
name: Alice
email: alice@example.com
---
# Alice
```

| Field | Description |
|-------|-------------|
| `name` | Display name shown in the UI and MCP tools |
| `email` | Email address |

The file ID is derived from the filename — `alice.md` becomes team member `alice`.

## Adding Team Members

Create a markdown file in `.team/` with the format above. That's it — Graph Memory picks it up automatically.

If an `author` is configured in `graph-memory.yaml`, a team member file is auto-created for that author on the first mutation (creating a note, task, or skill). This ensures the configured author always appears in the team list.

## Task Assignment

Tasks have an `assignee` field that references a team member ID:

```
tasks_create({
  title: "Fix auth redirect loop",
  priority: "high",
  status: "todo",
  assignee: "alice"
})
```

The assignee appears in:

- **MCP tools** — `tasks_create`, `tasks_update`, `tasks_list`, `tasks_get`
- **REST API** — all task endpoints
- **Web UI** — kanban board cards, task detail view, and the filter bar

## Filtering Tasks by Assignee

Use `tasks_list` with the assignee filter to see a team member's workload:

```
tasks_list({ assignee: "alice" })
```

In the Web UI, use the filter bar on the kanban board to show tasks for a specific team member.

## Team Members vs. Users

Team members and config users are separate concepts:

| Concept | Purpose | Storage |
|---------|---------|---------|
| **Users** | Authentication and access control | `users:` section in `graph-memory.yaml` |
| **Team members** | Task assignment and display names | `.team/*.md` files in the project directory |

A person can be both a user (for login) and a team member (for task assignment), but they are not automatically linked. Users are defined in the YAML config with passwords and API keys. Team members are simple markdown files with a name and email.

## Workspace Teams

For workspace projects, the team directory is in the workspace `mirrorDir`:

```yaml
workspaces:
  backend:
    projects: [api-gateway, catalog-service]
    mirrorDir: "/data/backend-workspace"
```

Team files go in `/data/backend-workspace/.team/` and are shared across all projects in the workspace.

## REST API

The team list is available via the REST API:

```
GET /api/projects/:id/team
```

Returns:

```json
[
  { "id": "alice", "name": "Alice", "email": "alice@example.com" },
  { "id": "bob", "name": "Bob", "email": "bob@example.com" }
]
```
