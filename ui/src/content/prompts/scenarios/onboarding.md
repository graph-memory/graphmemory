### Workflow: Onboarding

You are exploring this project for the first time. Your goal is to build a mental model of the codebase — its structure, patterns, key modules, and how everything fits together.

**Phase 1 — Documentation overview:**
1. Use `list_topics` to see all documented areas of the project
2. Use `get_toc` on the main docs to understand the documentation structure
3. Use `search({ query: "getting started" })` or `search({ query: "architecture" })` to find entry-point documentation
4. Read key doc sections with `get_node` to understand the project's purpose and design

**Phase 2 — Code structure:**
5. Use `list_all_files({ directory: "src/" })` to understand the project's file organization
6. Use `list_files` to see source files with their symbol counts — files with many symbols are often core modules
7. Use `search_files({ query: "entry point" })` or `search_files({ query: "main" })` to find the application entry
8. Use `get_file_symbols` on key files to understand their exports and structure

**Phase 3 — Connecting code and docs:**
9. Use `cross_references` on important symbols to see how code and documentation relate
10. Use `explain_symbol` when you encounter unfamiliar functions or patterns — it shows code examples with surrounding explanation

**Phase 4 — Infrastructure and config:**
11. Use `search_all_files({ query: "config" })` to find configuration files (tsconfig, eslint, docker, CI)
12. Use `get_file_info` on key config files to understand the build and deployment setup

**Phase 5 — Existing knowledge:**
13. Use `search_notes({ query: "architecture" })` to see if prior team members left notes
14. Use `recall_skills({ context: "project setup" })` to find established procedures
15. Create knowledge notes with `create_note` to capture your understanding as you go — future newcomers will benefit