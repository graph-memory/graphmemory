---
id: task-priority-sorting-convention
tags:
  - tasks
  - sorting
  - convention
createdAt: 2026-03-16T20:40:54.703Z
updatedAt: 2026-03-16T20:40:54.703Z
---

# Task Priority Sorting Convention

Task priorities are mapped to numeric values for sorting: critical=0, high=1, medium=2, low=3. This allows simple numeric comparison in sort functions. Combined with due date as secondary sort (nulls last), this gives a natural urgency ordering.
