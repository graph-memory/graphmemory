# KnowledgeGraph

**Files**: `src/graphs/knowledge.ts`, `src/graphs/knowledge-types.ts`

User/LLM-created notes and facts with typed relations, cross-graph links, and file attachments. CRUD-only graph — not populated by the indexer.

## Data model

### Node attributes

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Note title |
| `content` | string | Note body text |
| `tags` | string[] | Free-form tags for filtering |
| `embedding` | number[] | L2-normalized vector; `[]` until embedded |
| `createdAt` | number | Epoch ms |
| `updatedAt` | number | Epoch ms |
| `createdBy` | string | Author (from config) |
| `updatedBy` | string | Author (from config) |
| `version` | number | Incremented on every mutation (starts at 1) |
| `attachments` | AttachmentMeta[] | File attachment metadata list |
| `proxyFor` | object | Present only on phantom proxy nodes |

### Node ID format

Slug from title: `"auth-uses-jwt"`. Duplicates get `"auth-uses-jwt::2"`, `"auth-uses-jwt::3"`, etc.

### Edge attributes

```typescript
{ kind: string }  // free-form: "relates_to", "depends_on", "documents", etc.
```

### Edge types

- **Note-to-note**: directed relation with free-form `kind`
- **Cross-graph**: note → phantom proxy node (see [Graphs Overview](graphs-overview.md))

## Cross-graph links

`notes_create_link` supports `targetGraph` parameter to link a note to external nodes:

| targetGraph | Proxy ID example |
|-------------|-----------------|
| `docs` | `@docs::guide.md::Setup` |
| `code` | `@code::auth.ts::Foo` |
| `files` | `@files::src/config.ts` |
| `tasks` | `@tasks::implement-auth` |
| `skills` | `@skills::add-rest-endpoint` |

Proxy nodes have empty embeddings and are excluded from list/search.

## Attachments

Notes support file attachments stored in `.notes/{id}/` alongside the `note.md` mirror file.

- `addAttachment(noteId, filename, content)` — write file to disk
- `removeAttachment(noteId, filename)` — delete file
- `syncAttachments(noteId)` — rebuild metadata from directory scan
- `listAttachments(noteId)` — return `AttachmentMeta[]`

`AttachmentMeta`: `{ filename, mimeType, size, addedAt }`

## File mirror

Every mutation writes `.notes/{id}/note.md`:

```markdown
---
id: my-note
tags: [auth, security]
createdAt: 2026-03-16T10:00:00.000Z
updatedAt: 2026-03-16T10:05:00.000Z
createdBy: "Alice <alice@example.com>"
updatedBy: "Alice <alice@example.com>"
relations:
  - to: fix-auth-bug
    graph: tasks
    kind: relates_to
---

# My Note Title

Content here...
```

Relations include only outgoing edges. The `graph` field is omitted for same-graph relations. Empty relations omit the key entirely.

See [File Mirror](file-mirror.md) for details.

## Manager: KnowledgeGraphManager

### CRUD operations

| Method | Description |
|--------|-------------|
| `createNote(title, content, tags?)` | Create note, embed, mirror to file |
| `updateNote(noteId, fields)` | Partial update, re-embed, re-mirror |
| `deleteNote(noteId)` | Delete note, relations, proxies, mirror dir |
| `getNote(noteId)` | Fetch note by ID (null for proxy nodes) |
| `listNotes(filter?, tag?, limit?)` | List notes (excludes proxies) |
| `searchNotes(query, opts)` | Hybrid search with BFS expansion |

### Relation operations

| Method | Description |
|--------|-------------|
| `createRelation(fromId, toId, kind, targetGraph?)` | Create relation (validates target exists) |
| `deleteRelation(fromId, toId, targetGraph?)` | Delete relation + cleanup orphan proxies |
| `listRelations(noteId)` | List all relations (resolves proxy IDs) |
| `findLinkedNotes(targetId, targetGraph)` | Reverse lookup: notes linking to a target |

### Attachment operations

| Method | Description |
|--------|-------------|
| `addAttachment(noteId, filename, content)` | Add file attachment |
| `removeAttachment(noteId, filename)` | Remove file attachment |

### Import operations

| Method | Description |
|--------|-------------|
| `importFromFile(parsed)` | Update graph from external file edit (no re-mirror) |
| `deleteFromFile(noteId)` | Remove note when mirror file is deleted |

## Persistence

Stored as `knowledge.json` in the `graphMemory` directory. In workspaces, shared across member projects.
