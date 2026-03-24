#### Task Graph

Kanban-style task management with a status workflow, priorities, due dates, time estimates, and cross-graph links. Tasks are automatically mirrored to `.tasks/` directory as markdown files.

**Status workflow:** `backlog` → `todo` → `in_progress` → `review` → `done` (or `cancelled` at any point). Use `tasks_move` to transition — it auto-manages `completedAt` timestamps.

**What it stores:** tasks with title, description, status, priority (low/medium/high/critical), tags, assignee, due date, time estimate, and typed relations to other tasks (subtask_of, blocks, related_to).

**Example queries:**
- `tasks_list({ status: "in_progress" })` → shows what's currently being worked on
- `tasks_search({ query: "fix authentication timeout" })` → finds tasks by meaning
- `tasks_find_linked({ targetId: "src/auth/middleware.ts" })` → finds tasks touching auth code

**Task relationships:**
- `subtask_of` — breaks large tasks into smaller pieces
- `blocks` — indicates one task must complete before another can start
- `related_to` — loose connection between related work items

**Connections to other graphs (when enabled):**
- Code Graph: link tasks to code they affect with `tasks_create_link`
- Docs Graph: link tasks to documentation they update
- Knowledge Graph: link notes that describe the context or decision
- Skill Graph: use `skills_recall` to find procedures for completing the task
- File Index: attach files to tasks with `tasks_add_attachment`