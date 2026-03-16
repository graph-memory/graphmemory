# Tasks API

## Endpoints

### Create Task

```http
POST /api/projects/:projectId/tasks
```

**Request body:**

```json
{
  "title": "Implement user authentication",
  "description": "Add JWT-based auth with refresh tokens",
  "status": "todo",
  "priority": "high",
  "type": "feature",
  "assigneeId": "uuid-here",
  "parentId": null,
  "tags": ["auth", "security"],
  "dueDate": 1710892800000,
  "estimate": 8
}
```

**Response:** `201 Created`

### List Tasks

```http
GET /api/projects/:projectId/tasks
```

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |
| status | string[] | all | Filter by status |
| priority | string[] | all | Filter by priority |
| assigneeId | UUID | - | Filter by assignee |
| tags | string[] | - | Filter by tags |
| sortBy | string | position | Sort field |
| sortOrder | asc/desc | asc | Sort direction |

**Sort fields:** `priority`, `status`, `dueDate`, `title`, `createdAt`, `position`

**Response:** `200 OK`

```json
{
  "items": [...],
  "total": 42,
  "page": 1,
  "limit": 20,
  "hasMore": true
}
```

### Get Task

```http
GET /api/tasks/:taskId
```

**Response:** `200 OK`

### Update Task

```http
PATCH /api/tasks/:taskId
```

**Request body:** (all fields optional)

```json
{
  "title": "Updated title",
  "description": "Updated description",
  "priority": "critical",
  "type": "bug",
  "tags": ["auth", "security", "urgent"],
  "dueDate": 1710892800000,
  "estimate": 12
}
```

**Response:** `200 OK`

### Move Task (Change Status)

```http
POST /api/tasks/:taskId/move
```

**Request body:**

```json
{
  "status": "in_progress"
}
```

Automatically manages `completedAt`:
- Moving to `done`/`cancelled` → sets `completedAt`
- Moving from `done`/`cancelled` → clears `completedAt`

**Response:** `200 OK`

### Assign Task

```http
POST /api/tasks/:taskId/assign
```

**Request body:**

```json
{
  "assigneeId": "uuid-here"
}
```

Set `assigneeId` to `null` to unassign.

**Response:** `200 OK`

### Delete Task

```http
DELETE /api/tasks/:taskId
```

Fails with `400` if task has subtasks.

**Response:** `204 No Content`

### Search Tasks

```http
GET /api/projects/:projectId/tasks/search?q=authentication&limit=20
```

**Response:** `200 OK`

### Log Time

```http
POST /api/tasks/:taskId/time
```

**Request body:**

```json
{
  "hours": 2.5
}
```

**Response:** `200 OK`

### Get Subtasks

```http
GET /api/tasks/:taskId/subtasks
```

**Response:** `200 OK`

### Get Activity Log

```http
GET /api/tasks/:taskId/activities?limit=50
```

**Response:** `200 OK`

### Get Overdue Tasks

```http
GET /api/projects/:projectId/tasks/overdue
```

**Response:** `200 OK`

## Task Lifecycle

```
backlog ──→ todo ──→ in_progress ──→ review ──→ done
                         ↑              │
                         └──────────────┘
                    (needs more work)

Any status ──→ cancelled
```

## Error Responses

```json
{
  "code": "VALIDATION_ERROR",
  "errors": ["title must be at least 1 characters"]
}
```

```json
{
  "code": "NOT_FOUND",
  "message": "Task not found: uuid-here"
}
```

```json
{
  "code": "HAS_SUBTASKS",
  "message": "Cannot delete task with subtasks"
}
```
