# Indexing Pipeline

The indexer (`src/cli/indexer.ts`) walks the project directory and dispatches files to three independent serial queues for parsing and embedding.

## Architecture

```
File detected (scan or watch event)
  ↓ micromatch pattern matching
  ↓
┌────────────────┬────────────────┬────────────────┐
│   docsQueue    │   codeQueue    │   fileQueue    │
│                │                │                │
│ parseFile()    │ parseCodeFile()│ fs.stat()      │
│ embedBatch()   │ embedBatch()   │ embed()        │
│ updateFile()   │ updateCodeFile │ updateFileEntry │
└────────────────┴────────────────┴────────────────┘
```

## Three independent serial queues

Each queue is a Promise chain — `queue = queue.then(fn).catch(log)`. Errors are logged to stderr but don't stop the queue. The three queues run concurrently with each other.

### Docs queue

1. `parseFile()` — parses markdown into `Chunk[]` (heading-based sections + code blocks)
2. `embedBatch()` — embeds all chunks in one forward pass
3. `updateFile()` — replaces nodes and edges in DocGraph

### Code queue

1. `parseCodeFile()` — extracts AST symbols via tree-sitter
2. `embedBatch()` — embeds all symbols in one forward pass
3. `updateCodeFile()` — replaces nodes and edges in CodeGraph

### File index queue

1. `fs.stat()` — reads file size, mtime
2. `embed()` — embeds the file path
3. `updateFileEntry()` — adds/updates node in FileIndexGraph

## Dispatch logic

When a file is detected:

1. Check against `exclude` — if matches, skip entirely
2. Check against `graphs.docs.include` — if matches, enqueue to docs queue
3. Check against `graphs.code.include` — if matches, enqueue to code queue
4. **All non-excluded files** are always enqueued to the file index queue
5. Check if graph is `enabled: false` — disabled graphs skip their queue

A single file can be dispatched to multiple queues (e.g. a `.ts` file goes to both code and file index queues).

## Operations

### `scan()`

Walks `projectDir` recursively with `fs.readdirSync`. For each entry:
- Skips dotfiles/dotdirs (names starting with `.`)
- Skips `ALWAYS_IGNORED` directories (`node_modules`, `dist`, `build`, etc.) at any nesting level
- Prunes directories matching the exclude pattern (not descended into)
- Dispatches matching files to relevant queues

### `watch()`

Starts a chokidar watcher on `projectDir`. Events:
- `add` / `change` → dispatched to queues (same logic as scan)
- `unlink` → synchronous removal of file's nodes from relevant graphs

See [Watcher](watcher.md) for details.

### `drain()`

```typescript
await Promise.all([docsQueue, codeQueue, fileQueue]);
rebuildDirectoryStats();
```

Waits for all three queues to complete. After draining, rebuilds directory stats in the FileIndexGraph (aggregate size and fileCount up the tree).

## Incremental indexing

Files are skipped if their `mtime` matches what's already stored in the graph node. This means:
- First indexing processes all files
- Subsequent starts only process changed files
- The `--reindex` flag forces re-processing of everything

## Batch embeddings

Docs and code queues use `embedBatch()` to embed all chunks/symbols per file in a single forward pass through the embedding model. This is more efficient than embedding one at a time.

The file index queue uses `embed()` for single items (one file path per call).

## Dangling cross-file edges

`updateCodeFile()` skips cross-file edges (e.g. `imports`) whose target node is not yet indexed. When the target file is later indexed, those edges are **not** automatically restored — the source file must be re-indexed (or a full rescan run) to pick them up.

## Cleanup on file removal

When a file is removed (`unlink` event):
1. Remove file's nodes from DocGraph and/or CodeGraph
2. Remove file's node from FileIndexGraph
3. `cleanupProxies()` — remove orphaned cross-graph proxy nodes in KnowledgeGraph, TaskGraph, and SkillGraph that pointed to the removed file's nodes

## Per-graph patterns

Each graph can have its own include and exclude patterns:

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    # Server default exclude (**/node_modules/**, **/dist/**) always applies.
    # Project-level exclude adds to server defaults:
    exclude: "**/coverage/**"
    graphs:
      docs:
        include: "**/*.md"                # default
        exclude: "**/drafts/**"           # overrides project-level exclude
      code:
        include: "**/*.{js,ts,jsx,tsx}"   # default
```

The graph-level `exclude` overrides the project-level one (not merged).
