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
| Arrow functions assigned to const | `function` | `const handler = () => { ... }` |
| Class declarations | `class` | `class UserService { ... }` |
| Class methods | `method` | `constructor()`, `getUser()`, `private validate()` |
| Interface declarations | `interface` | `interface User { ... }` |
| Type aliases | `type` | `type Status = 'active' \| 'inactive'` |
| Enum declarations | `enum` | `enum Role { Admin, User }` |
| Exported variables | `variable` | `export const MAX_RETRIES = 3` |

For each symbol, the parser extracts:
- **name** — symbol name
- **signature** — first line (max 200 chars), includes JSDoc if present
- **docComment** — JSDoc block (`/** ... */`) from the preceding comment node
- **body** — full source text
- **startLine / endLine** — 1-based line numbers
- **isExported** — whether the symbol is exported

Classes get special treatment — methods are extracted as **child nodes** with `contains` edges from the class node.

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

Only relative imports (`./`, `../`) are resolved — external packages are skipped.

**Extends / implements**: class → class/interface (same file)
```
src/admin.ts::AdminService [extends] → src/admin.ts::UserService
src/admin.ts::AdminService [implements] → src/admin.ts::Auditable
```

### Step 4: Embed symbols

Each symbol is embedded from its `name + signature + docComment`. This captures both the structural identity and the semantic intent.

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

## Dangling edges

Cross-file edges (`imports`, etc.) require the target file to already be in the graph. If file A imports file B, but file B hasn't been indexed yet, the import edge is **skipped**.

These dangling edges are **not** retroactively created when file B is later indexed. To establish all cross-file edges, either:
- Re-index file A after file B is indexed
- Run a full re-index (`--reindex`)

This is a deliberate trade-off for simplicity — most edge cases resolve naturally during the initial full scan.

## What this enables

### Semantic code search

"Find the function that hashes passwords" → `search_code` finds `hashPassword` by meaning, not by grepping for "hash" or "password" in function names.

### Symbol lookup

`get_symbol("src/auth.ts::UserService::login")` → returns full source body, signature, JSDoc, line numbers. An LLM gets exactly the code it needs.

### Structural navigation

`get_file_symbols("src/auth.ts")` → lists all symbols sorted by line number. Like a miniature IDE outline.

### Cross-graph bridging

`cross_references("loginUser")` → finds the code definition AND any documentation examples or explanations that reference this symbol.

## Configuration

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphs:
      code:
        include: "**/*.{js,ts,jsx,tsx}"   # default — indexes all JS/TS files
        exclude: "**/generated/**"        # skip certain paths
        enabled: true
```
