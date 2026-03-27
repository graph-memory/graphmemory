# MCP Tools — Detailed Guide

67 tools organized into 10 groups. Each tool is a separate module in `src/api/tools/`.

## How tools work

### Registration

Tools are conditionally registered based on which graphs are enabled:

| Group | Count | Registered when | On mutation server |
|-------|-------|-----------------|-------------------|
| Context | 1 | always | no |
| Docs | 5 | docs graph enabled | no |
| Code blocks | 4 | docs graph enabled | no |
| Cross-graph | 1 | docs + code both enabled | no |
| Code | 5 | code graph enabled | no |
| File index | 3 | file index enabled | no |
| Knowledge | 12 | knowledge graph enabled | yes (mutations) |
| Tasks | 14 | task graph enabled | yes (mutations) |
| Epics | 8 | task graph enabled | yes (mutations) |
| Skills | 14 | skill graph enabled | yes (mutations) |

### Read vs mutation tools

**Read tools** (list, get, search) run freely without queueing — they read graph state directly.

**Mutation tools** (create, update, delete, move, link) are registered on a **mutation server proxy** that wraps every handler in a `PromiseQueue`. This ensures serial execution of all graph writes, even from parallel MCP sessions.

### Response format

All tools return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Error cases return `{ isError: true }`.

---

## Context tools

### `get_context`

Returns the current project and workspace context. Use this first to understand what's available.

**Input**: none

**Output**:
```json
{
  "projectId": "my-app",
  "workspaceId": "backend",
  "workspaceProjects": ["api-gateway", "catalog-service"],
  "hasWorkspace": true
}
```

**When to use**: At the start of a session to discover available graphs and workspace context.

---

## Docs tools

### `docs_list_files`

List all indexed markdown files.

**Input**: optional `filter`, `limit`
**Output**: `[{ fileId, title, chunks }]`

**When to use**: To get an overview of available documentation.

### `docs_get_toc`

Table of contents for a specific documentation file.

**Input**: `fileId` (e.g. `"docs/auth.md"`)
**Output**: `[{ id, title, level }]`

**When to use**: Before diving into a doc file — see its structure first.

### `docs_search`

Semantic search over documentation with BFS expansion.

**Input**:
| Param | Default | Description |
|-------|---------|-------------|
| `query` | (required) | Search query |
| `topK` | 5 | Seed results for BFS |
| `bfsDepth` | 1 | BFS expansion hops |
| `maxResults` | 5 | Max results |
| `minScore` | 0.5 | Minimum relevance |
| `bfsDecay` | 0.8 | Score decay per hop |
| `searchMode` | `hybrid` | `hybrid`, `vector`, `keyword` |

**Output**: `[{ id, fileId, title, content, level, score }]`

**When to use**: Finding relevant documentation sections by meaning. Always prefer this over reading files directly.

### `docs_get_node`

Full content of a specific doc chunk.

**Input**: `nodeId` (e.g. `"docs/auth.md::JWT Tokens"`)
**Output**: `{ id, fileId, title, content, level, mtime }`

**When to use**: After search finds a relevant chunk — get the full text.

### `docs_search_files`

File-level semantic search (by path + title).

**Input**: `query`, optional `limit` (default 10), `minScore` (default 0.3)
**Output**: `[{ fileId, title, chunks, score }]`

**When to use**: Finding which documentation files are relevant before drilling into sections.

---

## Code block tools

### `docs_find_examples`

Find code blocks in documentation that contain a specific symbol.

**Input**: `symbol` (required), optional `limit`
**Output**: `[{ id, fileId, language, symbols, content, parentId, parentTitle }]`

**When to use**: "Show me examples of how `UserService` is used in the docs."

### `docs_search_snippets`

Semantic search over code blocks extracted from documentation.

**Input**: `query`, optional `limit`, `minScore`, `language`
**Output**: `[{ id, fileId, language, symbols, content, score }]`

**When to use**: Finding code examples by what they do, not just what symbols they contain.

### `docs_list_snippets`

List code blocks with optional filters.

**Input**: optional `fileId`, `language`, `filter` (substring)
**Output**: `[{ id, fileId, language, symbols, preview }]`

**When to use**: Browsing all code examples in docs, optionally filtered by language.

### `docs_explain_symbol`

Find a code example and its surrounding text explanation.

**Input**: `symbol` (required), optional `fileId`
**Output**: `{ codeBlock, explanation, fileId }`

**When to use**: Understanding how a symbol works — gets both the code example and the prose that explains it.

---

## Cross-graph tools

### `docs_cross_references`

Full picture: code definitions + documentation examples + explanations for a symbol.

**Input**: `symbol` (required)
**Output**: `{ definitions, documentation, examples }`

**When to use**: Getting complete context — the code definition from CodeGraph, plus examples and explanations from DocGraph. **Requires both docs and code to be enabled.**

---

## Code tools

### `code_list_files`

List all indexed source files.

**Input**: none
**Output**: `[{ fileId, symbolCount }]`

### `code_get_file_symbols`

List all symbols in a source file, sorted by line number.

**Input**: `fileId` (e.g. `"src/auth.ts"`)
**Output**: `[{ id, kind, name, signature, startLine, endLine, isExported }]`

**When to use**: Getting an overview of a file's structure — like an IDE outline.

### `code_search`

Semantic search over code symbols with BFS expansion.

**Input**: `query` + optional search params (same as `docs_search`)
**Output**: `[{ id, fileId, kind, name, signature, docComment, startLine, endLine, score }]`

**When to use**: Finding code by what it does. "Find the function that handles password hashing."

### `code_get_symbol`

Full source body of a specific symbol.

**Input**: `nodeId` (e.g. `"src/auth.ts::hashPassword"`)
**Output**: `{ id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported }`

**When to use**: Reading the full implementation of a specific function, class, or method.

### `code_search_files`

File-level semantic search over source files (by path).

**Input**: `query`, optional `limit`, `minScore`
**Output**: `[{ fileId, score }]`

**When to use**: Finding relevant source files before diving into symbols.

---

## File index tools

### `files_list`

List all project files and directories with filters.

**Input**:
| Param | Default | Description |
|-------|---------|-------------|
| `directory` | — | Filter by parent directory |
| `extension` | — | Filter by extension (e.g. `".ts"`) |
| `language` | — | Filter by language (e.g. `"typescript"`) |
| `filter` | — | Substring match on path |
| `limit` | 50 | Max results |

**Output**: `[{ filePath, kind, fileName, extension, language, mimeType, size, fileCount }]`

### `files_search`

Semantic search over files by path.

**Input**: `query`, optional `limit` (default 10), `minScore` (default 0.3)
**Output**: `[{ filePath, fileName, extension, language, size, score }]`

**When to use**: "Find files related to database configuration."

### `files_get_info`

Full metadata for a file or directory.

**Input**: `filePath` (e.g. `"src/lib/embedder.ts"`)
**Output**: `{ filePath, kind, fileName, directory, extension, language, mimeType, size, fileCount, mtime }`

---

## Knowledge tools

### `notes_create`

Create a note with title, content, and tags. Auto-generates slug ID, embeds content, writes mirror file.

**Input**: `title` (required), `content` (required), optional `tags`
**Output**: `{ noteId }`

### `notes_update`

Partial update — only send fields to change. Re-embeds if title or content changes.

**Input**: `noteId` + optional `title`, `content`, `tags`
**Output**: `{ noteId, updated }`

### `notes_delete`

Deletes the note, all relations, orphaned proxy nodes, and mirror directory.

**Input**: `noteId`
**Output**: `{ noteId, deleted }`

### `notes_get`

Fetch a note by ID. Returns null for proxy nodes.

**Input**: `noteId`
**Output**: `{ id, title, content, tags, createdAt, updatedAt }`

### `notes_list`

List notes with optional filters. Excludes proxy nodes.

**Input**: optional `filter` (substring), `tag`, `limit`
**Output**: `[{ id, title, tags, updatedAt }]`

### `notes_search`

Hybrid search with BFS expansion. Excludes proxy nodes.

**Input**: `query` + optional search params
**Output**: `[{ id, title, content, tags, score }]`

### `notes_create_link`

Create a relation between notes, or from a note to an external node.

**Input**: `fromId`, `toId`, `kind`, optional `targetGraph`
**Output**: `{ fromId, toId, kind, targetGraph?, created }`

When `targetGraph` is set, validates the target exists in the external graph and creates a phantom proxy node.

### `notes_delete_link`

Delete a relation. Cleans up orphaned proxy nodes.

**Input**: `fromId`, `toId`, optional `targetGraph`
**Output**: `{ fromId, toId, deleted }`

### `notes_list_links`

List all relations for a note (incoming + outgoing). Resolves proxy IDs to original node IDs transparently.

**Input**: `noteId`
**Output**: `[{ fromId, toId, kind, targetGraph? }]`

### `notes_find_linked`

Reverse lookup: find all notes that link to a specific external node.

**Input**: `targetId`, `targetGraph`
**Output**: `[{ noteId, kind }]`

**When to use**: Before modifying code — check if any notes document it. "What notes reference `src/auth.ts::login`?"

### `notes_add_attachment` / `notes_remove_attachment`

Add or remove file attachments.

**Input**: `noteId`, `filename`, `content` (base64 for add)
**Output**: `{ noteId, filename, added/removed }`

---

## Task tools

### `tasks_create`

**Input**: `title` (required) + optional `description`, `status`, `priority`, `tags`, `dueDate`, `estimate`, `assignee`
**Output**: `{ taskId }`

### `tasks_update`

Partial update. Also handles `completedAt` automation if status changes.

### `tasks_delete`

Deletes task, all relations, proxies, and mirror directory.

### `tasks_get`

Returns enriched data: subtasks, blockedBy, blocks, related, crossLinks.

### `tasks_list`

Filtered list sorted by priority (critical→low) then dueDate (earliest first, nulls last).

**Input**: optional `status`, `priority`, `tag`, `filter`, `assignee`, `limit`

### `tasks_search`

Hybrid search over tasks.

### `tasks_move`

Change status with automatic `completedAt` management.

**Input**: `taskId`, `status`
- → `done`/`cancelled`: sets `completedAt`
- → any other: clears `completedAt`

**When to use**: Always use `tasks_move` instead of `tasks_update` for status changes.

### `tasks_link`

Create task↔task relation: `subtask_of`, `blocks`, `related_to`.

### `tasks_create_link` / `tasks_delete_link`

Same-graph (task↔task) or cross-graph links to docs/code/files/knowledge/skills nodes. `targetGraph` is optional — omit for task-to-task links.

### `tasks_find_linked`

Reverse lookup: find tasks linking to a specific node.

**When to use**: Before modifying a file — "are there open tasks related to this code?"

### `tasks_reorder`

Reposition a task within its status column using gap-based ordering.

**Input**: `taskId` (required), optional `beforeId`, `afterId`
**Output**: `{ taskId, order }`

**When to use**: When the user wants to reorder tasks within a column. Place a task between two others by specifying `beforeId` and/or `afterId`.

### `tasks_add_attachment` / `tasks_remove_attachment`

File attachments on tasks.

---

## Epic tools

Epics group related tasks into larger units of work. They live in the same TaskGraph using a `nodeType: "epic"` discriminator and connect to tasks via `belongs_to` edges.

### `epics_create`

**Input**: `title` (required) + optional `description`, `status`, `priority`, `tags`
**Output**: `{ epicId }`

### `epics_update`

Partial update of epic fields.

**Input**: `epicId` + optional `title`, `description`, `status`, `priority`, `tags`, `expectedVersion`
**Output**: `{ epicId, updated }`

### `epics_delete`

Deletes the epic and its `belongs_to` edges. Linked tasks are not deleted.

**Input**: `epicId`
**Output**: `{ epicId, deleted }`

### `epics_get`

Returns the epic with its linked tasks list.

**Input**: `epicId`
**Output**: `{ id, title, description, status, priority, tags, tasks, createdAt, updatedAt }`

### `epics_list`

List epics with optional filters, sorted by priority then creation date.

**Input**: optional `status`, `priority`, `tag`, `filter`, `limit`
**Output**: `[{ id, title, description, status, priority, tags, taskCount, createdAt, updatedAt }]`

### `epics_search`

Semantic search over epics.

**Input**: `query` + optional `topK`, `maxResults`, `minScore`, `searchMode`
**Output**: `[{ id, title, description, status, priority, tags, score }]`

### `epics_link_task`

Link a task to an epic (creates a `belongs_to` edge from task to epic).

**Input**: `epicId`, `taskId`
**Output**: `{ epicId, taskId, linked }`

**When to use**: Grouping tasks under a larger initiative.

### `epics_unlink_task`

Remove the `belongs_to` edge between a task and an epic.

**Input**: `epicId`, `taskId`
**Output**: `{ epicId, taskId, unlinked }`

---

## Skill tools

### `skills_create`

**Input**: `title` (required) + optional `description`, `steps`, `triggers`, `inputHints`, `filePatterns`, `source`, `confidence`, `tags`
**Output**: `{ skillId }`

### `skills_update` / `skills_delete` / `skills_get` / `skills_list` / `skills_search`

Standard CRUD + search (same patterns as knowledge/tasks).

### `skills_recall`

Search with lower `minScore` (0.3 vs 0.5) for higher recall.

**When to use**: At the start of a complex task — "what recipes might be relevant?" Cast a wider net than `skills_search`.

### `skills_bump_usage`

Increment `usageCount` + set `lastUsedAt`.

**When to use**: After successfully applying a skill's recipe.

### `skills_link` / `skills_create_link` / `skills_delete_link` / `skills_find_linked`

Same relation patterns as knowledge/tasks. `skills_create_link` and `skills_delete_link` support optional `targetGraph` — omit for skill-to-skill links.

### `skills_add_attachment` / `skills_remove_attachment`

File attachments on skills.

---

## Best practices

1. **Search before reading files** — `code_search` and `docs_search` are faster and more targeted
2. **Use `get_context` first** — know what graphs are available
3. **Create notes for decisions** — persist architectural choices and non-obvious context
4. **Use `skills_recall` before complex tasks** — there might be a saved recipe
5. **Use `tasks_move`** for status changes, not `tasks_update` — manages `completedAt` automatically
6. **Use `docs_cross_references`** for complete symbol context — bridges code and docs
7. **Use `tasks_find_linked`** before changing code — see related tasks
8. **Bump skill usage** after applying a recipe — surfaces frequently used skills
9. **Link everything** — connect notes to code, tasks to files, skills to docs
