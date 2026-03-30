---
slug: file-mirror
title: "File Mirror — Edit AI Memory in Your IDE"
authors: [graphmemory]
tags: [feature, workflow, ide, developer-experience]
description: "Every note, task, and skill in Graph Memory is mirrored as a markdown file you can edit in your IDE, commit to git, and review in PRs."
---

Graph Memory stores notes, tasks, and skills as nodes in a graph. But graphs aren't git-friendly. You can't diff a graph, review it in a PR, or edit it in VS Code. File mirror solves this by maintaining a bidirectional sync between the graph and plain markdown files on disk.

<!-- truncate -->

## How it works

When you create a note, task, or skill -- via MCP tool, REST API, or the Web UI -- Graph Memory writes it to disk as a directory with three files:

```
.notes/
  auth-architecture/
    events.jsonl        # append-only event log (source of truth)
    content.md          # human-editable content (plain markdown)
    note.md             # generated snapshot (gitignored)
    attachments/        # optional file attachments

.tasks/
  fix-login-bug/
    events.jsonl
    description.md
    task.md             # generated snapshot (gitignored)

.skills/
  deploy-to-staging/
    events.jsonl
    description.md
    skill.md            # generated snapshot (gitignored)
```

Each entity gets its own directory named by its slug ID. Inside, the **events.jsonl** file is the source of truth -- an append-only log of every create, update, and relation change. The **content.md** (or **description.md**) file holds the human-readable body text. The **snapshot file** (note.md, task.md, skill.md) is a generated read-only view with YAML frontmatter -- it's gitignored because it gets regenerated from events + content.

## What a mirrored file looks like

Here's what a task looks like on disk. The `description.md` is plain markdown:

```markdown
Implement rate limiting on the /api/auth endpoints.
Use a sliding window counter with Redis backing.
Allow 10 requests per minute per IP.
```

The generated `task.md` snapshot combines frontmatter with the full content:

```yaml
---
id: rate-limit-auth
status: in_progress
priority: high
order: 0
tags:
  - security
  - api
assignee: "alice"
dueDate: "2026-04-15T00:00:00.000Z"
estimate: 4
completedAt: null
createdAt: "2026-03-28T10:00:00.000Z"
updatedAt: "2026-03-30T14:30:00.000Z"
version: 3
relations:
  - to: auth-service-hardening
    kind: blocks
  - to: "@code::src/middleware/rate-limit.ts::RateLimiter"
    kind: relates_to
    graph: code
---
# Rate Limit Auth Endpoints

Implement rate limiting on the /api/auth endpoints.
Use a sliding window counter with Redis backing.
Allow 10 requests per minute per IP.
```

The frontmatter contains all structural metadata: status, priority, tags, timestamps, relations. Cross-graph links show up as relations with a `graph` field.

## Bidirectional sync

The sync works in both directions:

**Graph to file:** When a mutation happens in the graph (via MCP tool, REST, or UI), the graph manager calls `mirrorNoteCreate`, `mirrorTaskUpdate`, etc. These functions use atomic writes (write to temp file, then rename) to prevent corruption from concurrent reads. After writing, the `MirrorWriteTracker` records the file's mtime so the watcher knows to ignore its own writes.

**File to graph:** A [chokidar](https://github.com/paulmillr/chokidar) watcher monitors `.notes/`, `.tasks/`, and `.skills/` at depth 3 (to catch attachments). When a file changes, the watcher:

1. Checks `MirrorWriteTracker` -- if this was our own write, skip it (prevents feedback loops)
2. Classifies the file (events.jsonl, content.md, snapshot, or attachment)
3. Enqueues the import through the `PromiseQueue` (same queue as MCP mutations)
4. Parses the directory and calls `importFromFile` on the graph manager

The `MirrorWriteTracker` uses mtime comparison with a tolerance window to reliably detect our own writes vs external edits. It evicts stale entries to prevent unbounded memory growth.

## Editing in your IDE

The most immediate benefit: open `.tasks/fix-login-bug/description.md` in your editor, change the description, save. The watcher picks it up, re-parses the directory, and updates the graph. The Web UI updates in real time via WebSocket.

You can also edit the snapshot files directly. If you change the status field in `task.md` from `todo` to `in_progress`, the watcher detects the delta against the current graph state, appends an update event to `events.jsonl`, writes the new description to `description.md`, and re-imports everything. This works for any frontmatter field: status, priority, tags, due dates.

## Git workflow

The file structure is designed for git. The `.gitignore` inside `.notes/`, `.tasks/`, and `.skills/` excludes the generated snapshot files (`*/note.md`, `*/task.md`, `*/skill.md`), so only the source-of-truth files get committed:

- `events.jsonl` -- full audit trail of every change
- `content.md` / `description.md` -- human-readable content
- `attachments/` -- associated files

This means you can:

- **Review AI-generated tasks in a PR.** Your AI assistant creates tasks via MCP tools, the files appear in the diff, and teammates review them like any other code change.
- **Track decisions over time.** The events.jsonl gives you a complete history of every field change with timestamps.
- **Merge across branches.** Since events.jsonl is append-only, git merges usually succeed without conflicts. On the next server startup, `scanMirrorDirs` detects any files newer than the graph and re-imports them.
- **Collaborate across machines.** Pull, start the server, and the mirror scan picks up everything your teammates added.

## Startup scan

When the server starts, `scanMirrorDirs` walks all three directories and compares each entity's file mtime against the graph's `updatedAt` timestamp. If the file is newer (e.g., after a `git pull` brought in new events), it re-imports the entity. This handles the case where files changed while the server was down.

```
Startup:
  for each .notes/{id}/ directory:
    if events.jsonl mtime > graph node updatedAt:
      parseNoteDir(entityDir) → importFromFile()
  (same for .tasks/ and .skills/)
```

## Conflict resolution

The system avoids conflicts by design:

- **Structural changes** (status, priority, tags) go through the event log. The graph manager replays all events on import, so the last event wins.
- **Content changes** are file-level. If you edit `content.md` while the server is running, the watcher picks it up immediately. If you edit it while the server is down, the startup scan catches it.
- **Concurrent edits** from MCP and file system are serialized through the same `PromiseQueue`. There's no race condition because both paths go through `enqueue()`.

The one edge case: if you edit `content.md` in your IDE at the exact same moment an MCP tool updates it, the queue serializes them. Whichever enqueues second overwrites the first. In practice, this doesn't happen -- humans and AI rarely edit the same note body simultaneously.

---

File mirror makes AI memory tangible. It's not locked in a database or hidden behind an API. It's markdown files in your project, editable in your IDE, reviewable in PRs, trackable in git history.

[Get started with Graph Memory](/docs/getting-started/quick-start) or [read the full docs on file mirror](/docs/concepts/graphs).
