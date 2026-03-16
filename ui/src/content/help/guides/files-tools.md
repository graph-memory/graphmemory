# File Index Tools

The file index tools provide access to metadata about **every file and directory** in your project. Unlike docs and code tools which only index pattern-matched files, the file index covers the entire project tree.

## Tool overview

| Tool | Purpose | When to use |
|------|---------|-------------|
| `list_all_files` | List files/directories with filters | Browse project structure, filter by extension/language |
| `search_all_files` | Semantic search by file path | Find files by what they might contain |
| `get_file_info` | Get metadata for a specific path | Check size, language, modification date |

## What gets indexed

For every file in the project directory:
- **Path** (relative to project root)
- **File name** and **extension**
- **Size** in bytes
- **Language** (detected from extension: `.ts` → TypeScript, `.md` → Markdown, `.json` → JSON, etc.)
- **MIME type** (e.g., `application/json`, `text/markdown`, `image/png`)
- **Modification time** (`mtime`)

For directories:
- **Aggregate size** (sum of all contained files)
- **File count** (total files in subtree)
- Directory → child edges (`contains`)

## Browsing vs searching

### Directory browsing

`list_all_files` with the `directory` parameter returns **immediate children** (files + subdirectories) of that directory. This is how you browse the project tree:

```
list_all_files({ directory: "." })           → root contents
list_all_files({ directory: "src" })         → src/ contents
list_all_files({ directory: "src/api" })     → src/api/ contents
```

Without `directory`, it returns all files matching filters (flat list, no directories).

### File search

`search_all_files` embeds file paths for semantic search. You can search by:
- Partial paths: `"config"` finds configuration files
- Concepts: `"authentication"` finds files in auth-related directories
- File types: `"typescript source"` finds `.ts` files

The `minScore` default is **0.3** (lower than node search) because file path embeddings are less semantically rich than content embeddings.

## Tool reference

### list_all_files

List project files and directories with optional filters.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `directory` | string | No | — | List immediate children of this directory (e.g. `"."`, `"src/lib"`). Without this, returns all files matching filters |
| `extension` | string | No | — | Filter by extension (e.g. `".ts"`, `".md"`, `".png"`) |
| `language` | string | No | — | Filter by detected language (e.g. `"typescript"`, `"markdown"`, `"json"`) |
| `filter` | string | No | — | Substring match on file path (case-insensitive) |
| `limit` | number | No | 50 | Maximum results |

**Returns:** `[{ filePath, kind, fileName, extension, language, mimeType, size, fileCount }]`

- `kind` is `"file"` or `"directory"`
- `fileCount` is present for directories (number of files in subtree)
- `language` and `mimeType` are present for files

**Behavior differences:**
- With `directory` set: returns both files and subdirectories (immediate children only)
- Without `directory`: returns only files (no directories), across the entire project

### search_all_files

Semantic search over file nodes by path embedding. Searches files only (not directories).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search query (natural language or path fragment) |
| `topK` | number | No | 10 | Maximum results |
| `minScore` | number | No | 0.3 | Minimum cosine similarity score (0–1) |

**Returns:** `[{ filePath, fileName, extension, language, size, score }]`

### get_file_info

Get full metadata for a specific file or directory. Use `"."` for the project root.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | string | Yes | Relative file or directory path (e.g. `"src/lib/config.ts"`, `"src/lib"`, `"."`) |

**Returns for files:**
```
{ filePath, kind: "file", fileName, directory, extension, language, mimeType, size, mtime }
```

**Returns for directories:**
```
{ filePath, kind: "directory", fileName, directory, fileCount, size }
```

- `size` for directories is the total size of all direct children
- `fileCount` for directories is the total number of files in the subtree
- `mtime` is the last modification timestamp (files only)

## Cross-graph links

Files can be linked from notes and tasks:

```
// From a knowledge note
create_relation({ fromId: "config-format", toId: "src/config.ts", kind: "documents", targetGraph: "files" })

// From a task
create_task_link({ taskId: "refactor-config", targetId: "src/config.ts", targetGraph: "files", kind: "affects" })
```

Use `find_linked_notes` or `find_linked_tasks` with `targetGraph: "files"` to discover what knowledge or tasks reference a specific file:

```
find_linked_notes({ targetId: "src/auth.ts", targetGraph: "files" })
find_linked_tasks({ targetId: "src/auth.ts", targetGraph: "files" })
```

## Tips

- Use `list_all_files` with `directory` to browse top-down through the project tree
- Use `list_all_files` with `extension: ".ts"` or `language: "typescript"` to find all files of a type
- `get_file_info` on `"."` gives project-level stats (total size, file count)
- `search_all_files` works better with path-like queries than abstract concepts
- File index is always active — no `docsPattern` or `codePattern` configuration needed
- The `language` filter in `list_all_files` uses detected language names like `"typescript"`, `"javascript"`, `"markdown"`, `"json"`, `"yaml"`, `"css"`, `"html"`, `"python"`, etc.
