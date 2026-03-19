# File Mirror & Reverse Import

**Files**: `src/lib/file-mirror.ts`, `src/lib/file-import.ts`, `src/lib/frontmatter.ts`, `src/lib/mirror-watcher.ts`

## Overview

Notes, tasks, and skills are mirrored as markdown files with YAML frontmatter:

| Graph | Mirror path | File name |
|-------|------------|-----------|
| KnowledgeGraph | `{projectDir}/.notes/{id}/` | `note.md` |
| TaskGraph | `{projectDir}/.tasks/{id}/` | `task.md` |
| SkillGraph | `{projectDir}/.skills/{id}/` | `skill.md` |

The graph is the **primary data store**. Mirror files are a secondary representation for:
- Git tracking and version control
- IDE editing (with reverse sync)
- Portability and backup

## Write direction: Graph → Files

Every mutation (create, update, delete, move, link/unlink) writes the corresponding mirror file synchronously via `writeFileSync`.

### Note format

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

### Task format

```markdown
---
id: fix-auth-bug
status: in_progress
priority: high
tags: [auth]
assignee: alice
dueDate: 2026-03-20T00:00:00.000Z
estimate: 4
completedAt: null
createdAt: 2026-03-16T10:00:00.000Z
updatedAt: 2026-03-16T10:05:00.000Z
relations:
  - to: my-note
    graph: knowledge
    kind: relates_to
---

# Fix Auth Bug

Description here...
```

### Skill format

```markdown
---
id: add-rest-endpoint
source: user
tags: [api]
triggers: [new endpoint, new API route]
createdAt: 2026-03-16T10:00:00.000Z
updatedAt: 2026-03-16T10:05:00.000Z
relations:
  - to: debug-auth
    kind: related_to
---

# Add REST Endpoint

Description here...
```

### Frontmatter conventions

- **Relations**: only outgoing edges are included
- **`graph` field**: omitted for same-graph relations (e.g. note→note, task→task)
- **Empty relations**: the `relations` key is omitted entirely
- **Author format**: git-style `"Name <email>"`
- **Dates**: ISO 8601 strings

### Delete

`deleteMirrorDir(dir)` removes the entire directory (including attachments).

### Error handling

File I/O is wrapped in try/catch. Errors are logged to stderr but **never thrown** — graph mutations always succeed even if file mirroring fails.

### `projectDir` requirement

File mirroring requires `projectDir` in `GraphManagerContext`. When absent (tests, `noopContext()`), no files are written.

## Read direction: Files → Graph (reverse import)

A separate chokidar watcher on `.notes/`, `.tasks/`, and `.skills/` detects external file edits and syncs them back to the graph.

### MirrorWriteTracker

Prevents feedback loops:

1. After writing a mirror file, record the file's mtime
2. When chokidar fires a change event, compare current mtime to recorded mtime
3. If mtime matches our last write → skip (we wrote it)
4. If mtime differs → external edit → import it

### Startup import

`scanMirrorDirs()` runs on startup. It scans all mirror directories and imports any files whose mtime is newer than the graph node's `updatedAt`. This catches edits made while the server was stopped.

### Import operations

| Function | Description |
|----------|-------------|
| `parseNoteFile(content)` | Parse note mirror file → structured data |
| `parseTaskFile(content)` | Parse task mirror file → structured data |
| `parseSkillFile(content)` | Parse skill mirror file → structured data |
| `diffRelations(current, desired)` | Compare relations → `{ toAdd, toRemove }` |

### Manager import methods

| Method | Description |
|--------|-------------|
| `importFromFile(parsed)` | Update graph from parsed file (no re-mirror) |
| `deleteFromFile(id)` | Remove graph node when mirror file is deleted |

These methods update the graph **without** re-writing the mirror file — avoiding infinite loops.

### Supported editable fields

When editing mirror files externally:

**Notes**: title (from `# Heading`), content, tags, relations

**Tasks**: title, description, status, priority, tags, dueDate, estimate, assignee, relations

**Skills**: title, description, steps, triggers, source, tags, relations

## Attachments

Files stored alongside mirror files:

```
.notes/my-note/
  note.md           # mirror file
  screenshot.png     # attachment
  data.csv          # attachment

.tasks/fix-auth/
  task.md
  error-log.txt

.skills/add-endpoint/
  skill.md
  diagram.png
```

`scanAttachments()` lists all files in the directory **except** the markdown file to build `AttachmentMeta[]`.

## Excluded from indexing

`.notes/`, `.tasks/`, `.skills/`, and `.team/` directories are excluded from the project file watcher — all dotdirs are ignored at the chokidar level. Mirror directories have their own dedicated watcher (see [Watcher](watcher.md)).
