# File Watching and Real-time Indexing

The system uses two independent file watchers for real-time updates.

## Project file watcher

**File**: `src/lib/watcher.ts`

Uses chokidar to watch `projectDir` for file changes. Started by the indexer after the initial scan.

### Pattern

Watches `**/*` (all files). Pattern filtering is done in the dispatcher via micromatch, not in chokidar itself.

### Events

| Event | Action |
|-------|--------|
| `add` | Dispatch to docs/code/file index queues based on pattern match |
| `change` | Same as `add` — re-index the file |
| `unlink` | Synchronously remove nodes from all relevant graphs + cleanup proxies |

### Excluded paths

Chokidar's `ignored` function filters paths before they enter the watcher. The following are always excluded at any nesting level:
- **Dotfiles and dotdirs** — any file or directory starting with `.` (e.g. `.git/`, `.env`, `.vscode/`, `.graph-memory/`, `.notes/`, `.tasks/`, `.skills/`)
- **Heavy directories** — `node_modules/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `.turbo/`

Additionally, user-configured `exclude` patterns (from server + workspace + project + graph levels) are applied as glob patterns via micromatch. Both files and directories are tested, so `**/vendor/**` prevents chokidar from descending into `vendor/` at any depth.

### File removal cleanup

When a file is removed:
1. Nodes belonging to that file are removed from DocGraph, CodeGraph, and FileIndexGraph
2. `cleanupProxies()` checks KnowledgeGraph, TaskGraph, and SkillGraph for proxy nodes pointing to the removed nodes
3. Orphaned proxy nodes (those with zero remaining edges) are deleted

## Mirror file watcher

**Files**: `src/lib/mirror-watcher.ts`, `src/lib/file-import.ts`

A separate chokidar watcher on `.notes/`, `.tasks/`, and `.skills/` directories detects external edits (e.g. from an IDE or git pull) and syncs changes back to the graph.

### How it works

1. **MirrorWriteTracker** records the mtime after every write we make to mirror files
2. When a file change event fires, the tracker compares the current mtime to the last write mtime
3. If the mtime differs from our last write, the change is external — import it into the graph
4. If the mtime matches, we wrote it ourselves — skip to prevent feedback loops

### Startup import

On startup, `scanMirrorDirs()` scans all mirror directories and imports any files whose mtime is newer than the corresponding graph node's `updatedAt`. This catches changes made while the server was stopped.

### Import operations

| Operation | Description |
|-----------|-------------|
| `importFromFile()` | Parse mirror file, update graph node without re-writing the mirror |
| `deleteFromFile()` | Remove the graph node when a mirror file is deleted |
| `diffRelations()` | Compare relations in frontmatter against graph edges, apply additions and removals |

### Supported changes

When editing a mirror file externally, you can change:
- **Title** — parsed from the `# Heading` in markdown body
- **Content** — markdown body after the heading
- **Tags** — from YAML frontmatter
- **Relations** — from YAML frontmatter (diffed and applied)
- **Status/priority/dueDate/estimate** — for tasks (from frontmatter)
- **Steps/triggers/source** — for skills (from frontmatter)

### Example

Edit `.tasks/fix-auth-bug/task.md` in your IDE:

```markdown
---
id: fix-auth-bug
status: done
priority: high
tags: [auth, security]
---

# Fix Auth Bug

Updated description from IDE...
```

The watcher detects the change, parses the file, updates the TaskGraph, and the change appears in the web UI via WebSocket push.

## Real-time flow

```
External file edit (IDE, git pull, script)
  → chokidar detects change on .notes/.tasks/.skills/
  → MirrorWriteTracker: "did we write this?" → no (external)
  → parseNoteFile/parseTaskFile/parseSkillFile
  → diffRelations (compare frontmatter vs graph)
  → manager.importFromFile() → graph updated
  → markDirty() + emit() → WebSocket → UI updates
```
