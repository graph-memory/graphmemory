### Workflow: Documentation

You are writing or maintaining project documentation. Your goal is to ensure docs are accurate, complete, and well-connected to the code they describe.

**Phase 1 — Assessing current coverage:**
1. Use `docs_list_files` to see all documented areas
2. Use `docs_get_toc` on key doc files to understand the structure and depth of existing documentation
3. Use `docs_search({ query: "<topic>" })` to find what's already documented about a specific area
4. Use `docs_search_files({ query: "<area>" })` to find related doc files

**Phase 2 — Finding gaps:**
5. Use `code_list_files` to discover source files and compare against documentation coverage
6. Use `code_get_file_symbols` on undocumented files to see what exports and public APIs lack docs
7. Use `docs_cross_references` to identify symbols that have code but no documentation references
8. Use `code_search({ query: "<undocumented area>" })` to understand the code before writing docs

**Phase 3 — Verifying accuracy:**
9. Use `docs_find_examples({ symbol: "<function>" })` to find all code blocks in docs that reference a symbol
10. Use `docs_search_snippets` to search code examples by meaning and check they're up to date
11. Use `docs_explain_symbol` to see code + documentation side by side and spot inconsistencies
12. Use `code_get_symbol` to read the current implementation before updating documentation

**Phase 4 — Writing docs:**
13. When writing new docs, use `notes_search({ query: "<topic>" })` to find team notes that provide context
14. Use `skills_recall({ context: "documentation" })` to find writing guidelines and templates

**Phase 5 — Tracking work:**
15. Create tasks for documentation gaps with `tasks_create` and link to undocumented code with `tasks_create_link`
16. Capture documentation standards and style decisions as notes with `notes_create`
17. Save documentation templates and workflows as skills with `skills_create`