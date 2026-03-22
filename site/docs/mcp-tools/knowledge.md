---
title: "Knowledge Tools"
sidebar_label: "Knowledge"
sidebar_position: 8
description: "12 MCP tools for managing notes, relations, and attachments in the knowledge graph — create, update, search, and link notes to other graphs."
keywords: [knowledge graph, notes, relations, create_note, search_notes, cross-graph links, attachments]
---

# Knowledge Tools

These 12 tools manage the **knowledge graph** — a persistent store of notes, facts, and decisions with typed relations and cross-graph links. Notes are automatically mirrored to `.notes/` markdown files for IDE access.

:::info
These tools are **always available**. Mutation tools (marked below) are hidden when the knowledge graph is set to `readonly`.
:::

## create_note {#create_note}

> **Mutation** — hidden in readonly mode

Creates a new note with automatic slug ID generation, embedding, and file mirror.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `title` | Yes | Note title |
| `content` | Yes | Note content (markdown supported) |
| `tags` | No | Array of tags for categorization |

### Returns

`{ noteId }` — the generated note ID (slug of the title).

### When to use

Persist architectural decisions, non-obvious context, or facts that should survive across conversations.

---

## update_note {#update_note}

> **Mutation** — hidden in readonly mode

Partially updates a note. Only send the fields you want to change. Re-embeds automatically if title or content changes.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `noteId` | Yes | Note ID to update |
| `title` | No | New title |
| `content` | No | New content |
| `tags` | No | New tags (replaces existing) |

### Returns

`{ noteId, updated }` — confirmation with timestamp.

---

## delete_note {#delete_note}

> **Mutation** — hidden in readonly mode

Deletes the note, all its relations, orphaned proxy nodes, and the mirror directory.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `noteId` | Yes | Note ID to delete |

### Returns

`{ noteId, deleted }` — confirmation.

---

## get_note

Fetches a note by ID.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `noteId` | Yes | Note ID |

### Returns

`{ id, title, content, tags, createdAt, updatedAt }` — full note content and metadata.

---

## list_notes

Lists notes with optional filters. Excludes internal proxy nodes.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `filter` | No | — | Substring match on title |
| `tag` | No | — | Filter by tag |
| `limit` | No | 20 | Maximum results |

### Returns

Array of `{ id, title, tags, updatedAt }`.

---

## search_notes

Hybrid semantic search over notes with BFS graph expansion.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query (natural language) |
| `topK` | No | 5 | Seed results for BFS |
| `bfsDepth` | No | 1 | BFS expansion hops |
| `maxResults` | No | 20 | Maximum results |
| `minScore` | No | 0.5 | Minimum relevance score |
| `bfsDecay` | No | 0.8 | Score decay per hop |
| `searchMode` | No | `hybrid` | `hybrid`, `vector`, or `keyword` |

### Returns

Array of `{ id, title, content, tags, score }` — matching notes ranked by relevance.

### When to use

Finding notes by meaning. For instance: "What did we decide about the authentication approach?"

---

## create_relation {#create_relation}

> **Mutation** — hidden in readonly mode

Creates a typed relation between two notes, or from a note to a node in another graph.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `fromId` | Yes | Source note ID |
| `toId` | Yes | Target note ID or external node ID |
| `kind` | Yes | Relation type (free-form string, e.g. `"references"`, `"contradicts"`, `"extends"`) |
| `targetGraph` | No | If linking to another graph: `"docs"`, `"code"`, `"files"`, `"tasks"`, `"skills"` |
| `projectId` | No | Target project ID (for cross-project links in workspaces) |

### Returns

`{ fromId, toId, kind, targetGraph?, created }`.

### When to use

Connect notes to each other or to nodes in other graphs. When `targetGraph` is set, Graph Memory validates the target exists and creates a phantom proxy node for the connection.

---

## delete_relation {#delete_relation}

> **Mutation** — hidden in readonly mode

Deletes a relation and cleans up orphaned proxy nodes.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `fromId` | Yes | Source note ID |
| `toId` | Yes | Target note ID or external node ID |
| `targetGraph` | No | Target graph (if cross-graph link) |
| `projectId` | No | Target project ID |

### Returns

`{ fromId, toId, deleted }`.

---

## list_relations

Lists all relations for a note (both incoming and outgoing). Resolves proxy IDs to original node IDs transparently.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `noteId` | Yes | Note ID |

### Returns

Array of `{ fromId, toId, kind, targetGraph? }`.

---

## find_linked_notes

Reverse lookup: finds all notes that link to a specific node in another graph.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `targetId` | Yes | Target node ID in the external graph |
| `targetGraph` | Yes | Which graph the target is in (`"docs"`, `"code"`, `"files"`, `"tasks"`, `"skills"`) |
| `kind` | No | Filter by relation kind |
| `projectId` | No | Target project ID |

### Returns

Array of `{ noteId, title, kind, tags }`.

### When to use

Before modifying code, check if any notes document it. For instance: "What notes reference `src/auth.ts::login`?"

---

## add_note_attachment {#add_note_attachment}

> **Mutation** — hidden in readonly mode

Attaches a file to a note. The file is copied into the note's mirror directory.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `noteId` | Yes | Note ID |
| `filePath` | Yes | Absolute path to the file on disk |

### Returns

`{ filename, mimeType, size, addedAt }`.

:::note
Max 10 MB per file. Max 20 attachments per entity.
:::

---

## remove_note_attachment {#remove_note_attachment}

> **Mutation** — hidden in readonly mode

Removes a file attachment from a note.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `noteId` | Yes | Note ID |
| `filename` | Yes | Filename to remove |

### Returns

`{ deleted: filename }`.
