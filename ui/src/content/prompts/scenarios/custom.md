### Workflow: General

Follow this general workflow to make the most of Graph Memory for any task.

**Phase 1 — Gather context:**
1. Use `search` and `search_code` to find documentation and code relevant to your current task
2. Use `search_notes` to check if there's existing knowledge about this area
3. Use `recall_skills` to find established procedures that may apply

**Phase 2 — Understand the landscape:**
4. Use `get_symbol` or `get_node` to read full content of relevant items
5. Use `cross_references` to see how code and documentation relate
6. Use `find_linked_tasks` to check for related work items or known issues

**Phase 3 — Do the work:**
7. Apply the context you gathered to complete your task
8. Use `search_code` and `search` as needed to fill knowledge gaps during work

**Phase 4 — Capture knowledge:**
9. Create notes with `create_note` for decisions, discoveries, or non-obvious behavior
10. Create tasks with `create_task` for follow-up work identified
11. Save reusable procedures as skills with `create_skill`

**Phase 5 — Connect the graph:**
12. Link notes to relevant code and docs with `create_relation`
13. Link tasks to affected code with `create_task_link`
