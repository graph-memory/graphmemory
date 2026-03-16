---
id: fix-task-ordering-on-status-change
status: todo
priority: high
tags:
  - bug
  - tasks
  - kanban
dueDate: null
estimate: null
completedAt: null
createdAt: 2026-03-16T20:40:55.045Z
updatedAt: 2026-03-16T20:40:55.045Z
---

# Fix Task Ordering on Status Change

Bug: when a task is moved to a new column, its position is set to max+1 but this ignores the visual position the user dragged to. Need to accept target position in the move request and shift other tasks accordingly.
