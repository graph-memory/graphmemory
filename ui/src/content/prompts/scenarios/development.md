### Workflow: Development

You are working on a development task — implementing a feature, fixing a bug, or making an improvement. Your goal is to write correct, consistent code by leveraging existing knowledge.

**Phase 1 — Task context:**
1. Use `search_tasks` or `list_tasks` to find and understand the current task with its description, priority, and links
2. Use `get_task` to see the full task including subtasks, blockers, and related items
3. Use `recall_skills({ context: "<task description>" })` to check if there's an established procedure for this type of work
4. If a skill is found, follow its steps and call `bump_skill_usage` when done

**Phase 2 — Understanding existing code:**
5. Use `search_code({ query: "<what you need to change>" })` to find relevant code by meaning
6. Use `get_symbol` to read full implementations of functions you'll modify or extend
7. Use `get_file_symbols` to understand the full structure of files you're working in
8. Use `search_files({ query: "<area>" })` to find related files that may need coordinated changes

**Phase 3 — Checking context:**
9. Use `cross_references` to verify documentation matches the code you're modifying
10. Use `find_linked_tasks` on files you're touching to see if there are related tasks or known issues
11. Use `search_notes({ query: "<area>" })` to check if there are notes about tricky areas or prior decisions
12. Use `find_examples({ symbol: "<function>" })` to see how the function is documented in examples

**Phase 4 — During implementation:**
13. Use `move_task` to update status: `todo` → `in_progress` when you start, → `review` when done
14. When you discover non-obvious behavior, workarounds, or important decisions, create a knowledge note with `create_note`
15. Link notes to relevant code with `create_relation`

**Phase 5 — After completion:**
16. If you figured out a reusable procedure, save it as a skill with `create_skill`
17. If you applied an existing skill, call `bump_skill_usage`
18. Use `move_task` to mark the task as `done`