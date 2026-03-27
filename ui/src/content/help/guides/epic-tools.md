# Epic Tools

The epic tools provide **milestone-level grouping** for tasks within Graph Memory. Epics act as containers that organize related tasks under a common goal, making it easy to track progress across multiple work items.

## Why epics in Graph Memory?

Epics bridge the gap between individual tasks and project-level goals:
- Group related tasks under a single epic for high-level tracking
- Track overall progress as tasks within an epic are completed
- Link epics to documentation, code, and knowledge for full context
- Use statuses to manage the epic lifecycle from draft to archived

## Tool overview

| Tool | Purpose | Type |
|------|---------|------|
| `epics_create` | Create an epic | Mutation |
| `epics_update` | Modify epic fields | Mutation |
| `epics_delete` | Remove an epic and all its edges | Mutation |
| `epics_get` | Read an epic with all relations and linked tasks | Read |
| `epics_list` | List epics with filters | Read |
| `epics_search` | Semantic search across epics | Read |
| `epics_link_task` | Link a task to an epic (belongs_to) | Mutation |
| `epics_unlink_task` | Remove a task from an epic | Mutation |

> **Mutation tools** are serialized through a queue to prevent concurrent graph modifications.

## Epic properties

| Property | Type | Values / Format | Notes |
|----------|------|-----------------|-------|
| `title` | string | Free text | Becomes slug ID |
| `description` | string | Markdown | Full epic description |
| `status` | enum | `draft`, `active`, `completed`, `archived` | Epic lifecycle status |
| `tags` | string[] | Free-form | For filtering |
| `order` | number | Integer | Display position in lists |
| `createdAt` | number | Unix timestamp (auto) | Set at creation |
| `updatedAt` | number | Unix timestamp (auto) | Updated on every change |

## Epic ID generation

Like tasks and notes, epic IDs are slugified from the title:
- "Auth Overhaul" -> `auth-overhaul`
- Duplicates get suffixes: `auth-overhaul::2`

## Tool reference

### epics_create

Create a new epic. Automatically embedded for semantic search.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `title` | string | Yes | -- | Short title, e.g. `"Auth Overhaul"` |
| `description` | string | Yes | -- | Full description (markdown) |
| `status` | enum | No | `"draft"` | `"draft"`, `"active"`, `"completed"`, `"archived"` |
| `tags` | string[] | No | `[]` | Tags for filtering |

**Returns:** `{ epicId }`

### epics_update

Update an existing epic. Only provided fields change. Re-embeds if title or description changes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `epicId` | string | Yes | Epic ID to update |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `status` | enum | No | New status |
| `tags` | string[] | No | Replace tags array (include all you want to keep) |

**Returns:** `{ epicId, updated: true }`

### epics_delete

Delete an epic and all its edges (task links + cross-graph links). Tasks themselves are not deleted. **Irreversible.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `epicId` | string | Yes | Epic ID to delete |

**Returns:** `{ epicId, deleted: true }`

### epics_get

Return full epic details including linked tasks and cross-graph relations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `epicId` | string | Yes | Epic ID to retrieve |

**Returns:**
```
{
  id, title, description, status, tags, order,
  createdAt, updatedAt,
  tasks: [{ id, title, status, priority }],
  progress: { total, done, percentage }
}
```

The `tasks` array lists all tasks linked via `belongs_to` edges. The `progress` object summarizes completion.

### epics_list

List epics with optional filters. Sorted by order then creation date.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | enum | No | -- | Filter by status |
| `tag` | string | No | -- | Filter by tag (exact match, case-insensitive) |
| `filter` | string | No | -- | Substring match on title or ID |
| `limit` | number | No | 50 | Maximum results |

**Returns:** `[{ id, title, description, status, tags, order, createdAt, updatedAt }]`

### epics_search

Semantic search over the epic graph with BFS expansion.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | -- | Natural language search query |
| `topK` | number | No | 5 | Seed nodes (1-500) |
| `bfsDepth` | number | No | 1 | Hops to follow relations (0-10) |
| `maxResults` | number | No | 5 | Maximum results (1-500) |
| `minScore` | number | No | 0.5 | Minimum relevance score (0-1) |
| `bfsDecay` | number | No | 0.8 | Score multiplier per hop (0-1) |
| `searchMode` | string | No | `hybrid` | `hybrid`, `vector`, or `keyword` |

**Returns:** `[{ id, title, description, status, tags, score }]`

### epics_link_task

Link a task to an epic. Creates a `belongs_to` edge from the task to the epic.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `epicId` | string | Yes | Epic ID |
| `taskId` | string | Yes | Task ID to link |

**Returns:** `{ epicId, taskId, linked: true }`

### epics_unlink_task

Remove a task from an epic. Deletes the `belongs_to` edge.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `epicId` | string | Yes | Epic ID |
| `taskId` | string | Yes | Task ID to unlink |

**Returns:** `{ epicId, taskId, unlinked: true }`

## Progress tracking

When you call `epics_get`, the response includes a `progress` object that summarizes how many of the epic's linked tasks are in `done` or `cancelled` status. This gives a quick overview of epic completion without having to list all tasks individually.

## Tips

- Use `epics_list` to get a high-level overview of all work streams
- `epics_get` returns the richest data -- includes all linked tasks and progress summary
- Link tasks to epics as you create them to keep work organized from the start
- Use `epics_search` to find epics by meaning, not just title keywords
- Epic statuses follow a lifecycle: `draft` (planning) -> `active` (in progress) -> `completed` (done) -> `archived` (historical)
- Deleting an epic does not delete its tasks -- they become unlinked and remain in the task graph
- When the epic graph is configured as `readonly: true`, mutation tools (create, update, delete, link/unlink) are hidden from MCP clients and REST mutation endpoints return 403
