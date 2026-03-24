### Workflow: Refactoring

You are restructuring existing code to improve its design without changing external behavior. Your goal is to understand the current structure, make safe changes, and keep documentation in sync.

**Phase 1 — Understanding current structure:**
1. Use `code_search({ query: "<area to refactor>" })` to find all relevant code
2. Use `code_get_file_symbols` to understand exports, dependencies, and symbol hierarchy in target files
3. Use `code_get_symbol` to read full implementations of functions you plan to change
4. Use `code_list_files` and `code_search_files` to find similar patterns across the codebase — understand how widespread the pattern is

**Phase 2 — Checking dependencies and impact:**
5. Use `docs_cross_references` to check if documentation references the code being refactored
6. Use `tasks_find_linked` to see if there are related tasks, known issues, or pending work
7. Use `notes_find_linked` to check for notes about design decisions or constraints in this area
8. Use `skills_find_linked` to see if any skills reference the patterns being changed

**Phase 3 — Planning the refactor:**
9. Use `skills_recall({ context: "refactoring <pattern>" })` to find established refactoring procedures
10. Use `notes_search({ query: "architecture <area>" })` to review prior decisions about this code area
11. If needed, create a task to track the refactoring work with `tasks_create`

**Phase 4 — During refactoring:**
12. Create a knowledge note describing what changed and why with `notes_create`
13. Link the note to affected code with `notes_create_link`

**Phase 5 — Verification:**
14. Use `docs_cross_references` to verify documentation is still accurate after changes
15. Use `docs_find_examples({ symbol: "<renamed or changed symbol>" })` to find doc examples that may need updating
16. If documentation needs updating, create a task with `tasks_create` to track it