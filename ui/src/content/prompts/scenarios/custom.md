### Workflow: General

Follow this general workflow to make the most of Graph Memory for any task.

**Phase 1 — Gather context:**
1. Use `docs_search` and `code_search` to find documentation and code relevant to your current task
2. Use `notes_search` to check if there's existing knowledge about this area
3. Use `skills_recall` to find established procedures that may apply

**Phase 2 — Understand the landscape:**
4. Use `code_get_symbol` or `docs_get_node` to read full content of relevant items
5. Use `docs_cross_references` to see how code and documentation relate
6. Use `tasks_find_linked` to check for related work items or known issues

**Phase 3 — Do the work:**
7. Apply the context you gathered to complete your task
8. Use `code_search` and `docs_search` as needed to fill knowledge gaps during work

**Phase 4 — Capture knowledge:**
9. Create notes with `notes_create` for decisions, discoveries, or non-obvious behavior
10. Create tasks with `tasks_create` for follow-up work identified
11. Save reusable procedures as skills with `skills_create`

**Phase 5 — Connect the graph:**
12. Link notes to relevant code and docs with `notes_create_link`
13. Link tasks to affected code with `tasks_create_link`
