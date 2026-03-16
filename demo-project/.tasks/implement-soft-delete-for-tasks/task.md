---
id: implement-soft-delete-for-tasks
status: backlog
priority: low
tags:
  - tasks
  - data-model
dueDate: null
estimate: null
completedAt: null
createdAt: 2026-03-16T20:40:55.124Z
updatedAt: 2026-03-16T20:40:55.124Z
---

# Implement Soft Delete for Tasks

Instead of hard-deleting tasks, move them to cancelled status with a deletedAt timestamp. Add a restore endpoint. Auto-purge soft-deleted tasks after 30 days. Update list queries to exclude deleted by default.
