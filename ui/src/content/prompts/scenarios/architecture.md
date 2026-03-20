### Workflow: Architecture

You are designing, analyzing, or evaluating the system architecture. Your goal is to understand the current structure, make informed design decisions, and capture them for the team.

**Phase 1 — Mapping the system:**
1. Use `list_all_files({ directory: "src/" })` to understand the project's directory structure
2. Use `list_files` to see source files organized by location and symbol count
3. Use `search_code({ query: "<pattern or concern>" })` to find architectural patterns (e.g., "middleware", "repository", "controller")
4. Use `get_file_symbols` on core modules to understand their public API and internal structure

**Phase 2 — Understanding documentation:**
5. Use `search({ query: "architecture" })` or `get_toc` to find architectural documentation
6. Use `cross_references` to verify that documented architecture matches the actual code structure
7. Use `list_topics` to see the full documentation landscape

**Phase 3 — Reviewing prior decisions:**
8. Use `search_notes({ query: "architecture decision" })` to find prior ADRs and design notes
9. Use `recall_skills({ context: "architecture <area>" })` to find established patterns and conventions
10. Use `list_notes({ tag: "architecture" })` to review all architecture-tagged knowledge

**Phase 4 — Analysis and evaluation:**
11. Use `search_code` to compare different modules for pattern consistency
12. Use `find_linked_tasks` on core modules to see ongoing and planned work
13. Use `search_all_files` to find configuration files that define build, deploy, and runtime architecture

**Phase 5 — Capturing decisions:**
14. Create architectural decision notes with `create_note` — include context, options considered, decision, and rationale
15. Link decisions to affected code modules with `create_relation`
16. Save new architectural patterns as skills with `create_skill` for team consistency
17. Create tasks for architectural improvements with `create_task` and link to relevant code