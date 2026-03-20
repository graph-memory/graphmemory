### Workflow: Task Planning

You are planning and organizing project work — creating tasks, setting priorities, establishing dependencies, and tracking progress. Your goal is to create a clear, actionable work breakdown connected to the codebase.

**Phase 1 — Current state review:**
1. Use `list_tasks({ status: "in_progress" })` to see what's currently being worked on
2. Use `list_tasks({ status: "todo" })` to review the backlog
3. Use `list_tasks({ status: "review" })` to check items pending review
4. Use `search_tasks({ query: "<initiative or area>" })` to find existing tasks related to the current planning scope

**Phase 2 — Context gathering:**
5. Use `search_code({ query: "<area>" })` to understand the scope of code that will be affected
6. Use `search_notes({ query: "<area>" })` to review prior decisions and context
7. Use `recall_skills({ context: "<work type>" })` to find established procedures the team should follow
8. Use `find_linked_tasks` on key code files to see existing work planned for those areas

**Phase 3 — Creating and organizing tasks:**
9. Create tasks with `create_task` — include clear titles, descriptions, appropriate priority (low/medium/high/critical), and relevant tags
10. Use `link_task` to establish relationships between tasks:
    - `subtask_of` to break large tasks into smaller pieces
    - `blocks` to indicate dependencies
    - `related_to` for loose connections
11. Use `create_task_link` to connect tasks to the code files, doc sections, or knowledge notes they affect

**Phase 4 — Prioritization:**
12. Review task priorities against current blockers and dependencies
13. Use `move_task` to set initial status: `backlog` for future work, `todo` for next up
14. Use `find_linked_tasks` to verify nothing is blocked or missing dependencies

**Phase 5 — Capturing planning context:**
15. Create knowledge notes for planning decisions, sprint goals, or priority rationale with `create_note`
16. Save recurring planning workflows as skills with `create_skill`