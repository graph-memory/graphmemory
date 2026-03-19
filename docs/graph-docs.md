# DocGraph

**Files**: `src/graphs/docs.ts`, `src/lib/parsers/docs.ts`, `src/lib/parsers/codeblock.ts`

Stores markdown document structure as a graph of heading-based chunks with cross-file links.

## Data model

### Node attributes

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique node ID (see format below) |
| `fileId` | string | Source file relative to `projectDir` |
| `title` | string | Heading text, or filename for root chunk |
| `content` | string | Full text of the section (heading stripped) |
| `level` | number | `1` = file root, `2`-`6` = heading depth |
| `links` | string[] | fileIds of linked files |
| `embedding` | number[] | L2-normalized vector; `[]` until embedded |
| `fileEmbedding` | number[] | File-level embedding (root nodes only) |
| `language` | string | Code block language (code block chunks only) |
| `symbols` | string[] | Extracted symbols (code block chunks only) |
| `mtime` | number | File mtimeMs at index time |

### Node ID format

- **File root**: `"docs/auth.md"` (the fileId itself)
- **Section**: `"docs/auth.md::JWT Tokens"` (fileId + heading text)
- **Duplicate heading**: `"docs/auth.md::Notes::2"` (dedup suffix)
- **Code block**: `"docs/auth.md::JWT Tokens::code-1"` (parent section + index)

### Edge types

| Type | Description |
|------|-------------|
| **Sibling** | chunk → next chunk within the same file (sequential order) |
| **Cross-file** | chunk → root node of linked file (from markdown links) |

## Markdown parsing

**File**: `src/lib/parsers/docs.ts`

`parseFile(content, absolutePath, projectDir, chunkDepth)`:

1. `#` headings are treated as the file title (level 1 root chunk)
2. Headings at depth <= `chunkDepth` (default 4) create chunk boundaries
3. Deeper headings are folded into the parent chunk's content
4. Duplicate heading titles within a file get `::2`, `::3` suffixes

### Link extraction

Recognizes:
- **Markdown links**: `[text](./relative/path.md)` — resolved relative to the file
- **Wiki links**: `[[page name]]` or `[[page name|alias]]` — searched within `projectDir`
- External links (`https://`, etc.) are ignored
- Only links to files that **exist on disk** are recorded

## Code block extraction

**File**: `src/lib/parsers/codeblock.ts`

Fenced code blocks (` ```lang ... ``` `) in markdown are extracted as child chunks:

- Each code block becomes a child chunk with `language` and `symbols` fields
- **TS/JS/TSX/JSX blocks**: parsed with tree-sitter to extract top-level symbol names
- Other languages or parse failures: `symbols = []`
- Untagged blocks: `language = undefined`
- Code block chunk IDs: `"fileId::Section::code-1"` (level = parent level + 1)

## Manager: DocGraphManager

### Read operations

| Method | Description |
|--------|-------------|
| `listFiles()` | List all indexed markdown files with title and chunk count |
| `getToc(fileId)` | Table of contents (heading hierarchy) for a file |
| `getNode(nodeId)` | Full content of a specific chunk |
| `search(query, opts)` | Hybrid search with BFS expansion |
| `searchFiles(query, opts)` | File-level semantic search (by path + title) |
| `findExamples(symbol, opts)` | Find code blocks containing a symbol |
| `searchSnippets(query, opts)` | Search over code blocks |
| `listSnippets(opts)` | List code blocks with filters |
| `explainSymbol(symbol, opts)` | Code block + surrounding text for a symbol |

### Write operations (used by indexer)

| Method | Description |
|--------|-------------|
| `updateFile(chunks, fileId, mtime)` | Replace file's nodes and edges |
| `removeFile(fileId)` | Remove all nodes for a file |

## File-level embeddings

Root nodes (level 1) have a `fileEmbedding` field — embedded from the file path + h1 title. Used by `search_topic_files` for file-level semantic search (simple cosine similarity, no BFS).

## Persistence

Stored as `docs.json` in the `graphMemory` directory. Includes embedding model fingerprint for automatic re-index on model change.
