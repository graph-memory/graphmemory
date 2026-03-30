# WebSocket

**File**: `src/api/rest/websocket.ts`

Single WebSocket endpoint for real-time event push to connected clients.

## Endpoint

```
ws://localhost:3000/api/ws
```

## Event format

```json
{
  "projectId": "my-app",
  "type": "note:created",
  "data": { "noteId": "auth-uses-jwt" }
}
```

All events include `projectId` — the UI filters events client-side based on the currently selected project.

## Event types

### Knowledge events

| Type | Data | Trigger |
|------|------|---------|
| `note:created` | `{ noteId }` | Note created |
| `note:updated` | `{ noteId }` | Note updated |
| `note:deleted` | `{ noteId }` | Note deleted |
| `note:relation:added` | `{ noteId, toId, kind, targetGraph? }` | Relation/cross-link created |
| `note:relation:deleted` | `{ noteId, toId, kind, targetGraph? }` | Relation/cross-link removed |
| `note:attachment:added` | `{ noteId, filename }` | Attachment uploaded |
| `note:attachment:deleted` | `{ noteId, filename }` | Attachment removed |

### Task events

| Type | Data | Trigger |
|------|------|---------|
| `task:created` | `{ taskId }` | Task created |
| `task:updated` | `{ taskId }` | Task updated |
| `task:deleted` | `{ taskId }` | Task deleted |
| `task:moved` | `{ taskId, status }` | Task status changed |
| `task:reordered` | `{ taskId }` | Task position changed within column |
| `task:relation:added` | `{ taskId, toId, kind, targetGraph? }` | Relation/cross-link created |
| `task:relation:deleted` | `{ taskId, toId, kind, targetGraph? }` | Relation/cross-link removed |
| `task:attachment:added` | `{ taskId, filename }` | Attachment uploaded |
| `task:attachment:deleted` | `{ taskId, filename }` | Attachment removed |

### Epic events

| Type | Data | Trigger |
|------|------|---------|
| `epic:created` | `{ epicId, title, status }` | Epic created |
| `epic:updated` | `{ epicId }` | Epic updated |
| `epic:deleted` | `{ epicId }` | Epic deleted |
| `epic:linked` | `{ taskId, epicId }` | Task linked to epic |
| `epic:unlinked` | `{ taskId, epicId }` | Task unlinked from epic |

### Skill events

| Type | Data | Trigger |
|------|------|---------|
| `skill:created` | `{ skillId }` | Skill created |
| `skill:updated` | `{ skillId }` | Skill updated |
| `skill:deleted` | `{ skillId }` | Skill deleted |
| `skill:relation:added` | `{ skillId, toId, kind, targetGraph? }` | Relation/cross-link created |
| `skill:relation:deleted` | `{ skillId, toId, kind, targetGraph? }` | Relation/cross-link removed |
| `skill:attachment:added` | `{ skillId, filename }` | Attachment uploaded |
| `skill:attachment:deleted` | `{ skillId, filename }` | Attachment removed |

### Indexer events

| Type | Data | Trigger |
|------|------|---------|
| `graph:updated` | `{ file, graph }` | Indexer processed a file (`graph`: `"docs"`, `"code"`, `"files"`) |

## Broadcast

When authentication is enabled, events are filtered server-side — each client only receives events for projects they have read access to. The UI's `useWebSocket` hook additionally filters by the current `projectId`.

## Connection

The UI connects via the `WsProvider` component, which wraps pages with an auto-reconnecting WebSocket connection. The hook provides event subscriptions for components to react to real-time changes.

## Events are emitted by

- **Graph Managers** — on every mutation (create/update/delete/move/link/attach)
- **Indexer** — after processing each file
- Emitted via `GraphManagerContext.emit()` → `ProjectManager` → WebSocket broadcast
