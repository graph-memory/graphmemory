### Workflow: Sprint Retrospective

You are reviewing completed work from a sprint or work period. Your goal is to analyze what was accomplished, extract learnings, identify improvements, and update the knowledge base.

**Phase 1 — Review completed work:**
1. Use `tasks_list({ status: "done" })` to see all completed tasks
2. Use `tasks_list({ status: "cancelled" })` to review what was dropped and why
3. Use `tasks_search({ query: "<sprint tag or period>" })` to find tasks from the specific sprint
4. Use `tasks_get` on key completed tasks to see their full context, links, and history

**Phase 2 — Analyze patterns:**
5. Use `notes_list` to review notes created during the sprint — these capture real-time learnings
6. Use `skills_list` to see if new skills were created or existing ones used
7. Use `notes_search({ query: "decision" })` to review decisions made during the sprint
8. Use `tasks_find_linked` on key code areas to see the concentration of work

**Phase 3 — Extract learnings:**
9. Use `notes_search({ query: "gotcha" })` or `notes_search({ query: "workaround" })` to find pain points
10. Use `skills_recall({ context: "retrospective" })` to find established retro procedures
11. Use `notes_find_linked` on completed tasks to see what knowledge was captured alongside work

**Phase 4 — Capture retrospective insights:**
12. Create a retrospective note with `notes_create({ tags: ["retrospective", "<sprint>"] })` summarizing:
    - What went well
    - What could be improved
    - Key learnings
    - Action items
13. Link the retro note to relevant tasks and code with `notes_create_link`

**Phase 5 — Create improvement actions:**
14. Create tasks for improvement actions with `tasks_create` — link them to the retro note
15. If you identified reusable practices, save them as skills with `skills_create`
16. Update existing skills that were found lacking with `skills_update`
17. Use `skills_bump_usage` on procedures that proved valuable during the sprint