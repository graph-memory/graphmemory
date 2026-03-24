# Knowledge Graph — Purpose and Design

## The idea

Code and docs get outdated. Decisions get forgotten. Context from one conversation is lost in the next. The KnowledgeGraph is a **persistent memory layer** where humans and LLMs can store facts, decisions, observations, and any contextual information that doesn't belong in source code or documentation.

Unlike code comments or doc files, knowledge notes are:
- **Semantically searchable** — find notes by meaning, not just keywords
- **Cross-graph linked** — connect a note to the exact code symbol, doc section, task, or file it references
- **Collaboratively authored** — both humans and LLMs can create and update notes
- **Version-controlled** — mirrored to `.notes/{id}/note.md` for git tracking

## What to store

### Architectural decisions

```
notes_create({
  title: "Why we chose PostgreSQL over MongoDB",
  content: "We need ACID transactions for payment processing...",
  tags: ["architecture", "database"]
})

notes_create_link({
  fromId: "why-we-chose-postgresql-over-mongodb",
  toId: "src/db/connection.ts",
  targetGraph: "code",
  kind: "documents"
})
```

Now when someone asks "why do we use PostgreSQL?", `notes_search` finds the answer, and the cross-graph link points to the relevant code.

### Bug investigations

```
notes_create({
  title: "Auth redirect loop root cause",
  content: "The session cookie was not being cleared on logout because SameSite=Lax allows...",
  tags: ["bug", "auth"]
})
```

### Non-obvious patterns

```
notes_create({
  title: "File mirror write ordering matters",
  content: "Always update the graph BEFORE writing the mirror file, because the mirror watcher...",
  tags: ["pattern", "gotcha"]
})
```

### Meeting notes and context

```
notes_create({
  title: "Sprint 12 planning decisions",
  content: "Decided to defer Feature 6. Auth work takes priority...",
  tags: ["sprint-12", "planning"]
})
```

## How it works

### Creating a note

1. **Slug ID** generated from title: `"Why We Chose PostgreSQL"` → `"why-we-chose-postgresql"`. Duplicates get `::2`, `::3` suffixes
2. **Embedding** computed from `title + content` using the configured model
3. **BM25 index** updated for keyword search
4. **Graph node** created with all attributes (title, content, tags, timestamps, embedding)
5. **File mirror** written to `.notes/{id}/note.md` with YAML frontmatter
6. **Event emitted** → WebSocket → UI updates in real time

### Relations

Two types of relations:

#### Note-to-note

```
notes_create_link({
  fromId: "auth-architecture",
  toId: "session-management-design",
  kind: "depends_on"
})
```

Free-form `kind` — any string works. Common kinds: `relates_to`, `depends_on`, `contradicts`, `supersedes`, `documents`.

#### Cross-graph links

```
notes_create_link({
  fromId: "auth-architecture",
  toId: "src/auth.ts::UserService",
  targetGraph: "code",
  kind: "documents"
})
```

Supported target graphs:

| targetGraph | Links to | Proxy ID example |
|-------------|----------|-----------------|
| `docs` | Markdown doc sections | `@docs::guide.md::Setup` |
| `code` | Code symbols | `@code::auth.ts::UserService` |
| `files` | Project files/directories | `@files::src/config.ts` |
| `tasks` | Tasks | `@tasks::implement-auth` |
| `skills` | Skills | `@skills::add-rest-endpoint` |

Cross-graph links use **phantom proxy nodes** — lightweight nodes in the KnowledgeGraph that represent the external target. They have empty embeddings and are invisible to list/search operations.

### Searching

```
notes_search({ query: "how does authentication work?" })
```

Uses hybrid search (BM25 + vector cosine similarity):
1. BM25 scores notes by keyword match
2. Vector search scores by semantic similarity
3. Reciprocal Rank Fusion merges both rankings
4. BFS expansion follows relations to surface connected notes

### Reverse lookup

```
notes_find_linked({
  targetId: "src/auth.ts::loginUser",
  targetGraph: "code"
})
```

"What notes reference this code symbol?" — finds all notes that link to a specific external node. Useful for:
- Before modifying code: check if any notes document its design
- Before starting a task: see what context has been captured
- Understanding why something was built a certain way

## Attachments

Notes support file attachments stored in `.notes/{id}/`:

```
.notes/auth-architecture/
  note.md           # mirror file
  auth-flow.png     # attached diagram
  session-data.csv  # supporting data
```

Use cases:
- Diagrams and architecture drawings
- Screenshots of bugs
- Log files from investigations
- Data files supporting a decision

## File mirror

Every note is mirrored to `.notes/{id}/note.md`:

```markdown
---
id: auth-architecture
tags: [architecture, auth]
createdAt: 2026-03-16T10:00:00.000Z
updatedAt: 2026-03-16T10:05:00.000Z
createdBy: "Alice <alice@example.com>"
updatedBy: "Alice <alice@example.com>"
relations:
  - to: src/auth.ts::UserService
    graph: code
    kind: documents
  - to: session-management-design
    kind: depends_on
---

# Auth Architecture

We use JWT tokens for stateless authentication because...
```

### Frontmatter conventions

- **Relations**: only outgoing edges
- **`graph` field**: omitted for note-to-note relations (same graph)
- **Empty relations**: the `relations` key is omitted entirely
- **Author format**: git-style `"Name <email>"`

### Editing in IDE

You can open `.notes/auth-architecture/note.md` in your editor, change the content, add relations in frontmatter, and save. The mirror watcher detects the change and syncs it back to the graph — including diffing relations to add/remove edges.

## Proxy lifecycle

Cross-graph proxy nodes are managed automatically:

1. **Created** when you make a cross-graph relation (e.g. `notes_create_link` with `targetGraph`)
2. **Validated** — the target node must exist in the external graph
3. **Cleaned up** when they become orphaned (zero edges remaining)
4. **Bulk cleaned** by the indexer when a file is removed — all proxies pointing to nodes from that file are deleted

This means you never deal with stale phantom references — the system keeps them tidy.

## Why not just use code comments?

| Feature | Code comments | Knowledge notes |
|---------|--------------|-----------------|
| Searchable by meaning | No | Yes (vector search) |
| Cross-references | Manual (`// see foo.ts`) | Structured (graph edges) |
| Survives refactoring | Often broken | Links by ID, stable |
| Discovery | Must know file location | `notes_search("why")` |
| Attachments | No | Images, files, data |
| Authored by LLMs | Awkward | Natural workflow |
| Version controlled | Yes | Yes (mirror files) |

Knowledge notes complement code comments — use comments for "what this code does" and notes for "why we made this decision" and "what else is relevant".
