### Workflow: Sprint Retrospective

You are reviewing completed work from a sprint or work period. Your goal is to analyze what was accomplished, extract learnings, identify improvements, and update the knowledge base.

**Phase 1 — Review completed work:**
1. Use `list_tasks({ status: "done" })` to see all completed tasks
2. Use `list_tasks({ status: "cancelled" })` to review what was dropped and why
3. Use `search_tasks({ query: "<sprint tag or period>" })` to find tasks from the specific sprint
4. Use `get_task` on key completed tasks to see their full context, links, and history

**Phase 2 — Analyze patterns:**
5. Use `list_notes` to review notes created during the sprint — these capture real-time learnings
6. Use `list_skills` to see if new skills were created or existing ones used
7. Use `search_notes({ query: "decision" })` to review decisions made during the sprint
8. Use `find_linked_tasks` on key code areas to see the concentration of work

**Phase 3 — Extract learnings:**
9. Use `search_notes({ query: "gotcha" })` or `search_notes({ query: "workaround" })` to find pain points
10. Use `recall_skills({ context: "retrospective" })` to find established retro procedures
11. Use `find_linked_notes` on completed tasks to see what knowledge was captured alongside work

**Phase 4 — Capture retrospective insights:**
12. Create a retrospective note with `create_note({ tags: ["retrospective", "<sprint>"] })` summarizing:
    - What went well
    - What could be improved
    - Key learnings
    - Action items
13. Link the retro note to relevant tasks and code with `create_relation`

**Phase 5 — Create improvement actions:**
14. Create tasks for improvement actions with `create_task` — link them to the retro note
15. If you identified reusable practices, save them as skills with `create_skill`
16. Update existing skills that were found lacking with `update_skill`
17. Use `bump_skill_usage` on procedures that proved valuable during the sprint