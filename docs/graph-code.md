# CodeGraph

**Files**: `src/graphs/code.ts`, `src/graphs/code-types.ts`, `src/lib/parsers/code.ts`, `src/lib/parsers/languages/`

Stores AST symbols extracted from source files via tree-sitter parsing.

## Data model

### Node kinds

```typescript
type CodeNodeKind =
  | 'file'        // file root (imports + file-level JSDoc)
  | 'function'    // function / arrow function / function expression / ambient function
  | 'class'       // class or abstract class declaration
  | 'method'      // class method or abstract method
  | 'constructor' // class constructor
  | 'interface'   // interface declaration
  | 'type'        // type alias
  | 'enum'        // enum declaration
  | 'variable';   // const / let / var / class field / interface property
```

### Node attributes

| Field | Type | Description |
|-------|------|-------------|
| `kind` | CodeNodeKind | Node type |
| `fileId` | string | Source file relative to `projectDir` |
| `name` | string | Symbol name (e.g. `"updateFile"`) |
| `signature` | string | Declaration header before body (max 300 chars) |
| `docComment` | string | JSDoc comment if present, else `""` |
| `body` | string | Full source text of the declaration |
| `startLine` | number | 1-based start line |
| `endLine` | number | 1-based end line |
| `isExported` | boolean | Whether the symbol is exported |
| `embedding` | number[] | L2-normalized vector; `[]` until embedded |
| `fileEmbedding` | number[] | File-level embedding (file nodes only) |
| `mtime` | number | File mtimeMs at index time |

### Node ID format

- **File root**: `"src/lib/graph.ts"`
- **Top-level symbol**: `"src/lib/graph.ts::updateFile"`
- **Method**: `"src/lib/graph.ts::GraphStore::set"`

### Edge types

| Type | Description |
|------|-------------|
| `contains` | file → top-level symbol; class → method |
| `imports` | file A → file B (resolved relative import) |
| `extends` | class A → class B (base class, same file) |
| `implements` | class A → interface B (same file) |

## Source code parsing

**File**: `src/lib/parsers/code.ts`, `src/lib/parsers/languages/`

Uses **web-tree-sitter** (WASM-based parser) with a language mapper architecture.

### Supported languages

Currently supported for full AST symbol extraction:
- **TypeScript** (`.ts`, `.mts`, `.cts`)
- **TSX** (`.tsx`)
- **JavaScript** (`.js`, `.mjs`, `.cjs`)
- **JSX** (`.jsx`)

Other languages (Python, Go, Rust, etc.) are recognized at the file level but don't get symbol-level extraction — they appear as file-only nodes.

### Language mapper architecture

1. File extension → language name via `file-lang.ts` (`.ts` → `typescript`)
2. Language name → tree-sitter WASM grammar + `LanguageMapper`
3. Parser produces an AST, mapper extracts symbols/edges/imports

Each `LanguageMapper` implements three methods:
- `extractSymbols(rootNode)` — top-level declarations
- `extractEdges(rootNode)` — extends/implements relationships
- `extractImports(rootNode)` — relative import statements

### Extracted declarations

- Functions (including arrow functions assigned to `const`)
- Classes (+ methods as nested nodes)
- Interfaces
- Type aliases
- Enums
- Exported variables

### Parser details

- `signature` = first line of full text (max 200 chars)
- `docComment` = JSDoc block from preceding comment node (`/** ... */`)
- `body` = full source text of the declaration
- `isExported` = detected from `export_statement` wrapper
- Arrow functions assigned to `const` → `kind: "function"`

### Import resolution

Import edges use a custom resolver (not tree-sitter):
1. Exact match: `./foo.ts`
2. Extension search: `./foo` → tries `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`
3. Index files: `./foo/` → tries `./foo/index.ts`, `./foo/index.js`, etc.

Only relative imports (`./`, `../`) are resolved — external packages are skipped. Only imports to files within `codeDir` create edges.

### WASM lazy loading

Tree-sitter parser and language WASM grammars are loaded lazily on first parse. Grammar files come from `@vscode/tree-sitter-wasm`. Loaded Language instances are cached per language.

## Manager: CodeGraphManager

### Read operations

| Method | Description |
|--------|-------------|
| `listFiles()` | List all indexed source files with symbol counts |
| `getFileSymbols(fileId)` | List all symbols in a file (sorted by start line) |
| `getSymbol(nodeId)` | Full source body of a specific symbol |
| `search(query, opts)` | Hybrid search with BFS expansion |
| `searchFiles(query, opts)` | File-level semantic search (by path) |

### Write operations (used by indexer)

| Method | Description |
|--------|-------------|
| `updateFile(parsedFile, embeddings)` | Replace file's nodes and edges |
| `removeFile(fileId)` | Remove all nodes for a file |

## Dangling edges

`updateCodeFile()` skips cross-file edges (e.g. `imports`) whose target node is not yet indexed. These edges are **not** automatically restored when the target is later indexed — the source file must be re-indexed to pick them up.

## File-level embeddings

File root nodes have a `fileEmbedding` field — embedded from the file path only. Used by `search_files` for file-level semantic search.

## Persistence

Stored as `code.json` in the `graphMemory` directory.
