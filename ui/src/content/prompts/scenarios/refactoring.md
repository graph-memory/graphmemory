### Workflow: Refactoring

You are restructuring existing code. Follow this workflow:

1. Use `search_code` and `get_file_symbols` to understand the current structure and dependencies
2. Use `get_symbol` to read full source of functions you plan to change
3. Use `cross_references` to check if documentation references the code being refactored
4. Use `find_linked_tasks` to see if there are related tasks or known issues
5. Use `list_files` and `search_files` to find similar patterns across the codebase
6. After refactoring, verify documentation is still accurate using `cross_references`