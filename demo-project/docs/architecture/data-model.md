# Data Model

## Entity Relationships

```
Team (1) ──────── (*) User
  │
  └──── (*) Project
              │
              ├──── (*) Task ──── (*) TaskComment
              │        │              │
              │        ├──── (*) TaskActivity
              │        │
              │        └──── (?) Task (parent/subtask)
              │
              └──── (*) WebhookConfig
```

## Core Entities

### User

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| email | string | Unique, lowercase |
| name | string | Display name |
| role | UserRole | admin, manager, member, viewer |
| teamId | UUID? | Team membership |
| preferences | UserPreferences | Theme, locale, notification settings |
| lastLoginAt | Timestamp? | Last successful login |

### Team

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | string | Team name |
| slug | string | URL-friendly identifier |
| ownerId | UUID | Team owner |
| memberIds | UUID[] | Team members |
| settings | TeamSettings | Visibility, limits, guests |

### Project

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | string | Project name |
| slug | string | URL-friendly identifier |
| status | ProjectStatus | active, archived, paused, completed |
| teamId | UUID | Owning team |
| ownerId | UUID | Project owner |
| settings | ProjectSettings | Workflow, WIP limits, auto-close |
| tags | string[] | Project-level tags |

### Task

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | string | Task title (max 200 chars) |
| description | string | Markdown description |
| status | TaskStatus | backlog → todo → in_progress → review → done/cancelled |
| priority | TaskPriority | critical, high, medium, low |
| type | TaskType | feature, bug, chore, spike, epic |
| projectId | UUID | Parent project |
| assigneeId | UUID? | Assigned user |
| reporterId | UUID | Creator |
| parentId | UUID? | Parent task (for subtasks) |
| tags | string[] | Task-level tags |
| dueDate | Timestamp? | Due date |
| estimate | number? | Estimated hours |
| timeSpent | number? | Logged hours |
| completedAt | Timestamp? | Completion timestamp |
| position | number | Sort order within column |

## Status Transitions

The default workflow defines these transitions:

```
backlog → todo → in_progress → review → done
                      ↑            │
                      └────────────┘ (re-review)

any status → cancelled
```

Transitions can be customized per project via `ProjectSettings.workflow`.

## Priority Ordering

Priority is ordered numerically for sorting:
- critical = 0 (highest)
- high = 1
- medium = 2
- low = 3 (lowest)

## Indexes and Performance

Recommended database indexes:

```sql
-- Task lookups
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL AND status NOT IN ('done', 'cancelled');
CREATE INDEX idx_tasks_parent ON tasks(parent_id) WHERE parent_id IS NOT NULL;

-- Full-text search
CREATE INDEX idx_tasks_search ON tasks USING gin(to_tsvector('english', title || ' ' || description));

-- Activity feed
CREATE INDEX idx_activities_task ON task_activities(task_id, created_at DESC);

-- Notification inbox
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
```

## Soft Deletes

Tasks and projects support soft deletion via status changes:
- Tasks → `cancelled` status
- Projects → `archived` status

Hard deletes are available but require explicit confirmation.
