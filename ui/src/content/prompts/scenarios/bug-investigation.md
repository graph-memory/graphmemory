### Workflow: Bug Investigation

You are investigating and fixing a bug. Your goal is to find the root cause, understand the impact, fix the issue, and capture knowledge to prevent recurrence.

**Phase 1 — Understanding the bug:**
1. Use `code_search({ query: "<bug behavior description>" })` to find the relevant code area
2. Use `notes_search({ query: "<bug symptoms>" })` to check if this issue has been encountered before
3. Use `tasks_search({ query: "<bug description>" })` to see if there are existing tasks related to this issue
4. If a previous note or task exists, read it with `notes_get` or `tasks_get` for context

**Phase 2 — Deep code analysis:**
5. Use `code_get_symbol` to read the full source of suspicious functions
6. Use `code_get_file_symbols` to understand the full module where the bug may originate
7. Use `code_search({ query: "<related function>" })` to find callers and related code paths
8. Use `docs_cross_references` to check if documentation describes the expected behavior differently

**Phase 3 — Impact assessment:**
9. Use `tasks_find_linked` on the affected code to see if there are related tasks or pending work
10. Use `notes_find_linked` to check for notes about the affected area
11. Use `code_search_files({ query: "<affected module>" })` to find other files that may be impacted

**Phase 4 — Tracking the fix:**
12. Create a task to track the bug fix with `tasks_create({ priority: "high", status: "in_progress", ... })`
13. Link the task to the affected code with `tasks_create_link`
14. Use `tasks_move` to progress the fix through the workflow

**Phase 5 — Preventing recurrence:**
15. Create a knowledge note documenting the root cause, symptoms, and solution with `notes_create`
16. Link the note to the affected code with `notes_create_link`
17. If the fix involves a reusable debugging technique, save it as a skill with `skills_create`