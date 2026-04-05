# Graph Memory — AI Assistant Prompt

> Copy the section below into your `CLAUDE.md`, `.cursorrules`, or equivalent AI assistant configuration file.

---

## Graph Memory

You have access to **Graph Memory** — an MCP server that maintains a semantic graph of this project. Use it as your primary source of context before reading files directly.

### When to use

- **Before diving into code** — search first, read files second. Graph Memory already indexed the codebase and docs.
- **To find relevant code** — `code_search` finds symbols by meaning, not just name. Use it instead of grepping.
- **To find documentation** — `docs_search` finds relevant doc sections even if the wording differs from your query.
- **To understand a symbol** — `code_get_symbol` returns full source, `docs_explain_symbol` returns docs + examples, `docs_cross_references` bridges code ↔ docs.
- **To track decisions** — create notes in the knowledge graph so context persists across conversations.
- **To manage work** — create and move tasks through the kanban workflow, group them into epics.
- **To store recipes** — save reusable procedures as skills so they can be recalled later.

### Docs tools

Search and browse indexed markdown documentation.

| Tool | Purpose |
|------|---------|
| `docs_search` | Hybrid search (BM25 + vector) over doc sections with BFS expansion |
| `docs_search_files` | File-level semantic search over docs (by file path + title) |
| `docs_list_files` | List all indexed markdown files with title and chunk count |
| `docs_get_toc` | Table of contents for a specific doc file |
| `docs_get_node` | Full content of a specific doc section by ID |

### Code block tools

Search code examples extracted from documentation.

| Tool | Purpose |
|------|---------|
| `docs_find_examples` | Find code blocks in docs containing a specific symbol |
| `docs_search_snippets` | Semantic search over code blocks extracted from docs |
| `docs_list_snippets` | List code blocks with filters (file, language, content) |
| `docs_explain_symbol` | Find code example + surrounding text explanation for a symbol |

### Cross-graph tools

| Tool | Purpose |
|------|---------|
| `docs_cross_references` | Full picture for a symbol: code definition + doc examples + explanations |

### Code tools

Search and browse indexed TypeScript/JavaScript source code.

| Tool | Purpose |
|------|---------|
| `code_search` | Hybrid search (BM25 + vector) over code symbols with BFS expansion |
| `code_search_files` | File-level semantic search over source files (by path) |
| `code_list_files` | List all indexed source files with symbol counts |
| `code_get_file_symbols` | List all symbols in a source file (sorted by line) |
| `code_get_symbol` | Full source body of a specific symbol by ID |

### File index tools

Browse all project files (not just docs/code pattern-matched).

| Tool | Purpose |
|------|---------|
| `files_search` | Semantic search over all files by path |
| `files_list` | List all files/dirs with filters (directory, extension, language) |
| `files_get_info` | Full metadata for a file or directory |

### Knowledge tools

Persistent knowledge graph for facts, decisions, and notes. Notes are mirrored to `.notes/{id}/note.md`.

| Tool | Purpose |
|------|---------|
| `notes_create` | Create a note with title, content, and tags |
| `notes_update` | Update note title, content, or tags |
| `notes_delete` | Delete a note and all its relations |
| `notes_get` | Fetch a note by ID |
| `notes_list` | List notes with optional filter and tag |
| `notes_search` | Hybrid search over notes with BFS expansion |
| `notes_create_link` | Create relation between notes, or to doc/code/file/task nodes |
| `notes_delete_link` | Delete a relation (note-to-note or cross-graph) |
| `notes_list_links` | List all relations for a note (includes cross-graph links) |
| `notes_find_linked` | Reverse lookup: find notes linked to a doc/code/file/task node |
| `notes_add_attachment` | Attach a file to a note |
| `notes_remove_attachment` | Remove an attachment from a note |

**Example:**
```
notes_create({ title: "Why we chose PostgreSQL", content: "...", tags: ["architecture", "database"] })
notes_create_link({ fromId: "why-we-chose-postgresql", toId: "src/db/connection.ts", targetGraph: "code", kind: "documents" })
```

### Task tools

Kanban task management with workflow: `backlog` → `todo` → `in_progress` → `review` → `done` | `cancelled`. Tasks are mirrored to `.tasks/{id}/task.md`.

| Tool | Purpose |
|------|---------|
| `tasks_create` | Create a task with title, description, priority, status, tags, dueDate, estimate |
| `tasks_update` | Update any task fields (partial update) |
| `tasks_delete` | Delete a task and all its relations |
| `tasks_get` | Fetch task with subtasks, blockedBy, blocks, and related |
| `tasks_list` | List tasks with filters (status, priority, tag, text) |
| `tasks_search` | Hybrid search over tasks with BFS expansion |
| `tasks_move` | Change task status (auto-manages `completedAt`) |
| `tasks_reorder` | Reorder a task within its status column, optionally move to a different status |
| `tasks_link` | Create task↔task relation (`subtask_of`, `blocks`, `related_to`) |
| `tasks_create_link` | Link task to a doc/code/file/knowledge node |
| `tasks_delete_link` | Remove a cross-graph link from a task |
| `tasks_find_linked` | Reverse lookup: find tasks linked to a target node |
| `tasks_add_attachment` | Attach a file to a task |
| `tasks_remove_attachment` | Remove an attachment from a task |
| `tasks_bulk_delete` | Delete multiple tasks in one operation |
| `tasks_bulk_move` | Move multiple tasks to a new status in one operation |
| `tasks_bulk_priority` | Update priority for multiple tasks in one operation |

**Example:**
```
tasks_create({ title: "Fix auth redirect loop", description: "...", priority: "high", status: "todo" })
tasks_move({ taskId: "fix-auth-redirect-loop", status: "in_progress" })
tasks_link({ fromId: "fix-auth-redirect-loop", toId: "write-auth-tests", kind: "blocks" })
tasks_create_link({ taskId: "fix-auth-redirect-loop", targetId: "src/auth.ts::login", targetGraph: "code", kind: "fixes" })
```

### Epic tools

Epics group related tasks and track progress. Epics are mirrored to `.tasks/{id}/task.md` alongside tasks.

| Tool | Purpose |
|------|---------|
| `epics_create` | Create an epic with title, description, priority, status, tags |
| `epics_update` | Update any epic fields (partial update) |
| `epics_delete` | Delete an epic (linked tasks are NOT deleted) |
| `epics_get` | Fetch epic with progress (done/total), cross-links |
| `epics_list` | List epics with optional filters, each includes progress |
| `epics_search` | Semantic search over epics |
| `epics_link_task` | Link a task to an epic (a task can belong to multiple epics) |
| `epics_unlink_task` | Remove a task from an epic |

**Example:**
```
epics_create({ title: "Auth overhaul", description: "...", priority: "high", status: "in_progress" })
epics_link_task({ epicId: "auth-overhaul", taskId: "fix-auth-redirect-loop" })
epics_get({ epicId: "auth-overhaul" })
```

### Skill tools

Reusable recipes, procedures, and troubleshooting guides. Skills are mirrored to `.skills/{id}/skill.md`.

| Tool | Purpose |
|------|---------|
| `skills_create` | Create a skill with steps, triggers, tags, and metadata |
| `skills_update` | Update any skill fields (partial update) |
| `skills_delete` | Delete a skill and all its relations |
| `skills_get` | Fetch skill with dependsOn/dependedBy/related/variants |
| `skills_list` | List skills with filters (source, tag, text) |
| `skills_search` | Hybrid search over skills with BFS expansion |
| `skills_recall` | Recall relevant skills for a task context (higher recall) |
| `skills_bump_usage` | Increment usage counter + set lastUsedAt |
| `skills_link` | Create skill↔skill relation (`depends_on`, `related_to`, `variant_of`) |
| `skills_create_link` | Link skill to a doc/code/file/knowledge/task node |
| `skills_delete_link` | Remove a cross-graph link from a skill |
| `skills_find_linked` | Reverse lookup: find skills linked to a target node |
| `skills_add_attachment` | Attach a file to a skill |
| `skills_remove_attachment` | Remove an attachment from a skill |

**Example:**
```
skills_create({ title: "Add REST endpoint", description: "...", steps: ["1. Create route file", "2. Add Zod schema", "3. Register in router"], triggers: ["new endpoint", "new API route"], tags: ["api"] })
skills_recall({ query: "add a new API endpoint" })
skills_bump_usage({ skillId: "add-rest-endpoint" })
skills_link({ fromId: "add-rest-endpoint", toId: "debug-authentication-issues", kind: "related_to" })
skills_create_link({ skillId: "add-rest-endpoint", targetId: "src/api/rest/index.ts", targetGraph: "code", kind: "references" })
```

### Best practices

1. **Search before reading files** — `code_search` and `docs_search` are faster and more targeted than reading files manually.
2. **Create notes for decisions** — when you make an architectural choice or discover something non-obvious, save it.
3. **Link everything** — link notes to code, tasks to files, skills to docs. Cross-graph links make the knowledge base navigable.
4. **Use `skills_recall` before complex tasks** — there might already be a saved recipe.
5. **Use `tasks_move`** instead of `tasks_update` for status changes — it manages `completedAt` automatically.
6. **Use `docs_cross_references`** to get the full picture — it bridges code definitions with documentation examples.
7. **Bump skill usage** after applying a skill — it helps surface frequently used recipes.
8. **Use `tasks_find_linked`** when working on a file — see what tasks are related before making changes.
9. **Attach files** to notes/tasks/skills for screenshots, logs, diagrams, or any supporting artifacts.
10. **Group tasks into epics** — use `epics_create` + `epics_link_task` to organize related work.
