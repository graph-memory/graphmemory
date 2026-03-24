### Workflow: Task Planning

You are planning and organizing project work — creating tasks, setting priorities, establishing dependencies, and tracking progress. Your goal is to create a clear, actionable work breakdown connected to the codebase.

**Phase 1 — Current state review:**
1. Use `tasks_list({ status: "in_progress" })` to see what's currently being worked on
2. Use `tasks_list({ status: "todo" })` to review the backlog
3. Use `tasks_list({ status: "review" })` to check items pending review
4. Use `tasks_search({ query: "<initiative or area>" })` to find existing tasks related to the current planning scope

**Phase 2 — Context gathering:**
5. Use `code_search({ query: "<area>" })` to understand the scope of code that will be affected
6. Use `notes_search({ query: "<area>" })` to review prior decisions and context
7. Use `skills_recall({ context: "<work type>" })` to find established procedures the team should follow
8. Use `tasks_find_linked` on key code files to see existing work planned for those areas

**Phase 3 — Creating and organizing tasks:**
9. Create tasks with `tasks_create` — include clear titles, descriptions, appropriate priority (low/medium/high/critical), and relevant tags
10. Use `tasks_link` to establish relationships between tasks:
    - `subtask_of` to break large tasks into smaller pieces
    - `blocks` to indicate dependencies
    - `related_to` for loose connections
11. Use `tasks_create_link` to connect tasks to the code files, doc sections, or knowledge notes they affect

**Phase 4 — Prioritization:**
12. Review task priorities against current blockers and dependencies
13. Use `tasks_move` to set initial status: `backlog` for future work, `todo` for next up
14. Use `tasks_find_linked` to verify nothing is blocked or missing dependencies

**Phase 5 — Capturing planning context:**
15. Create knowledge notes for planning decisions, sprint goals, or priority rationale with `notes_create`
16. Save recurring planning workflows as skills with `skills_create`