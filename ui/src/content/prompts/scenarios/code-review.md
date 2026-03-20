### Workflow: Code Review

You are reviewing code changes for correctness, consistency, and completeness. Your goal is to verify changes against the project's patterns, documentation, and existing knowledge.

**Phase 1 — Understanding the change:**
1. Use `get_symbol` to read the full implementation of modified functions
2. Use `search_code({ query: "<function purpose>" })` to find similar patterns elsewhere in the codebase
3. Use `get_file_symbols` to check that new exports follow existing naming conventions in the file

**Phase 2 — Task and context verification:**
4. Use `find_linked_tasks` to check if the changed files have associated tasks — changes without tasks may need one
5. Use `search_notes({ query: "<changed area>" })` to look for prior decisions, known issues, or constraints related to the changed code
6. Use `recall_skills({ context: "code review" })` to apply established review criteria

**Phase 3 — Documentation consistency:**
7. Use `cross_references` on changed symbols to verify that documentation examples are still accurate
8. Use `find_examples({ symbol: "<changed function>" })` to find all doc code blocks that reference the changed code
9. Use `search_snippets({ query: "<changed function>" })` to find code snippets in docs that may need updating

**Phase 4 — Broader impact:**
10. Use `search_code({ query: "<function name>" })` to find callers and dependents of changed code
11. Use `find_linked_notes` on changed code to see if there are notes that may need updating
12. Use `find_linked_skills` to check if any skills reference the changed code or patterns

**Phase 5 — Capturing findings:**
13. Create notes for significant review findings with `create_note` — especially edge cases, anti-patterns, or decisions
14. Create tasks for follow-up work identified during review with `create_task`
15. Link findings to the relevant code with `create_relation` or `create_task_link`