# Graph Memory — AI Assistant Prompt

> Copy the section below into your `CLAUDE.md`, `.cursorrules`, or equivalent AI assistant configuration file.

---

## Graph Memory

You have access to **Graph Memory** — an MCP server that maintains a semantic graph of this project. Use it as your primary source of context before reading files directly.

### When to use

- **Before diving into code** — search first, read files second. Graph Memory already indexed the codebase and docs.
- **To find relevant code** — `search_code` finds symbols by meaning, not just name. Use it instead of grepping.
- **To find documentation** — `search` finds relevant doc sections even if the wording differs from your query.
- **To understand a symbol** — `get_symbol` returns full source, `explain_symbol` returns docs + examples, `cross_references` bridges code ↔ docs.
- **To track decisions** — create notes in the knowledge graph so context persists across conversations.
- **To manage work** — create and move tasks through the kanban workflow.
- **To store recipes** — save reusable procedures as skills so they can be recalled later.

### Docs tools

Search and browse indexed markdown documentation.

| Tool | Purpose |
|------|---------|
| `search` | Hybrid search (BM25 + vector) over doc sections with BFS expansion |
| `search_topic_files` | File-level semantic search over docs (by file path + title) |
| `list_topics` | List all indexed markdown files with title and chunk count |
| `get_toc` | Table of contents for a specific doc file |
| `get_node` | Full content of a specific doc section by ID |

### Code block tools

Search code examples extracted from documentation.

| Tool | Purpose |
|------|---------|
| `find_examples` | Find code blocks in docs containing a specific symbol |
| `search_snippets` | Semantic search over code blocks extracted from docs |
| `list_snippets` | List code blocks with filters (file, language, content) |
| `explain_symbol` | Find code example + surrounding text explanation for a symbol |

### Cross-graph tools

| Tool | Purpose |
|------|---------|
| `cross_references` | Full picture for a symbol: code definition + doc examples + explanations |

### Code tools

Search and browse indexed TypeScript/JavaScript source code.

| Tool | Purpose |
|------|---------|
| `search_code` | Hybrid search (BM25 + vector) over code symbols with BFS expansion |
| `search_files` | File-level semantic search over source files (by path) |
| `list_files` | List all indexed source files with symbol counts |
| `get_file_symbols` | List all symbols in a source file (sorted by line) |
| `get_symbol` | Full source body of a specific symbol by ID |

### File index tools

Browse all project files (not just docs/code pattern-matched).

| Tool | Purpose |
|------|---------|
| `search_all_files` | Semantic search over all files by path |
| `list_all_files` | List all files/dirs with filters (directory, extension, language) |
| `get_file_info` | Full metadata for a file or directory |

### Knowledge tools

Persistent knowledge graph for facts, decisions, and notes. Notes are mirrored to `.notes/{id}/note.md`.

| Tool | Purpose |
|------|---------|
| `create_note` | Create a note with title, content, and tags |
| `update_note` | Update note title, content, or tags |
| `delete_note` | Delete a note and all its relations |
| `get_note` | Fetch a note by ID |
| `list_notes` | List notes with optional filter and tag |
| `search_notes` | Hybrid search over notes with BFS expansion |
| `create_relation` | Create relation between notes, or to doc/code/file/task nodes |
| `delete_relation` | Delete a relation (note-to-note or cross-graph) |
| `list_relations` | List all relations for a note (includes cross-graph links) |
| `find_linked_notes` | Reverse lookup: find notes linked to a doc/code/file/task node |
| `add_note_attachment` | Attach a file to a note |
| `remove_note_attachment` | Remove an attachment from a note |

**Example:**
```
create_note({ title: "Why we chose PostgreSQL", content: "...", tags: ["architecture", "database"] })
create_relation({ fromId: "why-we-chose-postgresql", toId: "src/db/connection.ts", targetGraph: "code", kind: "documents" })
```

### Task tools

Kanban task management with workflow: `backlog` → `todo` → `in_progress` → `review` → `done` | `cancelled`. Tasks are mirrored to `.tasks/{id}/task.md`.

| Tool | Purpose |
|------|---------|
| `create_task` | Create a task with title, description, priority, status, tags, dueDate, estimate |
| `update_task` | Update any task fields (partial update) |
| `delete_task` | Delete a task and all its relations |
| `get_task` | Fetch task with subtasks, blockedBy, blocks, and related |
| `list_tasks` | List tasks with filters (status, priority, tag, text) |
| `search_tasks` | Hybrid search over tasks with BFS expansion |
| `move_task` | Change task status (auto-manages `completedAt`) |
| `link_task` | Create task↔task relation (`subtask_of`, `blocks`, `related_to`) |
| `create_task_link` | Link task to a doc/code/file/knowledge node |
| `delete_task_link` | Remove a cross-graph link from a task |
| `find_linked_tasks` | Reverse lookup: find tasks linked to a target node |
| `add_task_attachment` | Attach a file to a task |
| `remove_task_attachment` | Remove an attachment from a task |

**Example:**
```
create_task({ title: "Fix auth redirect loop", description: "...", priority: "high", status: "todo" })
move_task({ taskId: "fix-auth-redirect-loop", status: "in_progress" })
link_task({ fromId: "fix-auth-redirect-loop", toId: "write-auth-tests", kind: "blocks" })
create_task_link({ taskId: "fix-auth-redirect-loop", targetId: "src/auth.ts::login", targetGraph: "code", kind: "fixes" })
```

### Skill tools

Reusable recipes, procedures, and troubleshooting guides. Skills are mirrored to `.skills/{id}/skill.md`.

| Tool | Purpose |
|------|---------|
| `create_skill` | Create a skill with steps, triggers, tags, and metadata |
| `update_skill` | Update any skill fields (partial update) |
| `delete_skill` | Delete a skill and all its relations |
| `get_skill` | Fetch skill with dependsOn/dependedBy/related/variants |
| `list_skills` | List skills with filters (source, tag, text) |
| `search_skills` | Hybrid search over skills with BFS expansion |
| `recall_skills` | Recall relevant skills for a task context (higher recall) |
| `bump_skill_usage` | Increment usage counter + set lastUsedAt |
| `link_skill` | Create skill↔skill relation (`depends_on`, `related_to`, `variant_of`) |
| `create_skill_link` | Link skill to a doc/code/file/knowledge/task node |
| `delete_skill_link` | Remove a cross-graph link from a skill |
| `find_linked_skills` | Reverse lookup: find skills linked to a target node |
| `add_skill_attachment` | Attach a file to a skill |
| `remove_skill_attachment` | Remove an attachment from a skill |

**Example:**
```
create_skill({ title: "Add REST endpoint", description: "...", steps: ["1. Create route file", "2. Add Zod schema", "3. Register in router"], triggers: ["new endpoint", "new API route"], tags: ["api"] })
recall_skills({ query: "add a new API endpoint" })
bump_skill_usage({ skillId: "add-rest-endpoint" })
link_skill({ fromId: "add-rest-endpoint", toId: "debug-authentication-issues", kind: "related_to" })
create_skill_link({ skillId: "add-rest-endpoint", targetId: "src/api/rest/index.ts", targetGraph: "code", kind: "references" })
```

### Best practices

1. **Search before reading files** — `search_code` and `search` are faster and more targeted than reading files manually.
2. **Create notes for decisions** — when you make an architectural choice or discover something non-obvious, save it.
3. **Link everything** — link notes to code, tasks to files, skills to docs. Cross-graph links make the knowledge base navigable.
4. **Use `recall_skills` before complex tasks** — there might already be a saved recipe.
5. **Use `move_task`** instead of `update_task` for status changes — it manages `completedAt` automatically.
6. **Use `cross_references`** to get the full picture — it bridges code definitions with documentation examples.
7. **Bump skill usage** after applying a skill — it helps surface frequently used recipes.
8. **Use `find_linked_tasks`** when working on a file — see what tasks are related before making changes.
9. **Attach files** to notes/tasks/skills for screenshots, logs, diagrams, or any supporting artifacts.
