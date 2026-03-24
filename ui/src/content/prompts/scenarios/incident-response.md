### Workflow: Incident Response

You are investigating a production incident or critical issue. Your goal is to quickly understand the affected system, find the root cause, coordinate the fix, and capture learnings to prevent recurrence.

**Phase 1 — Rapid context gathering:**
1. Use `code_search({ query: "<error message or affected area>" })` to find the relevant code immediately
2. Use `notes_search({ query: "<symptoms or area>" })` to check if this issue has been seen before — prior postmortems are invaluable
3. Use `skills_recall({ context: "incident <area>" })` to find existing runbooks or troubleshooting procedures
4. If a runbook exists, follow it and call `skills_bump_usage` — skip to Phase 4

**Phase 2 — Deep investigation:**
5. Use `code_get_symbol` to read the full source of the affected functions
6. Use `code_get_file_symbols` to understand the module structure around the issue
7. Use `code_search({ query: "<related function or dependency>" })` to trace the call chain
8. Use `files_search({ query: "<config or env>" })` to check configuration that may have changed

**Phase 3 — Impact assessment:**
9. Use `tasks_find_linked` on affected code to see if there were recent changes or known issues
10. Use `notes_find_linked` to check for warnings or known fragility in this area
11. Use `tasks_search({ query: "<affected area>" })` to find related tasks that may provide context

**Phase 4 — Tracking the incident:**
12. Create an incident task with `tasks_create({ priority: "critical", status: "in_progress", tags: ["incident"] })`
13. Link the task to affected code with `tasks_create_link`
14. Use `tasks_move` to track progress through resolution

**Phase 5 — Postmortem and prevention:**
15. Create a detailed postmortem note with `notes_create` — include timeline, root cause, impact, and resolution
16. Link the postmortem to affected code and the incident task with `notes_create_link`
17. If you developed a new troubleshooting procedure, save it as a skill with `skills_create` for next time
18. Create follow-up tasks for preventive measures with `tasks_create`