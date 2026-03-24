# Knowledge Tools

The knowledge tools manage a persistent graph of **notes, facts, and decisions**. Unlike docs and code tools that index existing files, the knowledge graph is built manually — capturing information that lives in people's heads.

## Why use a knowledge graph?

Code and docs tell you **what** exists. The knowledge graph captures **why** — architectural decisions, domain knowledge, gotchas, context that doesn't belong in code comments.

Examples:
- "We use JWT instead of sessions because the mobile app needs stateless auth"
- "The billing service has a 30-second timeout — don't chain more than 3 API calls"
- "Users in the 'legacy' tier have different rate limits, check `isLegacy` flag"

## Tool overview

| Tool | Purpose | Type |
|------|---------|------|
| `notes_create` | Create a new note with title, content, tags | Mutation |
| `notes_update` | Update an existing note | Mutation |
| `notes_delete` | Remove a note and all its relations | Mutation |
| `notes_get` | Read a single note by ID | Read |
| `notes_list` | List notes with optional filters | Read |
| `notes_search` | Semantic search across notes | Read |
| `notes_create_link` | Link a note to another note or external node | Mutation |
| `notes_delete_link` | Remove a link | Mutation |
| `notes_list_links` | List all relations for a note | Read |
| `notes_find_linked` | Reverse lookup: find notes that link to an external node | Read |
| `notes_add_attachment` | Attach a file to a note | Mutation |
| `notes_remove_attachment` | Remove an attachment from a note | Mutation |

> **Mutation tools** are serialized through a queue to prevent concurrent graph modifications.

## Note ID generation

Note IDs are slugified from the title:
- "Auth Architecture" → `auth-architecture`
- "JWT Token Format" → `jwt-token-format`

Duplicate titles get a suffix: `auth-architecture::2`, `auth-architecture::3`.

## Tool reference

### notes_create

Create a new note. Automatically embedded for semantic search.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Short title, e.g. `"Auth uses JWT tokens"` |
| `content` | string | Yes | Full text content |
| `tags` | string[] | No | Tags for filtering, e.g. `["architecture", "decision"]` |

**Returns:** `{ noteId }` — the generated slug ID

### notes_update

Update an existing note. Only provided fields change. Re-embeds automatically if title or content changes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `noteId` | string | Yes | ID of the note to update |
| `title` | string | No | New title |
| `content` | string | No | New content |
| `tags` | string[] | No | New tags (replaces existing array entirely) |

**Returns:** `{ noteId, updated: true }`

### notes_delete

Delete a note and all its connected edges (relations, cross-graph links). Orphaned proxy nodes are cleaned up automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `noteId` | string | Yes | ID of the note to delete |

**Returns:** `{ noteId, deleted: true }`

### notes_get

Return the full content of a note.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `noteId` | string | Yes | Note ID, e.g. `"auth-uses-jwt-tokens"` |

**Returns:** `{ id, title, content, tags, createdAt, updatedAt }`

### notes_list

List notes with optional filtering. Sorted by most recently updated.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filter` | string | No | — | Case-insensitive substring match on title or ID |
| `tag` | string | No | — | Filter by tag (exact match, case-insensitive) |
| `limit` | number | No | 20 | Maximum results |

**Returns:** `[{ id, title, tags, updatedAt }]`

### notes_search

Semantic search over the knowledge graph with BFS expansion through note relations.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language search query |
| `topK` | number | No | 5 | Number of seed nodes (1–500) |
| `bfsDepth` | number | No | 1 | Hops to follow relations (0–10) |
| `maxResults` | number | No | 20 | Maximum results (1–500) |
| `minScore` | number | No | 0.5 | Minimum relevance score (0–1) |
| `bfsDecay` | number | No | 0.8 | Score multiplier per hop (0–1) |
| `searchMode` | string | No | `hybrid` | `hybrid`, `vector`, or `keyword` |

**Returns:** `[{ id, title, content, tags, score }]`

### notes_create_link

Create a directed edge from a note to another note or to an external graph node.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromId` | string | Yes | Source note ID |
| `toId` | string | Yes | Target note ID, or target node ID in external graph |
| `kind` | string | Yes | Relation type: `"relates_to"`, `"depends_on"`, `"contradicts"`, `"supports"`, `"part_of"`, `"references"`, etc. |
| `targetGraph` | `"docs"` \| `"code"` \| `"files"` \| `"tasks"` \| `"skills"` | No | Set to create a cross-graph link instead of note-to-note |

**Returns:** `{ fromId, toId, kind, targetGraph, created: true }`

**Cross-graph examples:**
```
notes_create_link({ fromId: "auth-arch", toId: "auth.ts::AuthService", kind: "documents", targetGraph: "code" })
notes_create_link({ fromId: "config-note", toId: "src/config.ts", kind: "references", targetGraph: "files" })
notes_create_link({ fromId: "api-decision", toId: "api-guide.md::Endpoints", kind: "explains", targetGraph: "docs" })
notes_create_link({ fromId: "my-note", toId: "fix-auth-bug", kind: "tracks", targetGraph: "tasks" })
```

### notes_delete_link

Remove a directed edge.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromId` | string | Yes | Source note ID |
| `toId` | string | Yes | Target note ID or external node ID |
| `targetGraph` | `"docs"` \| `"code"` \| `"files"` \| `"tasks"` \| `"skills"` | No | Set when deleting a cross-graph link |

**Returns:** `{ fromId, toId, targetGraph, deleted: true }`

### notes_list_links

List all relations (both incoming and outgoing) for a note. Cross-graph links include `targetGraph` field and resolve the real node ID (not the proxy ID).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `noteId` | string | Yes | Note ID to list relations for |

**Returns:** `[{ fromId, toId, kind, targetGraph? }]`

### notes_find_linked

Reverse lookup: given a node in an external graph, find all notes that link to it.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `targetId` | string | Yes | Target node ID in the external graph, e.g. `"src/config.ts"`, `"auth.ts::login"`, `"api.md::Setup"` |
| `targetGraph` | `"docs"` \| `"code"` \| `"files"` \| `"tasks"` \| `"skills"` | Yes | Which graph the target belongs to |
| `kind` | string | No | Filter by relation kind. If omitted, returns all relations |

**Returns:** `[{ noteId, title, kind, tags }]`

**Use case:** When working on a code file, call `notes_find_linked({ targetId: "src/auth.ts", targetGraph: "code" })` to discover what knowledge notes reference that file.

### notes_add_attachment

Attach a file to a note. The file is copied into the note's directory (`.notes/{noteId}/`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `noteId` | string | Yes | Note ID to attach the file to |
| `filePath` | string | Yes | Absolute path to the file on disk |

**Returns:** `{ noteId, attachment: { filename, mimeType, size } }`

### notes_remove_attachment

Remove an attachment from a note. Deletes the file from disk.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `noteId` | string | Yes | Note ID |
| `filename` | string | Yes | Filename of the attachment to remove |

**Returns:** `{ noteId, filename, deleted: true }`

## Tips

- Use tags consistently for easy filtering (e.g., `decision`, `gotcha`, `todo`, `architecture`)
- Link notes to the code they describe — this creates a navigable knowledge web
- `notes_find_linked` is useful to discover what knowledge exists about a specific code symbol or file
- Notes persist across server restarts (saved as `knowledge.json`)
- The `kind` field on relations is free-form — use whatever makes sense for your domain
- `notes_update` with `tags` replaces the entire array — include all tags you want to keep
- `notes_search` with `bfsDepth: 2` will traverse through related notes to find loosely connected knowledge
- Notes support file attachments — attach images, logs, or any file via `notes_add_attachment`
- Attachments are stored in `.notes/{noteId}/` alongside the note's markdown file
- When the knowledge graph is configured as `readonly: true`, mutation tools (create, update, delete) are hidden from MCP clients and REST mutation endpoints return 403. The UI hides write buttons accordingly.
