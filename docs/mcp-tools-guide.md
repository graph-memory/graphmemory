# MCP Tools — Detailed Guide

58 tools organized into 8 groups. Each tool is a separate module in `src/api/tools/`.

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
| File index | 3 | always | no |
| Knowledge | 12 | always | yes (mutations) |
| Tasks | 13 | always | yes (mutations) |
| Skills | 14 | always | yes (mutations) |

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
  "availableGraphs": ["docs", "code", "knowledge", "tasks", "files", "skills"]
}
```

**When to use**: At the start of a session to discover available graphs and workspace context.

---

## Docs tools

### `list_topics`

List all indexed markdown files.

**Input**: none
**Output**: `[{ fileId, title, chunks }]`

**When to use**: To get an overview of available documentation.

### `get_toc`

Table of contents for a specific documentation file.

**Input**: `fileId` (e.g. `"docs/auth.md"`)
**Output**: `[{ id, title, level }]`

**When to use**: Before diving into a doc file — see its structure first.

### `search`

Semantic search over documentation with BFS expansion.

**Input**:
| Param | Default | Description |
|-------|---------|-------------|
| `query` | (required) | Search query |
| `topK` | 5 | Seed results for BFS |
| `bfsDepth` | 1 | BFS expansion hops |
| `maxResults` | 20 | Max results |
| `minScore` | 0.5 | Minimum relevance |
| `bfsDecay` | 0.8 | Score decay per hop |
| `searchMode` | `hybrid` | `hybrid`, `vector`, `keyword` |

**Output**: `[{ id, fileId, title, content, level, score }]`

**When to use**: Finding relevant documentation sections by meaning. Always prefer this over reading files directly.

### `get_node`

Full content of a specific doc chunk.

**Input**: `nodeId` (e.g. `"docs/auth.md::JWT Tokens"`)
**Output**: `{ id, fileId, title, content, level, mtime }`

**When to use**: After search finds a relevant chunk — get the full text.

### `search_topic_files`

File-level semantic search (by path + title).

**Input**: `query`, optional `topK` (default 10), `minScore` (default 0.3)
**Output**: `[{ fileId, title, score }]`

**When to use**: Finding which documentation files are relevant before drilling into sections.

---

## Code block tools

### `find_examples`

Find code blocks in documentation that contain a specific symbol.

**Input**: `symbol` (required), optional `language`, `fileId`
**Output**: `[{ id, fileId, language, symbols, content, parentId, parentTitle }]`

**When to use**: "Show me examples of how `UserService` is used in the docs."

### `search_snippets`

Semantic search over code blocks extracted from documentation.

**Input**: `query`, optional `topK`, `minScore`
**Output**: `[{ id, fileId, language, symbols, content, score }]`

**When to use**: Finding code examples by what they do, not just what symbols they contain.

### `list_snippets`

List code blocks with optional filters.

**Input**: optional `fileId`, `language`, `filter` (substring)
**Output**: `[{ id, fileId, language, symbols, preview }]`

**When to use**: Browsing all code examples in docs, optionally filtered by language.

### `explain_symbol`

Find a code example and its surrounding text explanation.

**Input**: `symbol` (required), optional `fileId`
**Output**: `{ codeBlock, explanation, fileId }`

**When to use**: Understanding how a symbol works — gets both the code example and the prose that explains it.

---

## Cross-graph tools

### `cross_references`

Full picture: code definitions + documentation examples + explanations for a symbol.

**Input**: `symbol` (required)
**Output**: `{ definitions, documentation, examples }`

**When to use**: Getting complete context — the code definition from CodeGraph, plus examples and explanations from DocGraph. **Requires both docs and code to be enabled.**

---

## Code tools

### `list_files`

List all indexed source files.

**Input**: none
**Output**: `[{ fileId, symbolCount }]`

### `get_file_symbols`

List all symbols in a source file, sorted by line number.

**Input**: `fileId` (e.g. `"src/auth.ts"`)
**Output**: `[{ id, kind, name, signature, startLine, endLine, isExported }]`

**When to use**: Getting an overview of a file's structure — like an IDE outline.

### `search_code`

Semantic search over code symbols with BFS expansion.

**Input**: `query` + optional search params (same as `search`)
**Output**: `[{ id, fileId, kind, name, signature, docComment, startLine, endLine, score }]`

**When to use**: Finding code by what it does. "Find the function that handles password hashing."

### `get_symbol`

Full source body of a specific symbol.

**Input**: `nodeId` (e.g. `"src/auth.ts::hashPassword"`)
**Output**: `{ id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported }`

**When to use**: Reading the full implementation of a specific function, class, or method.

### `search_files`

File-level semantic search over source files (by path).

**Input**: `query`, optional `topK`, `minScore`
**Output**: `[{ fileId, score }]`

**When to use**: Finding relevant source files before diving into symbols.

---

## File index tools

### `list_all_files`

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

### `search_all_files`

Semantic search over files by path.

**Input**: `query`, optional `topK` (default 10), `minScore` (default 0.3)
**Output**: `[{ filePath, fileName, extension, language, size, score }]`

**When to use**: "Find files related to database configuration."

### `get_file_info`

Full metadata for a file or directory.

**Input**: `filePath` (e.g. `"src/lib/embedder.ts"`)
**Output**: `{ filePath, kind, fileName, directory, extension, language, mimeType, size, fileCount, mtime }`

---

## Knowledge tools

### `create_note`

Create a note with title, content, and tags. Auto-generates slug ID, embeds content, writes mirror file.

**Input**: `title` (required), `content` (required), optional `tags`
**Output**: `{ noteId }`

### `update_note`

Partial update — only send fields to change. Re-embeds if title or content changes.

**Input**: `noteId` + optional `title`, `content`, `tags`
**Output**: `{ noteId, updated }`

### `delete_note`

Deletes the note, all relations, orphaned proxy nodes, and mirror directory.

**Input**: `noteId`
**Output**: `{ noteId, deleted }`

### `get_note`

Fetch a note by ID. Returns null for proxy nodes.

**Input**: `noteId`
**Output**: `{ id, title, content, tags, createdAt, updatedAt }`

### `list_notes`

List notes with optional filters. Excludes proxy nodes.

**Input**: optional `filter` (substring), `tag`, `limit`
**Output**: `[{ id, title, tags, updatedAt }]`

### `search_notes`

Hybrid search with BFS expansion. Excludes proxy nodes.

**Input**: `query` + optional search params
**Output**: `[{ id, title, content, tags, score }]`

### `create_relation`

Create a relation between notes, or from a note to an external node.

**Input**: `fromId`, `toId`, `kind`, optional `targetGraph`
**Output**: `{ fromId, toId, kind, targetGraph?, created }`

When `targetGraph` is set, validates the target exists in the external graph and creates a phantom proxy node.

### `delete_relation`

Delete a relation. Cleans up orphaned proxy nodes.

**Input**: `fromId`, `toId`, optional `targetGraph`
**Output**: `{ fromId, toId, deleted }`

### `list_relations`

List all relations for a note (incoming + outgoing). Resolves proxy IDs to original node IDs transparently.

**Input**: `noteId`
**Output**: `[{ fromId, toId, kind, targetGraph? }]`

### `find_linked_notes`

Reverse lookup: find all notes that link to a specific external node.

**Input**: `targetId`, `targetGraph`
**Output**: `[{ noteId, kind }]`

**When to use**: Before modifying code — check if any notes document it. "What notes reference `src/auth.ts::login`?"

### `add_note_attachment` / `remove_note_attachment`

Add or remove file attachments.

**Input**: `noteId`, `filename`, `content` (base64 for add)
**Output**: `{ noteId, filename, added/removed }`

---

## Task tools

### `create_task`

**Input**: `title` (required) + optional `description`, `status`, `priority`, `tags`, `dueDate`, `estimate`, `assignee`
**Output**: `{ taskId }`

### `update_task`

Partial update. Also handles `completedAt` automation if status changes.

### `delete_task`

Deletes task, all relations, proxies, and mirror directory.

### `get_task`

Returns enriched data: subtasks, blockedBy, blocks, related, crossLinks.

### `list_tasks`

Filtered list sorted by priority (critical→low) then dueDate (earliest first, nulls last).

**Input**: optional `status`, `priority`, `tag`, `filter`, `assignee`, `limit`

### `search_tasks`

Hybrid search over tasks.

### `move_task`

Change status with automatic `completedAt` management.

**Input**: `taskId`, `status`
- → `done`/`cancelled`: sets `completedAt`
- → any other: clears `completedAt`

**When to use**: Always use `move_task` instead of `update_task` for status changes.

### `link_task`

Create task↔task relation: `subtask_of`, `blocks`, `related_to`.

### `create_task_link` / `delete_task_link`

Cross-graph links to docs/code/files/knowledge/skills nodes.

### `find_linked_tasks`

Reverse lookup: find tasks linking to a specific node.

**When to use**: Before modifying a file — "are there open tasks related to this code?"

### `add_task_attachment` / `remove_task_attachment`

File attachments on tasks.

---

## Skill tools

### `create_skill`

**Input**: `title` (required) + optional `description`, `steps`, `triggers`, `inputHints`, `filePatterns`, `source`, `confidence`, `tags`
**Output**: `{ skillId }`

### `update_skill` / `delete_skill` / `get_skill` / `list_skills` / `search_skills`

Standard CRUD + search (same patterns as knowledge/tasks).

### `recall_skills`

Search with lower `minScore` (0.3 vs 0.5) for higher recall.

**When to use**: At the start of a complex task — "what recipes might be relevant?" Cast a wider net than `search_skills`.

### `bump_skill_usage`

Increment `usageCount` + set `lastUsedAt`.

**When to use**: After successfully applying a skill's recipe.

### `link_skill` / `create_skill_link` / `delete_skill_link` / `find_linked_skills`

Same relation patterns as knowledge/tasks.

### `add_skill_attachment` / `remove_skill_attachment`

File attachments on skills.

---

## Best practices

1. **Search before reading files** — `search_code` and `search` are faster and more targeted
2. **Use `get_context` first** — know what graphs are available
3. **Create notes for decisions** — persist architectural choices and non-obvious context
4. **Use `recall_skills` before complex tasks** — there might be a saved recipe
5. **Use `move_task`** for status changes, not `update_task` — manages `completedAt` automatically
6. **Use `cross_references`** for complete symbol context — bridges code and docs
7. **Use `find_linked_tasks`** before changing code — see related tasks
8. **Bump skill usage** after applying a recipe — surfaces frequently used skills
9. **Link everything** — connect notes to code, tasks to files, skills to docs
