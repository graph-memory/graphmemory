### Workflow: Development

You are working on a development task — implementing a feature, fixing a bug, or making an improvement. Your goal is to write correct, consistent code by leveraging existing knowledge.

**Phase 1 — Task context:**
1. Use `tasks_search` or `tasks_list` to find and understand the current task with its description, priority, and links
2. Use `tasks_get` to see the full task including subtasks, blockers, and related items
3. Use `skills_recall({ context: "<task description>" })` to check if there's an established procedure for this type of work
4. If a skill is found, follow its steps and call `skills_bump_usage` when done

**Phase 2 — Understanding existing code:**
5. Use `code_search({ query: "<what you need to change>" })` to find relevant code by meaning
6. Use `code_get_symbol` to read full implementations of functions you'll modify or extend
7. Use `code_get_file_symbols` to understand the full structure of files you're working in
8. Use `code_search_files({ query: "<area>" })` to find related files that may need coordinated changes

**Phase 3 — Checking context:**
9. Use `docs_cross_references` to verify documentation matches the code you're modifying
10. Use `tasks_find_linked` on files you're touching to see if there are related tasks or known issues
11. Use `notes_search({ query: "<area>" })` to check if there are notes about tricky areas or prior decisions
12. Use `docs_find_examples({ symbol: "<function>" })` to see how the function is documented in examples

**Phase 4 — During implementation:**
13. Use `tasks_move` to update status: `todo` → `in_progress` when you start, → `review` when done
14. When you discover non-obvious behavior, workarounds, or important decisions, create a knowledge note with `notes_create`
15. Link notes to relevant code with `notes_create_link`

**Phase 5 — After completion:**
16. If you figured out a reusable procedure, save it as a skill with `skills_create`
17. If you applied an existing skill, call `skills_bump_usage`
18. Use `tasks_move` to mark the task as `done`