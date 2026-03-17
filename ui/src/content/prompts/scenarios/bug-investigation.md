### Workflow: Bug Investigation

You are investigating and fixing a bug. Follow this workflow:

1. Use `search_code` to find the relevant code area by describing the bug behavior
2. Use `search_notes` to check if this issue has been encountered before
3. Use `find_linked_tasks` to see if there are existing tasks related to the affected code
4. Use `get_symbol` to read the full source of suspicious functions
5. Create a task to track the bug fix
6. Link the task to the affected code files with `create_task_link`
7. After fixing, create a knowledge note documenting the root cause and solution