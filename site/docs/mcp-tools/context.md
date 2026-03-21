---
title: "Context Tools"
sidebar_label: "Context"
sidebar_position: 2
description: "The get_context tool returns project info and workspace context — always call it first."
keywords: [get_context, MCP context, project info, workspace]
---

# Context Tools

The context tool tells your AI assistant what project it is connected to and whether it belongs to a workspace. It should be the first tool called in any session.

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
| `hasWorkspace` | boolean | Whether this project belongs to a workspace |

### Example response

```json
{
  "projectId": "my-app",
  "workspaceId": "backend",
  "workspaceProjects": ["api-gateway", "catalog-service"],
  "hasWorkspace": true
}
```

### When to use

Call `get_context` at the start of every session. It tells you:

- **The project ID** — needed for cross-project links in workspaces.
- **Workspace info** — discover sibling projects you can reference.
- **Whether a workspace exists** — `hasWorkspace` indicates if cross-project links are possible.
