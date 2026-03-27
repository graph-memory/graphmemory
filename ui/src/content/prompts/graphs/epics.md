#### Epic Graph

Milestone-level containers that group related tasks into larger work streams. Epics provide high-level progress tracking across multiple tasks.

**Status lifecycle:** `draft` → `active` → `completed` → `archived`. Use `epics_update` to change status.

**What it stores:** epics with title, description, status (draft/active/completed/archived), tags, order, and `belongs_to` edges linking tasks to their parent epic. Nodes use `nodeType: "epic"` as a discriminator.

**Example queries:**
- `epics_list({ status: "active" })` → shows current work streams
- `epics_search({ query: "authentication redesign" })` → finds epics by meaning
- `epics_get({ epicId: "auth-overhaul" })` → full epic details with linked tasks and progress

**Epic-task relationships:**
- `belongs_to` — a task belongs to an epic (created via `epics_link_task`)
- A task can belong to multiple epics
- Deleting an epic does not delete its tasks

**Progress tracking:**
- `epics_get` returns a `progress` object with `{ total, done, percentage }`
- Tracks how many linked tasks are in `done` or `cancelled` status

**Connections to other graphs (when enabled):**
- Task Graph: link and unlink tasks with `epics_link_task` / `epics_unlink_task`
- Code Graph: link epics to code they affect with cross-graph links
- Docs Graph: link epics to documentation they cover
- Knowledge Graph: link notes that describe goals or decisions
- Skill Graph: associate skills relevant to the epic's work
- File Index: reference files relevant to the epic