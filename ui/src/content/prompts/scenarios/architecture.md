### Workflow: Architecture

You are designing, analyzing, or evaluating the system architecture. Your goal is to understand the current structure, make informed design decisions, and capture them for the team.

**Phase 1 — Mapping the system:**
1. Use `files_list({ directory: "src/" })` to understand the project's directory structure
2. Use `code_list_files` to see source files organized by location and symbol count
3. Use `code_search({ query: "<pattern or concern>" })` to find architectural patterns (e.g., "middleware", "repository", "controller")
4. Use `code_get_file_symbols` on core modules to understand their public API and internal structure

**Phase 2 — Understanding documentation:**
5. Use `docs_search({ query: "architecture" })` or `docs_get_toc` to find architectural documentation
6. Use `docs_cross_references` to verify that documented architecture matches the actual code structure
7. Use `docs_list_files` to see the full documentation landscape

**Phase 3 — Reviewing prior decisions:**
8. Use `notes_search({ query: "architecture decision" })` to find prior ADRs and design notes
9. Use `skills_recall({ context: "architecture <area>" })` to find established patterns and conventions
10. Use `notes_list({ tag: "architecture" })` to review all architecture-tagged knowledge

**Phase 4 — Analysis and evaluation:**
11. Use `code_search` to compare different modules for pattern consistency
12. Use `tasks_find_linked` on core modules to see ongoing and planned work
13. Use `files_search` to find configuration files that define build, deploy, and runtime architecture

**Phase 5 — Capturing decisions:**
14. Create architectural decision notes with `notes_create` — include context, options considered, decision, and rationale
15. Link decisions to affected code modules with `notes_create_link`
16. Save new architectural patterns as skills with `skills_create` for team consistency
17. Create tasks for architectural improvements with `tasks_create` and link to relevant code