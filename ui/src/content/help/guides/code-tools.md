# Code Tools

The code tools let you search and navigate your indexed TypeScript/JavaScript source code. They're available when `graphs.code.include` is configured in your project (default: `**/*.{js,ts,jsx,tsx}`).

## Tool overview

| Tool | Purpose | When to use |
|------|---------|-------------|
| `list_files` | List all indexed source files | Get an overview of the codebase |
| `get_file_symbols` | List symbols in a file | Explore a file's exports and structure |
| `search_code` | Semantic search across code symbols | Find functions/classes by what they do |
| `get_symbol` | Get full details of a symbol | Read signature, JSDoc, body, line numbers |
| `search_files` | Search at file level | Find which files are relevant to a topic |

## What gets indexed

The code parser uses tree-sitter to extract:
- **Functions** — name, signature, JSDoc, line range, exported flag
- **Classes** — name, methods, extends/implements relationships
- **Interfaces** and **Types** — name, signature
- **Enums** — name, members
- **Variables** (exported) — name, type
- **Methods** — as children of their parent class

Edges capture structural relationships:
- `contains` — file → symbol, class → method
- `imports` — file → imported file (resolved by import resolver)
- `extends` — class → base class
- `implements` — class → interface

## Node ID format

Code graph node IDs follow a hierarchical pattern:
- `"src/auth.ts"` — file node
- `"src/auth.ts::createUser"` — top-level symbol in file
- `"src/auth.ts::AuthService::login"` — method within a class

## Typical workflow

### 1. Find code by meaning

Use `search_code` with a description of what you're looking for:
- `"user authentication"` — finds auth-related functions and classes
- `"parse markdown into sections"` — finds parsing logic

Unlike grep, this finds code by **what it does**, not by exact text matches.

### 2. Explore a symbol

Use `get_symbol` with the symbol ID from search results. This returns the full picture: signature, JSDoc comment, body text, file location, line numbers, export status.

### 3. Understand file structure

Use `get_file_symbols` to see all symbols in a file — helpful for understanding module organization. The result includes `isExported` flag to distinguish public API from internal helpers.

### 4. Discover relevant files

Use `search_files` for a quick file-level search before diving into symbols. Lighter than `search_code` when you just need to identify which files to explore.

### 5. Cross-reference with docs

Use `cross_references` (requires both `graphs.docs.include` and `graphs.code.include`) to find everywhere a symbol appears — in both code definitions and documentation examples. See the dedicated guide for details.

## Tool reference

### list_files

List indexed source files with optional filtering.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filter` | string | No | — | Case-insensitive substring to match against file paths, e.g. `"graph"` or `"src/lib"` |
| `limit` | number | No | 20 | Maximum number of results |

**Returns:** `[{ fileId, symbolCount }]`

### get_file_symbols

Return all symbols declared in a specific file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fileId` | string | Yes | File path, e.g. `"src/lib/graph.ts"` |

**Returns:** `[{ id, kind, name, signature, startLine, endLine, isExported }]`

Symbol kinds: `function`, `class`, `interface`, `type`, `enum`, `variable`, `method`, `property`.

### search_code

Semantic search over code symbols. Matches against signatures and doc comments using vector similarity, then expands through graph edges.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language or code search query |
| `topK` | number | No | 5 | Number of seed nodes from vector search |
| `bfsDepth` | number | No | 1 | Hops to follow graph edges (imports, contains, extends) from each seed. 0 = no expansion |
| `maxResults` | number | No | 20 | Maximum results to return |
| `minScore` | number | No | 0.5 | Minimum relevance score (0–1) |
| `bfsDecay` | number | No | 0.8 | Score multiplier per graph hop |

**Returns:** `[{ id, fileId, kind, name, signature, docComment, startLine, endLine, score }]`

### get_symbol

Return full details of a specific code symbol.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Yes | Symbol ID, e.g. `"src/lib/graph.ts::updateFile"` or `"src/auth.ts::AuthService::login"` |

**Returns:** `{ id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported }`

The `body` field contains the full implementation text. `docComment` contains the JSDoc comment if present.

### search_files

Semantic search at file level using file path embeddings.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language or path search query |
| `topK` | number | No | 10 | Maximum results |
| `minScore` | number | No | 0.3 | Minimum relevance score (0–1) |

**Returns:** `[{ fileId, symbolCount, score }]`

## Tips

- `search_code` works best with descriptive queries about **what the code does**, not exact symbol names
- For exact name lookup, use `get_symbol` directly with the node ID
- `get_file_symbols` shows `isExported` — useful for distinguishing public API from internals
- `search_files` is useful as a first step when exploring unfamiliar codebases
- The `cross_references` tool (see dedicated guide) is the most comprehensive way to understand a symbol
- BFS expansion in `search_code` follows `imports`, `contains`, and `extends` edges — set `bfsDepth: 2` to discover related modules
- Code graph edges track `imports` for relative imports only (`./ ../` paths); external packages are skipped
