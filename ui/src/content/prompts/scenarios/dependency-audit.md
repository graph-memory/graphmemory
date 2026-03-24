### Workflow: Dependency Audit

You are analyzing the project's dependencies, imports, and module structure. Your goal is to understand what the project depends on, identify potential issues, and document the dependency landscape.

**Phase 1 — File-level audit:**
1. Use `files_search({ query: "package.json" })` to find all package manifests
2. Use `files_get_info({ path: "package.json" })` to check the main package configuration
3. Use `files_list({ extension: ".json" })` to find lock files, config files, and other dependency-related artifacts
4. Use `files_search({ query: "tsconfig" })` to find TypeScript configurations and their extends chains

**Phase 2 — Code dependency analysis:**
5. Use `code_search({ query: "<package or module name>" })` to find code that depends on specific packages
6. Use `code_get_file_symbols` on core modules to see what they export and import
7. Use `code_list_files` to identify the largest and most complex source files
8. Use `code_search_files({ query: "<module or package>" })` to find files that depend on specific packages

**Phase 3 — Documentation check:**
9. Use `docs_search({ query: "dependencies" })` to find documentation about dependency choices
10. Use `notes_search({ query: "dependency" })` to find notes about why certain packages were chosen
11. Use `docs_cross_references` on key modules to see if dependency usage is documented

**Phase 4 — Risk assessment:**
12. Use `tasks_find_linked` on key dependency files to see if there are upgrade or migration tasks
13. Use `tasks_search({ query: "upgrade" })` or `tasks_search({ query: "dependency" })` to find tracked work
14. Use `notes_find_linked` to check for known issues with current dependencies

**Phase 5 — Capturing findings:**
15. Create notes for dependency decisions and risks with `notes_create`
16. Create tasks for upgrades or migrations needed with `tasks_create`
17. Link findings to affected code with `notes_create_link` and `tasks_create_link`
18. Save the audit procedure as a skill with `skills_create` for periodic re-execution