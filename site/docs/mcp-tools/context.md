---
title: "Context Tools"
sidebar_label: "Context"
sidebar_position: 2
description: "The get_context tool returns project info, available graphs, and workspace context — always call it first."
keywords: [get_context, MCP context, project info, available graphs, workspace]
---

# Context Tools

The context tool tells your AI assistant what project it is connected to and which graphs are available. It should be the first tool called in any session.

## get_context

Returns the current project and workspace context.

### Parameters

None.

### Returns

| Field | Type | Description |
|-------|------|-------------|
| `projectId` | string | The project this session is connected to |
| `workspaceId` | string? | Workspace ID, if this project belongs to a workspace |
| `workspaceProjects` | string[]? | Other projects in the same workspace |
| `availableGraphs` | string[] | Which graphs are enabled (e.g. `["docs", "code", "knowledge", "tasks", "files", "skills"]`) |
| `userId` | string? | Authenticated user ID, if authentication is configured |

### Example response

```json
{
  "projectId": "my-app",
  "workspaceId": "backend",
  "workspaceProjects": ["api-gateway", "catalog-service"],
  "availableGraphs": ["docs", "code", "knowledge", "tasks", "files", "skills"]
}
```

### When to use

Call `get_context` at the start of every session. It tells you:

- **Which graphs are available** — so you know whether you can search docs, code, etc.
- **The project ID** — needed for cross-project links in workspaces.
- **Workspace info** — discover sibling projects you can reference.
