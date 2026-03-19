# File Index — Purpose and Design

## The idea

DocGraph indexes markdown files. CodeGraph indexes source code. But a real project has dozens of other file types — configs, images, scripts, data files, lock files, dockerfiles, CI configs. The FileIndexGraph gives the LLM a **complete map of the project filesystem**.

This answers questions like:
- "What files are in the `src/lib/` directory?"
- "Is there a Dockerfile in this project?"
- "What TypeScript files exist in the project?"
- "How big is the `dist/` directory?"

## What gets indexed

**Everything.** Every file and directory in `projectDir` that doesn't match the `excludePattern` gets a node in the FileIndexGraph. This includes:

- Source files (`.ts`, `.js`, `.py`, `.go`, etc.)
- Config files (`.json`, `.yaml`, `.toml`, `.env`)
- Documentation (`.md`, `.txt`, `.rst`)
- Images (`.png`, `.jpg`, `.svg`)
- Scripts (`.sh`, `.bat`)
- Data files (`.csv`, `.sql`)
- Build artifacts (if not excluded)
- Lock files (`package-lock.json`)
- Anything else

The key difference from DocGraph/CodeGraph: those graphs only index files matching their patterns. FileIndexGraph indexes **all** files.

## File nodes

Each file gets a node with rich metadata:

| Field | Description | Example |
|-------|-------------|---------|
| `filePath` | Relative path (= node ID) | `src/lib/embedder.ts` |
| `fileName` | Basename | `embedder.ts` |
| `directory` | Parent directory | `src/lib` |
| `extension` | File extension | `.ts` |
| `language` | Detected programming language | `typescript` |
| `mimeType` | IANA MIME type | `text/typescript` |
| `size` | File size in bytes | `4096` |
| `mtime` | Last modification time | `1710547200000` |

### Language detection

Extension-based lookup supporting ~80 file types:

`.ts` → `typescript`, `.py` → `python`, `.rs` → `rust`, `.go` → `go`, `.java` → `java`, `.rb` → `ruby`, `.md` → `markdown`, `.json` → `json`, `.yaml` → `yaml`, `.sh` → `shell`, `.sql` → `sql`, `.html` → `html`, `.css` → `css`, etc.

Unknown extensions → `null`.

### MIME detection

Uses the `mime` npm library (IANA-complete database):

`.ts` → `text/typescript`, `.png` → `image/png`, `.json` → `application/json`, etc.

## Directory nodes

Directories also get nodes in the graph:

| Field | Value |
|-------|-------|
| `kind` | `directory` |
| `filePath` | `src/lib` |
| `size` | Sum of direct children file sizes |
| `fileCount` | Count of direct children files |
| `embedding` | `[]` (empty — directories are not searchable) |

### Directory chain

When a file is indexed, the system automatically creates nodes for every directory up to the root:

```
src/lib/parsers/code.ts →
  creates "src/lib/parsers" (directory)
  creates "src/lib" (directory)
  creates "src" (directory)
  creates "." (root directory)
```

Each directory → child relationship gets a `contains` edge:

```
"." → [contains] → "src"
"src" → [contains] → "src/lib"
"src/lib" → [contains] → "src/lib/parsers"
"src/lib/parsers" → [contains] → "src/lib/parsers/code.ts"
```

### Directory stats

After the indexer finishes scanning all files, `rebuildDirectoryStats()` walks the tree bottom-up and computes:
- `size` — total bytes of direct children files
- `fileCount` — count of direct children files

This lets you answer questions like "how big is the src/ directory?" without summing file sizes manually.

## Semantic search by path

File paths are **embedded** — the path string itself is converted into a vector. This enables semantic search:

```
search_all_files({ query: "authentication configuration" })
→ finds src/lib/auth.ts, src/config/auth.yaml, etc.
```

The embeddings capture semantic meaning in file names and directory structure, so "auth" finds "authentication" and related concepts.

Only file nodes have embeddings — directory nodes have empty embeddings and are excluded from search results.

## What this enables

### Project structure discovery

An LLM starting a new conversation can quickly understand the project layout:

```
list_all_files({ directory: "src/", limit: 50 })
→ complete listing of source files
```

### File type analysis

"What configuration files does this project have?"

```
list_all_files({ extension: ".yaml" })
list_all_files({ extension: ".json" })
list_all_files({ language: "yaml" })
```

### Semantic file search

"Find files related to database migrations"

```
search_all_files({ query: "database migration" })
→ src/db/migrations/, src/scripts/migrate.ts, etc.
```

### File metadata

"How big is this file? When was it last modified?"

```
get_file_info({ filePath: "src/lib/embedder.ts" })
→ { size: 4096, mtime: ..., language: "typescript", mimeType: "text/typescript" }
```

### Cross-graph context

Notes, tasks, and skills can link to specific files:

```
create_relation({
  fromId: "deployment-config-note",
  toId: "docker-compose.yaml",
  targetGraph: "files",
  kind: "documents"
})
```

This connects knowledge about configuration to the actual file, regardless of whether that file is a doc or source code.

## Relationship to DocGraph and CodeGraph

| Graph | What it indexes | How | Purpose |
|-------|----------------|-----|---------|
| **DocGraph** | Markdown files matching docs pattern | Parses into heading chunks, extracts code blocks | Semantic search over documentation content |
| **CodeGraph** | Source files matching code pattern | Parses AST, extracts symbols | Semantic search over code symbols |
| **FileIndexGraph** | **ALL files** | Stores metadata + path embedding | File discovery, project structure, metadata |

A single file can exist in all three graphs simultaneously:
- `docs/api.md` → DocGraph (chunks) + FileIndexGraph (metadata)
- `src/auth.ts` → CodeGraph (symbols) + FileIndexGraph (metadata)
- `Dockerfile` → FileIndexGraph only (no docs/code pattern match)

## Configuration

The FileIndexGraph is always enabled — it has no separate `pattern` setting. It indexes everything that passes the project's `excludePattern`:

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    excludePattern: "node_modules/**,dist/**,.git/**"
    graphs:
      files:
        enabled: true    # can be disabled if not needed
```
