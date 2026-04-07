# FileIndexGraph

**Files**: `src/graphs/file-index.ts`, `src/graphs/file-index-types.ts`, `src/graphs/file-lang.ts`

Indexes ALL project files and directories (not just pattern-matched ones) with metadata, directory hierarchy, and semantic search by path.

## Data model

### Node attributes

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `'file' \| 'directory'` | Node type |
| `filePath` | string | Relative path from projectDir (= node ID) |
| `fileName` | string | Basename (e.g. `"config.ts"`) |
| `directory` | string | Parent directory (e.g. `"src/lib"` or `"."`) |
| `extension` | string | File extension (e.g. `".ts"`, `""` for dirs) |
| `language` | string \| null | Detected language (e.g. `"typescript"`) |
| `mimeType` | string \| null | MIME type (e.g. `"text/typescript"`) |
| `size` | number | Bytes (dirs: total size of direct children files) |
| `embedding` | number[] | Embedded from file path (files only; `[]` for dirs) |
| `mtime` | number | File mtimeMs (dirs: 0) |

### Node ID format

- **Files**: relative file path — `"src/lib/config.ts"`
- **Directories**: directory path — `"src/lib"`
- **Root**: `"."`

### Edge types

| Type | Description |
|------|-------------|
| `contains` | directory → child (file or subdirectory) |

## Language detection

**File**: `src/graphs/file-lang.ts`

Extension-based lookup map supporting ~80 file extensions. Examples:

| Extension | Language |
|-----------|----------|
| `.ts`, `.tsx` | `typescript` |
| `.js`, `.jsx` | `javascript` |
| `.py` | `python` |
| `.rs` | `rust` |
| `.go` | `go` |
| `.md` | `markdown` |
| `.json` | `json` |
| `.yaml`, `.yml` | `yaml` |

Unknown extensions → `null`.

## MIME detection

Uses the `mime` npm library (IANA-complete database). Unknown types → `null`.

## Manager: FileIndexGraphManager

### Read operations

| Method | Description |
|--------|-------------|
| `listAllFiles(opts)` | List files/dirs with filters (directory, extension, language, substring) |
| `getFileInfo(filePath)` | Full metadata for a file or directory |
| `search(query, opts)` | Hybrid BM25 + vector search (RRF fusion) over file path embeddings |

### Write operations (used by indexer)

| Method | Description |
|--------|-------------|
| `updateFileEntry(entry)` | Add/update a file node with its directory chain |
| `removeFileEntry(filePath)` | Remove a file node |

## Directory chain

When a file is added, the indexer automatically creates directory nodes up to the root:
```
src/lib/config.ts → creates nodes for "src/lib", "src", "."
```
Each directory → child relationship gets a `contains` edge.

## Embeddings

Only **file nodes** have embeddings (embedded from the file path string). Directory nodes have empty embeddings (`[]`) and are not returned by search.

## Persistence

Stored as `file-index.json` in the `graphMemory` directory.
