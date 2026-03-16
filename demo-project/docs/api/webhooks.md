# Webhooks API

## Overview

Webhooks allow external services to receive real-time notifications when events occur in TaskFlow. When an event is triggered, TaskFlow sends an HTTP POST request to each registered webhook URL that matches the event type.

## Endpoints

### Register Webhook

```http
POST /api/projects/:projectId/webhooks
```

**Request body:**

```json
{
  "url": "https://example.com/webhooks/taskflow",
  "secret": "whsec_abc123def456",
  "events": ["task.created", "task.updated", "task.moved"]
}
```

**Response:** `201 Created`

### List Webhooks

```http
GET /api/projects/:projectId/webhooks
```

**Response:** `200 OK`

### Delete Webhook

```http
DELETE /api/webhooks/:webhookId
```

**Response:** `204 No Content`

### Get Delivery Status

```http
GET /api/webhooks/:webhookId/status
```

**Response:**

```json
{
  "active": true,
  "lastStatus": 200,
  "retryCount": 0
}
```

## Event Types

| Event | Description |
|-------|-------------|
| task.created | New task created |
| task.updated | Task fields updated |
| task.deleted | Task deleted |
| task.moved | Task status changed |
| project.created | New project created |
| project.updated | Project settings changed |
| project.archived | Project archived |
| team.member_added | New member joined team |
| team.member_removed | Member removed from team |
| comment.created | New comment added |
| comment.updated | Comment edited |

## Payload Format

```json
{
  "event": "task.created",
  "timestamp": 1710892800000,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "projectId": "660e8400-e29b-41d4-a716-446655440000",
    "title": "New feature",
    "status": "todo"
  },
  "webhookId": "770e8400-e29b-41d4-a716-446655440000"
}
```

## Security

### Signature Verification

Each webhook request includes a signature header:

```
X-Webhook-Signature: sha256=<signature>
X-Webhook-Event: task.created
X-Webhook-Timestamp: 1710892800000
```

Verify the signature to ensure the request came from TaskFlow:

```typescript
import crypto from 'crypto'

function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return `sha256=${expected}` === signature
}
```

## Retry Policy

Failed deliveries are retried with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | 1 second |
| 2 | 5 seconds |
| 3 | 30 seconds |
| 4 | 2 minutes |
| 5 | 10 minutes |

After 5 consecutive failures, the webhook is automatically deactivated. Reactivate it via the API when the issue is resolved.

## Delivery Timeout

Webhook deliveries have a 10-second timeout. If the receiving server doesn't respond within this window, the delivery is marked as failed and will be retried.

## Best Practices

1. **Respond quickly** — return a 200 status immediately, process async
2. **Verify signatures** — always validate the webhook signature
3. **Handle duplicates** — use the webhook ID for idempotency
4. **Monitor delivery status** — check for deactivated webhooks regularly
