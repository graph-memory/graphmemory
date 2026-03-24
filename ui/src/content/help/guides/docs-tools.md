# Documentation Tools

The docs tools let you search, browse, and navigate your indexed markdown documentation. They're available when `graphs.docs.include` is configured in your project (default: `**/*.md`).

## Tool overview

| Tool | Purpose | When to use |
|------|---------|-------------|
| `docs_list_files` | List all indexed files | Get an overview of available documentation |
| `docs_get_toc` | Get table of contents for a file | Understand the structure of a specific document |
| `docs_search` | Semantic search across all docs | Find information without knowing which file has it |
| `docs_get_node` | Get full content of a section | Read the actual content after finding it via search |
| `docs_search_files` | Search at file level | Find which files are most relevant to a topic |
| `docs_find_examples` | Find code blocks containing a specific symbol | Look up usage examples of a known function/class |
| `docs_search_snippets` | Semantic search across code blocks | Find code examples by description |
| `docs_list_snippets` | List code blocks in a file | Discover what code examples exist in docs |
| `docs_explain_symbol` | Get symbol's code block + surrounding docs context | Understand what a symbol does via documentation |
| `docs_cross_references` | Find symbol across code AND docs | Most comprehensive symbol lookup (see dedicated guide) |

## Typical workflow

### 1. Discover what's documented

Start with `docs_list_files` to see all indexed markdown files. This gives you file IDs and titles.

### 2. Search by meaning

Use `docs_search` with a natural language query. For example:
- `"how to set up authentication"` — finds auth-related sections
- `"database migration process"` — finds migration docs

The search returns scored results with `id`, `title`, `content` preview, and `score`.

### 3. Read full content

Take the `id` from search results and pass it to `docs_get_node` to read the full section content, including any code blocks.

### 4. Navigate structure

Use `docs_get_toc` with a file ID to see the full heading hierarchy. This helps when you want to explore a specific document top-to-bottom.

## Code block tools

When markdown is indexed, fenced code blocks (` ```lang ... ``` `) are extracted as child nodes. TypeScript/JavaScript blocks are additionally parsed with tree-sitter to extract top-level symbol names into the `symbols` field. This enables powerful code example discovery.

### docs_find_examples

Searches the `symbols` array of code blocks for an exact symbol name match. Use this when you know the function/class name and want to find documentation examples.

Returns: `{ id, fileId, language, symbols, content, parentId, parentTitle }`

### docs_search_snippets

Semantic search across code block nodes only. Unlike `docs_find_examples` (exact name), this works with natural language descriptions like "authentication example" or "database query".

Supports a `language` filter to narrow results (e.g., `"typescript"`, `"python"`).

Returns: `{ id, fileId, language, symbols, content, score }`

### docs_list_snippets

Lists code blocks with optional filters. Useful for exploring what examples exist in a specific file.

Filters: `fileId` (specific file), `language` (e.g., "typescript"), `filter` (substring match on content).

Returns: `{ id, fileId, language, symbols, preview }`

### docs_explain_symbol

The most context-rich symbol lookup in docs. For each match, returns both the **code block** and the **parent text section** that provides narrative context/explanation around the example.

Returns: `{ codeBlock: { id, language, symbols, content }, explanation: { id, title, content } | null, fileId }`

## Tool reference

### docs_list_files

List indexed documentation files with optional filtering.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filter` | string | No | — | Case-insensitive substring to match against file paths |
| `limit` | number | No | 20 | Maximum number of results |

**Returns:** `[{ fileId, title, chunks }]`

### docs_get_toc

Return the table of contents (heading hierarchy) for a specific file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File path relative to docs dir, e.g. `"docs/auth.md"` |

**Returns:** `[{ id, title, level }]` — `id` can be passed to `docs_get_node`

### docs_search

Semantic search over all indexed documentation sections.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language search query |
| `topK` | number | No | 5 | Number of seed nodes (1–500) |
| `bfsDepth` | number | No | 1 | Hops to follow cross-document links (0–10) |
| `maxResults` | number | No | 20 | Maximum results (1–500) |
| `minScore` | number | No | 0.5 | Minimum relevance score (0–1) |
| `bfsDecay` | number | No | 0.8 | Score multiplier per graph hop (0–1) |
| `searchMode` | string | No | `hybrid` | `hybrid`, `vector`, or `keyword` |

**Returns:** `[{ id, fileId, title, content, level, score }]`

### docs_get_node

Return the full content of a specific doc node (file root or section).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Yes | Node ID, e.g. `"docs/auth.md"` or `"docs/auth.md::Overview"` |

**Returns:** `{ id, fileId, title, content, level, links, mtime }`

Node IDs have two forms:
- `"docs/auth.md"` — file root (intro text before first heading)
- `"docs/auth.md::Overview"` — named section
- `"docs/auth.md::Overview::code-1"` — code block within a section

### docs_search_files

Semantic search at file level (not section level). Faster than `docs_search` when you just need to identify relevant files.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language search query |
| `limit` | number | No | 10 | Maximum results |
| `minScore` | number | No | 0.3 | Minimum relevance score (0–1) |

**Returns:** `[{ fileId, title, chunks, score }]`

### docs_find_examples

Find code blocks containing a specific symbol by exact name match.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `symbol` | string | Yes | — | Symbol name, e.g. `"createUser"`, `"UserService"` |
| `limit` | number | No | 20 | Max results |

**Returns:** `[{ id, fileId, language, symbols, content, parentId, parentTitle }]`

### docs_search_snippets

Semantic search over code block nodes only.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language search query |
| `limit` | number | No | 10 | Max results |
| `minScore` | number | No | 0.3 | Minimum relevance score (0–1) |
| `language` | string | No | — | Filter by language (e.g., `"typescript"`, `"python"`) |

**Returns:** `[{ id, fileId, language, symbols, content, score }]`

### docs_list_snippets

List code blocks with optional filters.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `fileId` | string | No | — | Filter by file |
| `filter` | string | No | — | Substring match on content (case-insensitive) |
| `language` | string | No | — | Filter by language |
| `limit` | number | No | 20 | Max results |

**Returns:** `[{ id, fileId, language, symbols, preview }]`

### docs_explain_symbol

Find documentation that explains a symbol — returns both code example and surrounding text.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `symbol` | string | Yes | — | Symbol name, e.g. `"createUser"` |
| `limit` | number | No | 10 | Max results |

**Returns:** `[{ codeBlock: { id, language, symbols, content }, explanation: { id, title, content } | null, fileId }]`

## Tips

- Use `docs_search` for broad exploration, `docs_get_node` for targeted reading
- `docs_search_files` is faster than `docs_search` when you just need to know which file covers a topic
- `docs_find_examples` is for exact symbol name lookup; `docs_search_snippets` is for natural language queries
- `docs_explain_symbol` gives the richest context — both the code example and the documentation around it
- Lower `minScore` to 0.3 when exploring unfamiliar codebases
- Set `bfsDepth: 0` in `docs_search` for pure vector search without graph expansion
- Set `bfsDepth: 2` to discover more loosely related content
