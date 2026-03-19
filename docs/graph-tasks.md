# TaskGraph

**Files**: `src/graphs/task.ts`, `src/graphs/task-types.ts`

Task tracking with kanban workflow, priorities, due dates, estimates, assignees, and cross-graph links. CRUD-only graph — not populated by the indexer.

## Data model

### Node attributes

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Task title |
| `description` | string | Task description (markdown) |
| `status` | TaskStatus | Kanban column |
| `priority` | TaskPriority | Priority level |
| `tags` | string[] | Free-form tags |
| `dueDate` | number \| null | Epoch ms |
| `estimate` | number \| null | Hours or story points |
| `assignee` | string \| null | Team member ID (from `.team/` directory) |
| `completedAt` | number \| null | Auto-set on done/cancelled |
| `version` | number | Incremented on every mutation (starts at 1) |
| `embedding` | number[] | L2-normalized vector |
| `createdAt` | number | Epoch ms |
| `updatedAt` | number | Epoch ms |
| `createdBy` | string | Author |
| `updatedBy` | string | Author |
| `proxyFor` | object | Present only on phantom proxy nodes |

### Statuses

```typescript
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
```

### Priorities

```typescript
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
```

Priority sort order: critical (0) → high (1) → medium (2) → low (3).

### Node ID format

Slug from title: `"implement-auth"`. Duplicates get `"implement-auth::2"`.

### Edge types (task-to-task)

| Kind | Description |
|------|-------------|
| `subtask_of` | task → parent task |
| `blocks` | task → blocked task |
| `related_to` | free-form relation |

### Cross-graph links

`create_task_link` supports `targetGraph: "docs" | "code" | "files" | "knowledge" | "skills"`.

## Automatic completedAt management

`move_task` automatically manages the `completedAt` field:
- Moving to `done` or `cancelled` → sets `completedAt` to current time
- Moving to any other status → clears `completedAt` (reopening)

## Sorting

`list_tasks` sorts by:
1. Priority (critical first → low last)
2. dueDate ascending (nulls last)

## Enriched get_task

`get_task` returns additional enrichment:
- `subtasks` — tasks where this task is the parent
- `blockedBy` — tasks that block this task
- `blocks` — tasks that this task blocks
- `related` — tasks with `related_to` edges

## Attachments

Tasks support file attachments stored in `.tasks/{id}/` alongside the `task.md` mirror file.

## File mirror

Every mutation writes `.tasks/{id}/task.md`:

```markdown
---
id: fix-auth-bug
status: in_progress
priority: high
tags: [auth]
assignee: alice
dueDate: 2026-03-20T00:00:00.000Z
estimate: 4
completedAt: null
createdAt: 2026-03-16T10:00:00.000Z
updatedAt: 2026-03-16T10:05:00.000Z
relations:
  - to: my-note
    graph: knowledge
    kind: relates_to
---

# Fix Auth Bug

Description here...
```

See [File Mirror](file-mirror.md) for details.

## Manager: TaskGraphManager

### CRUD operations

| Method | Description |
|--------|-------------|
| `createTask(fields)` | Create task, embed, mirror to file |
| `updateTask(taskId, fields)` | Partial update, re-embed, re-mirror |
| `deleteTask(taskId)` | Delete task, relations, proxies, mirror dir |
| `getTask(taskId)` | Fetch with enrichment (subtasks, blocks, etc.) |
| `listTasks(opts)` | List with filters (status, priority, tag, assignee) |
| `searchTasks(query, opts)` | Hybrid search with BFS expansion |
| `moveTask(taskId, status)` | Change status, manage completedAt |

### Link operations

| Method | Description |
|--------|-------------|
| `linkTask(fromId, toId, kind)` | Create task-to-task relation |
| `createTaskLink(taskId, targetId, targetGraph)` | Cross-graph link |
| `deleteTaskLink(taskId, targetId, targetGraph)` | Remove cross-graph link |
| `findLinkedTasks(targetId, targetGraph)` | Reverse lookup |

### Attachment operations

| Method | Description |
|--------|-------------|
| `addAttachment(taskId, filename, content)` | Add file attachment |
| `removeAttachment(taskId, filename)` | Remove file attachment |

## Persistence

Stored as `tasks.json` in the `graphMemory` directory. In workspaces, shared across member projects.
