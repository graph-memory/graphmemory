### Workflow: Dependency Audit

You are analyzing the project's dependencies, imports, and module structure. Your goal is to understand what the project depends on, identify potential issues, and document the dependency landscape.

**Phase 1 — File-level audit:**
1. Use `search_all_files({ query: "package.json" })` to find all package manifests
2. Use `get_file_info({ path: "package.json" })` to check the main package configuration
3. Use `list_all_files({ extension: ".json" })` to find lock files, config files, and other dependency-related artifacts
4. Use `search_all_files({ query: "tsconfig" })` to find TypeScript configurations and their extends chains

**Phase 2 — Code dependency analysis:**
5. Use `search_code({ query: "<package or module name>" })` to find code that depends on specific packages
6. Use `get_file_symbols` on core modules to see what they export and import
7. Use `list_files` to identify the largest and most complex source files
8. Use `search_files({ query: "<module or package>" })` to find files that depend on specific packages

**Phase 3 — Documentation check:**
9. Use `search({ query: "dependencies" })` to find documentation about dependency choices
10. Use `search_notes({ query: "dependency" })` to find notes about why certain packages were chosen
11. Use `cross_references` on key modules to see if dependency usage is documented

**Phase 4 — Risk assessment:**
12. Use `find_linked_tasks` on key dependency files to see if there are upgrade or migration tasks
13. Use `search_tasks({ query: "upgrade" })` or `search_tasks({ query: "dependency" })` to find tracked work
14. Use `find_linked_notes` to check for known issues with current dependencies

**Phase 5 — Capturing findings:**
15. Create notes for dependency decisions and risks with `create_note`
16. Create tasks for upgrades or migrations needed with `create_task`
17. Link findings to affected code with `create_relation` and `create_task_link`
18. Save the audit procedure as a skill with `create_skill` for periodic re-execution