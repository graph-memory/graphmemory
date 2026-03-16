# Projects API

## Endpoints

### Create Project

```http
POST /api/teams/:teamId/projects
```

**Request body:**

```json
{
  "name": "TaskFlow Mobile App",
  "description": "React Native mobile client for TaskFlow",
  "tags": ["mobile", "react-native"]
}
```

Project slug is auto-generated from the name.

**Response:** `201 Created`

### List Projects

```http
GET /api/teams/:teamId/projects?status=active&page=1&limit=20
```

**Query parameters:**

| Parameter | Type | Default |
|-----------|------|---------|
| status | string | all |
| page | number | 1 |
| limit | number | 20 |
| sortBy | string | updatedAt |
| sortOrder | asc/desc | desc |

**Response:** `200 OK`

### Get Project

```http
GET /api/projects/:projectId
```

**Response:** `200 OK`

### Get Project by Slug

```http
GET /api/projects/slug/:slug
```

**Response:** `200 OK`

### Update Project

```http
PATCH /api/projects/:projectId
```

**Request body:**

```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "tags": ["mobile", "v2"]
}
```

**Response:** `200 OK`

### Archive Project

```http
POST /api/projects/:projectId/archive
```

Archives the project. All tasks remain accessible but no new tasks can be created.

**Response:** `200 OK`

### Delete Project

```http
DELETE /api/projects/:projectId
```

Permanently deletes the project and all associated data.

**Response:** `204 No Content`

### Get Project Stats

```http
GET /api/projects/:projectId/stats
```

**Response:**

```json
{
  "totalTasks": 42,
  "byStatus": {
    "backlog": 5,
    "todo": 10,
    "in_progress": 8,
    "review": 4,
    "done": 12,
    "cancelled": 3
  },
  "byPriority": {
    "critical": 2,
    "high": 8,
    "medium": 20,
    "low": 12
  },
  "byType": {
    "feature": 15,
    "bug": 10,
    "chore": 12,
    "spike": 3,
    "epic": 2
  },
  "avgCompletionTime": 172800000,
  "overdueCount": 3,
  "completionRate": 0.357,
  "velocity": [8, 12, 10, 15, 11]
}
```

## Project Settings

### Workflow Configuration

Projects use a configurable kanban workflow:

```json
{
  "workflow": {
    "columns": [
      { "id": "backlog", "name": "Backlog", "color": "#6b7280" },
      { "id": "todo", "name": "To Do", "color": "#3b82f6" },
      { "id": "in_progress", "name": "In Progress", "color": "#f59e0b", "wipLimit": 5 },
      { "id": "review", "name": "Review", "color": "#8b5cf6", "wipLimit": 3 },
      { "id": "done", "name": "Done", "color": "#22c55e" },
      { "id": "cancelled", "name": "Cancelled", "color": "#ef4444" }
    ],
    "transitions": [
      { "from": "backlog", "to": "todo" },
      { "from": "todo", "to": "in_progress" },
      { "from": "in_progress", "to": "review" },
      { "from": "review", "to": "done" },
      { "from": "review", "to": "in_progress" },
      { "from": "*", "to": "cancelled" }
    ]
  }
}
```

### WIP Limits

Work-in-progress limits can be set per column. When the limit is reached, new tasks cannot be moved into that column until existing tasks are moved out.

### Auto-Close Stale Tasks

When enabled, tasks that have been in `backlog` for longer than `staleDays` are automatically moved to `cancelled`.
