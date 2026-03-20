### Workflow: Refactoring

You are restructuring existing code to improve its design without changing external behavior. Your goal is to understand the current structure, make safe changes, and keep documentation in sync.

**Phase 1 — Understanding current structure:**
1. Use `search_code({ query: "<area to refactor>" })` to find all relevant code
2. Use `get_file_symbols` to understand exports, dependencies, and symbol hierarchy in target files
3. Use `get_symbol` to read full implementations of functions you plan to change
4. Use `list_files` and `search_files` to find similar patterns across the codebase — understand how widespread the pattern is

**Phase 2 — Checking dependencies and impact:**
5. Use `cross_references` to check if documentation references the code being refactored
6. Use `find_linked_tasks` to see if there are related tasks, known issues, or pending work
7. Use `find_linked_notes` to check for notes about design decisions or constraints in this area
8. Use `find_linked_skills` to see if any skills reference the patterns being changed

**Phase 3 — Planning the refactor:**
9. Use `recall_skills({ context: "refactoring <pattern>" })` to find established refactoring procedures
10. Use `search_notes({ query: "architecture <area>" })` to review prior decisions about this code area
11. If needed, create a task to track the refactoring work with `create_task`

**Phase 4 — During refactoring:**
12. Create a knowledge note describing what changed and why with `create_note`
13. Link the note to affected code with `create_relation`

**Phase 5 — Verification:**
14. Use `cross_references` to verify documentation is still accurate after changes
15. Use `find_examples({ symbol: "<renamed or changed symbol>" })` to find doc examples that may need updating
16. If documentation needs updating, create a task with `create_task` to track it