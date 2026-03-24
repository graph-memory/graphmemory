# How Code Indexing Works

## The idea

Source code has rich structure — functions call other functions, classes implement interfaces, files import modules. IDE features like "Go to definition" use this structure, but they require the IDE to be open and the code to be loaded.

Graph Memory extracts this structure into a **persistent graph** that any LLM can query. Instead of reading entire source files, an LLM can search by meaning ("find the function that handles user authentication"), jump to specific symbols, and follow relationships.

## From source to graph

### Step 1: Parse the AST with tree-sitter

Each source file is parsed using **web-tree-sitter** (WASM-based parser). The system uses a **language mapper architecture**:

1. File extension → language name (via `file-lang.ts`): `.ts` → `typescript`, `.js` → `javascript`
2. Language name → tree-sitter WASM grammar + language mapper
3. Parser produces an AST (Abstract Syntax Tree)
4. Language mapper extracts symbols, edges, and imports from the AST

Currently supported languages for full AST parsing:
- **TypeScript** (`.ts`, `.mts`, `.cts`)
- **TSX** (`.tsx`)
- **JavaScript** (`.js`, `.mjs`, `.cjs`)
- **JSX** (`.jsx`)

Other languages are recognized at the file level (for the FileIndexGraph), but don't get symbol-level extraction.

### Step 2: Extract symbols

The language mapper walks the AST and extracts **top-level declarations**:

| Declaration type | Kind | Examples |
|-----------------|------|---------|
| Function declarations | `function` | `function login()`, `export function createUser()` |
| Function signatures (ambient) | `function` | `declare function fetch(url: string): Promise<any>` |
| Arrow / function expressions | `function` | `const handler = () => { ... }`, `const fn = function() { ... }` |
| Class declarations | `class` | `class UserService { ... }` |
| Abstract class declarations | `class` | `abstract class BaseRepo { ... }` |
| Class constructors | `constructor` | `constructor(db: Database)` |
| Class methods | `method` | `getUser()`, `private validate()` |
| Abstract methods | `method` | `abstract findById(id: string): Entity` |
| Interface declarations | `interface` | `interface User { ... }` |
| Interface method signatures | `method` | `process(item: T): void` (inside interface body) |
| Interface property signatures | `variable` | `readonly name: string` (inside interface body) |
| Type aliases | `type` | `type Status = 'active' \| 'inactive'` |
| Enum declarations | `enum` | `enum Role { Admin, User }` |
| Variables (const/let) | `variable` | `export const MAX_RETRIES = 3`, `let counter = 0` |

For each symbol, the parser extracts:
- **name** — symbol name
- **signature** — everything before the body (truncated to 300 chars), uses AST `bodyNode.startPosition.column` for accurate slicing (handles destructured params and type annotations with braces)
- **docComment** — JSDoc block (`/** ... */`) from the preceding comment node
- **body** — full source text
- **startLine / endLine** — 1-based line numbers
- **isExported** — whether the symbol is exported

Classes get special treatment — constructors, methods, and fields are extracted as **child nodes** with `contains` edges from the class node. Interfaces extract property and method signatures as children. Functions can contain **nested named function declarations** (1 level deep), also extracted as children.

Generic type parameters are handled transparently: `Foo<T>` extracts the base type name `"Foo"` for extends/implements edges, so `class Repo extends Base<Entity>` creates an `extends` edge to `Base`.

### Step 3: Extract relationships

Three types of structural edges:

**Contains**: file → symbol, class → method
```
src/auth.ts
  ├── [contains] → src/auth.ts::UserService
  │                  ├── [contains] → src/auth.ts::UserService::login
  │                  └── [contains] → src/auth.ts::UserService::validate
  └── [contains] → src/auth.ts::hashPassword
```

**Imports**: file → file (resolved relative imports)
```
src/routes.ts [imports] → src/auth.ts
```

Import resolution tries multiple patterns:
1. Exact match: `./auth.ts`
2. Extension search: `./auth` → tries `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`
3. Index files: `./auth/` → tries `./auth/index.ts`, `./auth/index.js`, etc.

Import resolution also supports **tsconfig/jsconfig path aliases** (e.g., `@/lib/utils` → `src/lib/utils.ts`). The nearest `tsconfig.json` or `jsconfig.json` is found by walking up from the file's directory. JSONC comments in config files are stripped correctly (preserving string contents).

External packages (bare specifiers like `express`, `graphology`) are skipped.

**Extends / implements**: class → class/interface (intra-file resolved immediately; cross-file deferred)
```
src/admin.ts::AdminService [extends] → src/admin.ts::UserService
src/admin.ts::AdminService [implements] → src/admin.ts::Auditable
```

**Re-exports**: `export { Foo } from './bar'` creates an `imports` edge to the source file, same as regular imports.

### Step 4: Embed symbols

Each symbol is embedded from its `signature + docComment + body`. The signature captures the structural identity, the docComment provides semantic intent, and the body gives the full implementation context. The embedder's `maxChars` limit (default 24000) handles truncation for large functions.

File root nodes get a `fileEmbedding` from the file path — used for file-level search ("find files related to authentication").

Like docs, code symbols are embedded in **batch** — all symbols from one file in a single forward pass.

### Step 5: Build the graph

The resulting graph connects files, symbols, and their relationships:

```
src/auth.ts (file)
  ├── [contains] → src/auth.ts::UserService (class)
  │                  ├── [contains] → src/auth.ts::UserService::login (method)
  │                  └── [contains] → src/auth.ts::UserService::validate (method)
  ├── [contains] → src/auth.ts::hashPassword (function)
  └── [imports] → src/utils.ts (file)

src/admin.ts (file)
  ├── [imports] → src/auth.ts
  └── [contains] → src/admin.ts::AdminService (class)
                     └── [extends] → src/admin.ts::UserService
```

## The file root node

Every indexed source file gets a root node with kind `file`. This node stores:
- **docComment** — the file-level JSDoc comment (first `/** ... */` before any declaration)
- **body** — a summary of all import statements (for context)
- **startLine/endLine** — 1 to last line

This gives LLMs file-level context without reading the entire file.

## Deferred edge resolution

Cross-file edges (`imports`, `extends`, `implements`) require the target to exist in the graph. If the target hasn't been indexed yet, the edge is **stored as pending** on the file node:

- **pendingImports** — unresolved import targets (file IDs)
- **pendingEdges** — unresolved extends/implements (class name + kind)

After the full scan completes, the indexer calls `resolvePendingImports()` and `resolvePendingEdges()` to create edges for targets that now exist. Any remaining unresolved edges stay as pending metadata for future re-indexes.

## What this enables

### Semantic code search

"Find the function that hashes passwords" → `code_search` finds `hashPassword` by meaning, not by grepping for "hash" or "password" in function names.

### Symbol lookup

`code_get_symbol("src/auth.ts::UserService::login")` → returns full source body, signature, JSDoc, line numbers. An LLM gets exactly the code it needs.

### Structural navigation

`code_get_file_symbols("src/auth.ts")` → lists all symbols sorted by line number. Like a miniature IDE outline.

### Cross-graph bridging

`docs_cross_references("loginUser")` → finds the code definition AND any documentation examples or explanations that reference this symbol.

## Configuration

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphs:
      code:
        include: "**/*.{js,ts,jsx,tsx,mjs,mts,cjs,cts}"   # default — indexes all JS/TS files (incl. ESM and CJS variants)
        exclude: "**/generated/**"        # skip certain paths
        enabled: true
```
