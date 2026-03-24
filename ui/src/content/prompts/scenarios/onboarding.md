### Workflow: Onboarding

You are exploring this project for the first time. Your goal is to build a mental model of the codebase — its structure, patterns, key modules, and how everything fits together.

**Phase 1 — Documentation overview:**
1. Use `docs_list_files` to see all documented areas of the project
2. Use `docs_get_toc` on the main docs to understand the documentation structure
3. Use `docs_search({ query: "getting started" })` or `docs_search({ query: "architecture" })` to find entry-point documentation
4. Read key doc sections with `docs_get_node` to understand the project's purpose and design

**Phase 2 — Code structure:**
5. Use `files_list({ directory: "src/" })` to understand the project's file organization
6. Use `code_list_files` to see source files with their symbol counts — files with many symbols are often core modules
7. Use `code_search_files({ query: "entry point" })` or `code_search_files({ query: "main" })` to find the application entry
8. Use `code_get_file_symbols` on key files to understand their exports and structure

**Phase 3 — Connecting code and docs:**
9. Use `docs_cross_references` on important symbols to see how code and documentation relate
10. Use `docs_explain_symbol` when you encounter unfamiliar functions or patterns — it shows code examples with surrounding explanation

**Phase 4 — Infrastructure and config:**
11. Use `files_search({ query: "config" })` to find configuration files (tsconfig, eslint, docker, CI)
12. Use `files_get_info` on key config files to understand the build and deployment setup

**Phase 5 — Existing knowledge:**
13. Use `notes_search({ query: "architecture" })` to see if prior team members left notes
14. Use `skills_recall({ context: "project setup" })` to find established procedures
15. Create knowledge notes with `notes_create` to capture your understanding as you go — future newcomers will benefit