---
title: "Knowledge Graph"
sidebar_label: "Knowledge Graph"
sidebar_position: 4
description: "Store decisions, facts, and observations as searchable notes with cross-graph links to code, docs, tasks, and files."
keywords: [knowledge, notes, relations, cross-graph links, memory, decisions, attachments]
---

# Knowledge Graph

The Knowledge Graph is your project's long-term memory. It stores notes, decisions, facts, and observations that don't belong in source code or documentation -- but that you and your AI assistant need to remember.

## Why use knowledge notes?

Code comments explain *what* code does. Documentation explains *how* things work. Knowledge notes capture everything else:

- **Architectural decisions** -- "Why we chose PostgreSQL over MongoDB"
- **Bug investigations** -- "Auth redirect loop root cause was SameSite cookie policy"
- **Non-obvious patterns** -- "Always update the graph before writing the mirror file"
- **Meeting notes** -- "Sprint 12: deferred Feature 6, auth takes priority"
- **Context for future you** -- anything that would save time if you remembered it later

:::tip
Knowledge notes give your AI assistant persistent memory across conversations. When you ask "why did we choose PostgreSQL?", it can search your notes and find the answer -- even months later.
:::

## Creating notes

Use the `notes_create` tool to create a note with a title, content, and optional tags:

```
notes_create({
  title: "Why we chose PostgreSQL over MongoDB",
  content: "We need ACID transactions for payment processing. MongoDB's eventual consistency model doesn't meet our compliance requirements.",
  tags: ["architecture", "database"]
})
```

Each note gets an auto-generated ID based on its title (e.g., `why-we-chose-postgresql-over-mongodb`). The content supports full markdown formatting.

## Tags

Tags help you organize and filter notes. Use them for categories, project areas, or any grouping that makes sense:

```
notes_create({
  title: "Session cookie security",
  content: "...",
  tags: ["security", "auth", "cookies"]
})
```

You can filter notes by tag when listing:

```
notes_list({ tag: "architecture" })
```

## Versioning

Every time a note is updated, its version number increments automatically. The `updatedAt` timestamp and `updatedBy` author are tracked, so you always know when and by whom a note was last changed.

## Relations between notes

Notes can be connected to each other with typed relations:

```
notes_create_link({
  fromId: "auth-architecture",
  toId: "session-management-design",
  kind: "depends_on"
})
```

The `kind` is free-form -- use whatever describes the relationship. Common kinds include:

| Kind | Meaning |
|------|---------|
| `relates_to` | General association |
| `depends_on` | One note builds on another |
| `contradicts` | Notes that disagree (e.g., outdated info) |
| `supersedes` | A newer note replaces an older one |
| `documents` | One note explains another |

## Cross-graph links

The most powerful feature of knowledge notes is linking them to nodes in other graphs. A note about an architectural decision can point directly to the code it affects, the docs that explain it, or the task that implements it.

```
notes_create_link({
  fromId: "why-we-chose-postgresql",
  toId: "src/db/connection.ts",
  targetGraph: "code",
  kind: "documents"
})
```

You can link to any of the other five graphs:

| Target | What you're linking to | Example |
|--------|----------------------|---------|
| `code` | A function, class, or file | `src/auth.ts::UserService` |
| `docs` | A documentation section | `docs/auth.md::JWT Tokens` |
| `files` | Any project file | `src/config.ts` |
| `tasks` | A task | `implement-auth` |
| `skills` | A skill/recipe | `debug-authentication-issues` |

### Reverse lookup

You can also ask: "What notes reference this code symbol?"

```
notes_find_linked({
  targetId: "src/auth.ts::loginUser",
  targetGraph: "code"
})
```

This is useful before modifying code -- check if any notes document design decisions or known issues about it.

:::info
Cross-graph links are validated when created. You can only link to nodes that actually exist. If a linked code file is later removed during re-indexing, the link is automatically cleaned up.
:::

## Searching notes

```
notes_search({ query: "how does authentication work?" })
```

Search combines keyword matching with semantic similarity. This means:
- Exact keyword matches rank high
- Notes with related meaning also appear, even without exact keyword overlap
- Connected notes (via relations) are surfaced alongside direct matches

## Attachments

Notes can have file attachments -- diagrams, screenshots, data files, or anything relevant:

```
notes_add_attachment({
  noteId: "auth-architecture",
  filename: "auth-flow.png",
  content: "<base64-encoded content>"
})
```

Attachments are stored alongside the note's mirror file in the `.notes/` directory:

```
.notes/auth-architecture/
  note.md           # the note content
  auth-flow.png     # attached diagram
  session-data.csv  # supporting data
```

## File mirror

Every note is automatically saved as a markdown file in your project's `.notes/` directory:

```
.notes/auth-architecture/note.md
```

The file includes YAML frontmatter with all metadata:

```markdown
---
id: auth-architecture
tags: [architecture, auth]
createdAt: 2026-03-16T10:00:00.000Z
updatedAt: 2026-03-16T10:05:00.000Z
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

### Editing in your IDE

You can open any note file in your editor, modify the content or frontmatter, and save. Graph Memory detects the change and syncs it back to the graph -- including adding or removing relations you edit in the frontmatter.

This means you can:
- Use your favorite editor to write notes
- Commit notes to git alongside your code
- Review note changes in pull requests
- Use standard text tools to search or batch-edit notes

:::tip
The `.notes/` directory is a great candidate for version control. Committing it means your project's knowledge base travels with the code and is available to every team member.
:::
