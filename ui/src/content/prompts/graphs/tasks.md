### Task Graph

Kanban task management — status workflow (backlog, todo, in_progress, review, done, cancelled), priorities, due dates, estimates, and cross-graph links. Mirrored to `.tasks/` directory.

| Tool | Purpose |
|------|---------|
| `create_task` | Create a task with title, description, priority, status, tags |
| `update_task` | Update any task fields |
| `delete_task` | Delete a task and all its relations |
| `get_task` | Fetch task with subtasks, blockers, and related |
| `list_tasks` | List tasks with filters (status, priority, tag) |
| `search_tasks` | Hybrid search over tasks |
| `move_task` | Change task status (auto-manages completedAt) |
| `link_task` | Create task-to-task relation (subtask_of, blocks, related_to) |
| `create_task_link` | Link task to a doc/code/file/knowledge node |
| `delete_task_link` | Remove a cross-graph link |
| `find_linked_tasks` | Find tasks linked to a target node |
| `add_task_attachment` | Attach a file to a task |
| `remove_task_attachment` | Remove an attachment |