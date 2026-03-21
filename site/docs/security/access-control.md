---
title: "Access Control"
sidebar_label: "Access Control"
sidebar_position: 2
description: "Configure per-user, per-graph access control with a 4-level ACL system supporting deny, read-only, and read-write permissions."
keywords: [access control, ACL, permissions, readonly, deny, read-only, authorization]
---

# Access Control

Graph Memory provides a granular access control system that lets you control who can read and write to each graph, project, and workspace.

## Access levels

Three access levels are available:

| Level | Read | Write | Description |
|-------|------|-------|-------------|
| `rw` | Yes | Yes | Full read and write access |
| `r` | Yes | No | Read-only -- can search and view, but not create, edit, or delete |
| `deny` | No | No | No access -- graph is completely hidden |

## ACL resolution chain

When a user accesses a graph, their effective permission is resolved through a 4-level chain. The **first match wins**:

```
1. graph.access[userId]       ← most specific
2. project.access[userId]
3. workspace.access[userId]
4. server.access[userId]
5. server.defaultAccess       ← fallback
```

This means you can set a broad default and override it at any level.

## Default behavior

When no users are configured, `defaultAccess` is effectively `rw` -- everything is open. This maintains backward compatibility for single-user local setups.

When users are configured, you should explicitly set `defaultAccess` to control what unauthenticated or unconfigured users can do.

## Configuration examples

### Lock everything down, grant per user

```yaml
server:
  defaultAccess: deny
  access:
    admin: rw          # admin has full access everywhere

projects:
  my-app:
    access:
      alice: r         # alice can read this project

    graphs:
      knowledge:
        access:
          alice: rw    # alice can write to knowledge (overrides project-level r)
```

In this example:
- **admin** has `rw` access to all graphs in all projects (set at server level)
- **alice** can read all graphs in `my-app` (set at project level), except knowledge where she has `rw` (set at graph level)
- Everyone else is denied (server `defaultAccess: deny`)

### Shared read-only with selective write

```yaml
server:
  defaultAccess: r     # everyone can read everything

projects:
  docs-project:
    graphs:
      knowledge:
        access:
          editor: rw   # only editor can modify knowledge
      tasks:
        access:
          editor: rw   # only editor can modify tasks
```

### Per-workspace access

```yaml
projects:
  secrets:
    projectDir: ./internal/secrets
  docs:
    projectDir: ./public/docs

workspaces:
  internal:
    projects: [secrets]
    access:
      contractor: deny    # contractor cannot access internal workspace
  public:
    projects: [docs]
    access:
      contractor: rw      # contractor has full access to public workspace
```

## REST API enforcement

Access control is enforced at the route level:

- **Read endpoints** (GET, search operations) require `r` or `rw`
- **Mutation endpoints** (POST, PUT, DELETE) require `rw`
- Insufficient access returns **403 Forbidden**

## Web UI enforcement

The UI adapts to your access level for each graph:

- **`rw` access**: all features available -- create, edit, delete, drag-and-drop
- **`r` access**: browse and search only -- create/edit/delete buttons are hidden, kanban drag-and-drop is disabled
- **`deny` access**: the graph's page is hidden from the sidebar entirely

## MCP tool visibility

MCP handles access differently from the REST API. Instead of returning errors for unauthorized actions, the MCP server **hides tools entirely** based on the user's access:

| Access level | Read tools (list, get, search) | Mutation tools (create, update, delete) |
|-------------|-------------------------------|----------------------------------------|
| `rw` | Visible | Visible |
| `r` | Visible | Hidden |
| `deny` | Hidden | Hidden |

This means the AI assistant never sees tools it cannot use, avoiding confusion and wasted tool calls.

## Readonly mode

Individual graphs can be set to `readonly: true` in the configuration:

```yaml
projects:
  my-app:
    graphs:
      docs:
        readonly: true
```

When a graph is readonly:
- MCP mutation tools are not registered (hidden from all users)
- REST mutation endpoints return 403
- The UI hides write controls

Readonly applies regardless of the user's access level. Even a user with `rw` access cannot modify a readonly graph. This is useful for shared knowledge bases or reference documentation that should only be updated through the indexer or by an administrator editing files directly.
