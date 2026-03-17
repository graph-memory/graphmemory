# Task Tools

The task tools provide a full **kanban-style task management** system within Graph Memory. Tasks have status, priority, due dates, estimates, and can link to any other graph.

## Why tasks in Graph Memory?

Tasks here are tightly integrated with your project's knowledge graph:
- Link a task to the code files it affects
- Link a task to documentation that needs updating
- Link a task to knowledge notes for context
- Track dependencies between tasks (subtasks, blockers)

## Tool overview

| Tool | Purpose | Type |
|------|---------|------|
| `create_task` | Create a task | Mutation |
| `update_task` | Modify task fields | Mutation |
| `delete_task` | Remove a task and all its edges | Mutation |
| `get_task` | Read a task with all relations | Read |
| `list_tasks` | List tasks with filters | Read |
| `search_tasks` | Semantic search across tasks | Read |
| `move_task` | Change task status (kanban move) | Mutation |
| `link_task` | Create task-to-task relation | Mutation |
| `create_task_link` | Link task to external graph node | Mutation |
| `delete_task_link` | Remove cross-graph link | Mutation |
| `find_linked_tasks` | Reverse lookup: find tasks linked to an external node | Read |
| `add_task_attachment` | Attach a file to a task | Mutation |
| `remove_task_attachment` | Remove an attachment from a task | Mutation |

> **Mutation tools** are serialized through a queue to prevent concurrent graph modifications.

## Task properties

| Property | Type | Values / Format | Notes |
|----------|------|-----------------|-------|
| `title` | string | Free text | Becomes slug ID |
| `description` | string | Markdown | Full task description |
| `status` | enum | `backlog`, `todo`, `in_progress`, `review`, `done`, `cancelled` | Use `move_task` to change |
| `priority` | enum | `critical`, `high`, `medium`, `low` | Affects sort order |
| `tags` | string[] | Free-form | For filtering |
| `dueDate` | number | Unix timestamp in milliseconds | Optional deadline |
| `estimate` | number | Hours | Optional effort estimate |
| `completedAt` | number | Unix timestamp (auto-managed) | Set on done/cancelled, cleared on reopen |
| `createdAt` | number | Unix timestamp (auto) | Set at creation |
| `updatedAt` | number | Unix timestamp (auto) | Updated on every change |

## Task ID generation

Like notes, task IDs are slugified from the title:
- "Fix auth redirect loop" → `fix-auth-redirect-loop`
- Duplicates get suffixes: `fix-auth-redirect-loop::2`

## Tool reference

### create_task

Create a new task. Automatically embedded for semantic search.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `title` | string | Yes | — | Short title, e.g. `"Fix auth redirect loop"` |
| `description` | string | Yes | — | Full description (markdown) |
| `priority` | enum | Yes | — | `"critical"`, `"high"`, `"medium"`, `"low"` |
| `status` | enum | No | `"backlog"` | `"backlog"`, `"todo"`, `"in_progress"`, `"review"`, `"done"`, `"cancelled"` |
| `tags` | string[] | No | `[]` | Tags for filtering |
| `dueDate` | number | No | — | Due date as Unix timestamp in milliseconds |
| `estimate` | number | No | — | Estimated effort in hours |

**Returns:** `{ taskId }`

### update_task

Update an existing task. Only provided fields change. Re-embeds if title or description changes. Status changes auto-manage `completedAt`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID to update |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `status` | enum | No | New status |
| `priority` | enum | No | New priority |
| `tags` | string[] | No | Replace tags array (include all you want to keep) |
| `dueDate` | number \| null | No | New due date (ms timestamp), or `null` to clear |
| `estimate` | number \| null | No | New estimate (hours), or `null` to clear |

**Returns:** `{ taskId, updated: true }`

> Use `move_task` for a simpler status-only change — it's more explicit about `completedAt` management.

### delete_task

Delete a task and all its edges (relations + cross-graph links). Orphaned proxy nodes cleaned up automatically. **Irreversible.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID to delete |

**Returns:** `{ taskId, deleted: true }`

### get_task

Return full task details including all relations. This is the most complete view of a task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID to retrieve |

**Returns:**
```
{
  id, title, description, status, priority, tags,
  dueDate, estimate, completedAt, createdAt, updatedAt,
  subtasks: [{ id, title, status }],
  blockedBy: [{ id, title, status }],
  blocks: [{ id, title, status }],
  related: [{ id, title, status }]
}
```

The `subtasks`, `blockedBy`, `blocks`, and `related` arrays are automatically populated from task-to-task edges.

### list_tasks

List tasks with optional filters. Sorted by priority (critical → low) then due date (earliest first, nulls last).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | enum | No | — | Filter by status |
| `priority` | enum | No | — | Filter by priority |
| `tag` | string | No | — | Filter by tag (exact match, case-insensitive) |
| `filter` | string | No | — | Substring match on title or ID |
| `limit` | number | No | 50 | Maximum results |

**Returns:** `[{ id, title, description, status, priority, tags, dueDate, estimate, completedAt, createdAt, updatedAt }]`

### search_tasks

Semantic search over the task graph with BFS expansion.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language search query |
| `topK` | number | No | 5 | Seed nodes from vector search |
| `bfsDepth` | number | No | 1 | Hops to follow relations (0 = no expansion) |
| `maxResults` | number | No | 20 | Maximum results |
| `minScore` | number | No | 0.5 | Minimum relevance score (0–1) |
| `bfsDecay` | number | No | 0.8 | Score multiplier per hop |

**Returns:** `[{ id, title, description, status, priority, tags, score }]`

### move_task

Change task status. The preferred way to move tasks through the kanban workflow.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID to move |
| `status` | enum | Yes | New status: `"backlog"`, `"todo"`, `"in_progress"`, `"review"`, `"done"`, `"cancelled"` |

**Returns:** `{ taskId, status, completedAt }`

**Automatic behavior:**
- Moving to `done` or `cancelled` → sets `completedAt` to current time
- Moving from `done`/`cancelled` to any other status → clears `completedAt`

### link_task

Create a directed relation between two tasks.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromId` | string | Yes | Source task ID |
| `toId` | string | Yes | Target task ID |
| `kind` | enum | Yes | `"subtask_of"`, `"blocks"`, `"related_to"` |

**Returns:** `{ fromId, toId, kind, created: true }`

**Semantics:**
- `subtask_of` — `fromId` is a subtask of `toId` (child → parent)
- `blocks` — `fromId` blocks `toId` (blocker → blocked task)
- `related_to` — free association between tasks

### create_task_link

Link a task to a node in another graph (docs, code, files, or knowledge).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Source task ID |
| `targetId` | string | Yes | Target node ID in the external graph |
| `targetGraph` | enum | Yes | `"docs"`, `"code"`, `"files"`, `"knowledge"`, `"skills"` |
| `kind` | string | Yes | Relation type: `"references"`, `"fixes"`, `"implements"`, `"documents"`, etc. |

**Returns:** `{ taskId, targetId, targetGraph, kind, created: true }`

**Examples:**
```
create_task_link({ taskId: "fix-auth", targetId: "src/auth.ts::login", targetGraph: "code", kind: "fixes" })
create_task_link({ taskId: "update-docs", targetId: "guide.md::Authentication", targetGraph: "docs", kind: "updates" })
create_task_link({ taskId: "review-config", targetId: "src/config.ts", targetGraph: "files", kind: "references" })
create_task_link({ taskId: "implement-arch", targetId: "auth-architecture", targetGraph: "knowledge", kind: "implements" })
```

### delete_task_link

Remove a cross-graph link from a task. Orphaned proxy nodes cleaned up automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Source task ID |
| `targetId` | string | Yes | Target node ID in the external graph |
| `targetGraph` | enum | Yes | `"docs"`, `"code"`, `"files"`, `"knowledge"`, `"skills"` |

**Returns:** `{ taskId, targetId, targetGraph, deleted: true }`

### find_linked_tasks

Reverse lookup: given a node in an external graph, find all tasks that link to it.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `targetId` | string | Yes | Target node ID, e.g. `"src/auth.ts"`, `"guide.md::Setup"`, `"my-note"` |
| `targetGraph` | enum | Yes | `"docs"`, `"code"`, `"files"`, `"knowledge"`, `"skills"` |
| `kind` | string | No | Filter by relation kind. Omit for all relations |

**Returns:** `[{ taskId, title, kind, status, priority, tags }]`

**Use case:** When working on a file, call `find_linked_tasks({ targetId: "src/auth.ts", targetGraph: "code" })` to see all tasks related to that file.

### add_task_attachment

Attach a file to a task. The file is copied into the task's directory (`.tasks/{taskId}/`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID to attach the file to |
| `filePath` | string | Yes | Absolute path to the file on disk |

**Returns:** `{ taskId, attachment: { filename, mimeType, size } }`

### remove_task_attachment

Remove an attachment from a task. Deletes the file from disk.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID |
| `filename` | string | Yes | Filename of the attachment to remove |

**Returns:** `{ taskId, filename, deleted: true }`

## Kanban board UI

The Tasks page provides a visual kanban board with these features:

- **Column visibility** — toggle which status columns are shown via the column icon in the top bar; saved in localStorage
- **Drag-and-drop** — drag task cards between columns to change status; drop-zone highlights on hover
- **Inline task creation** — click "+" in a column header to quickly create a task in that status
- **Filter bar** — search tasks by text, filter by priority or tag
- **Due date indicators** — overdue tasks show a red badge, approaching deadlines (≤3 days) show yellow
- **Estimate badges** — tasks with estimates show hours on the card
- **Quick actions** — hover a card to see edit and delete buttons
- **Scrollable columns** — columns scroll independently when content overflows

## Tips

- Use `move_task` instead of `update_task` for status changes — it explicitly handles `completedAt`
- `get_task` returns the richest data — includes subtasks, blockers, and related tasks
- `list_tasks` is sorted by priority then due date — critical overdue tasks appear first
- Link tasks to code files they affect — makes it easy to find related tasks when working on code
- Use `search_tasks` to find tasks by meaning, not just title keywords
- `update_task` with `dueDate: null` or `estimate: null` clears those fields
- `update_task` with `tags` replaces the entire array — include all tags you want to keep
- Task-to-task `kind` values are a fixed enum (`subtask_of`, `blocks`, `related_to`), unlike knowledge relations which are free-form
- Tasks support file attachments — attach screenshots, logs, or any file via `add_task_attachment`
- Attachments are stored in `.tasks/{taskId}/` alongside the task's markdown file
