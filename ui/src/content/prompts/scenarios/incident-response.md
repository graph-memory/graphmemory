### Workflow: Incident Response

You are investigating a production incident or critical issue. Your goal is to quickly understand the affected system, find the root cause, coordinate the fix, and capture learnings to prevent recurrence.

**Phase 1 — Rapid context gathering:**
1. Use `search_code({ query: "<error message or affected area>" })` to find the relevant code immediately
2. Use `search_notes({ query: "<symptoms or area>" })` to check if this issue has been seen before — prior postmortems are invaluable
3. Use `recall_skills({ context: "incident <area>" })` to find existing runbooks or troubleshooting procedures
4. If a runbook exists, follow it and call `bump_skill_usage` — skip to Phase 4

**Phase 2 — Deep investigation:**
5. Use `get_symbol` to read the full source of the affected functions
6. Use `get_file_symbols` to understand the module structure around the issue
7. Use `search_code({ query: "<related function or dependency>" })` to trace the call chain
8. Use `search_all_files({ query: "<config or env>" })` to check configuration that may have changed

**Phase 3 — Impact assessment:**
9. Use `find_linked_tasks` on affected code to see if there were recent changes or known issues
10. Use `find_linked_notes` to check for warnings or known fragility in this area
11. Use `search_tasks({ query: "<affected area>" })` to find related tasks that may provide context

**Phase 4 — Tracking the incident:**
12. Create an incident task with `create_task({ priority: "critical", status: "in_progress", tags: ["incident"] })`
13. Link the task to affected code with `create_task_link`
14. Use `move_task` to track progress through resolution

**Phase 5 — Postmortem and prevention:**
15. Create a detailed postmortem note with `create_note` — include timeline, root cause, impact, and resolution
16. Link the postmortem to affected code and the incident task with `create_relation`
17. If you developed a new troubleshooting procedure, save it as a skill with `create_skill` for next time
18. Create follow-up tasks for preventive measures with `create_task`