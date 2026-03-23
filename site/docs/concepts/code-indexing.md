---
title: "Code Indexing"
sidebar_label: "Code Indexing"
sidebar_position: 3
description: "How Graph Memory parses source code into a searchable graph of functions, classes, interfaces, and their relationships."
keywords: [code, indexing, tree-sitter, AST, TypeScript, JavaScript, symbols, imports]
---

# Code Indexing

Graph Memory parses your source code and builds a searchable graph of symbols -- functions, classes, interfaces, types, and their relationships. Your AI assistant can search code by meaning, look up specific symbols, and navigate the structure of your codebase.

## Supported languages

Full symbol extraction is currently supported for:

- **TypeScript** (`.ts`, `.mts`, `.cts`)
- **TSX** (`.tsx`)
- **JavaScript** (`.js`, `.mjs`, `.cjs`)
- **JSX** (`.jsx`)

Other file types are tracked in the File Index Graph (with language detection and path-based search) but don't get symbol-level extraction.

## What gets extracted

Graph Memory uses tree-sitter to parse your source files and extract every meaningful declaration:

| What | Examples |
|------|---------|
| **Functions** | `function login()`, `const handler = () => { ... }` |
| **Classes** | `class UserService { ... }`, `abstract class BaseRepo { ... }` |
| **Class members** | constructors, methods (including abstract), properties |
| **Interfaces** | `interface User { ... }`, including method and property signatures |
| **Type aliases** | `type Status = 'active' \| 'inactive'` |
| **Enums** | `enum Role { Admin, User }` |
| **Variables** | `export const MAX_RETRIES = 3` |

For each symbol, Graph Memory captures:
- **Name** and **signature** -- the declaration without the function body
- **JSDoc comments** -- the `/** ... */` block above the declaration
- **Full source body** -- available when you look up a specific symbol
- **Line numbers** -- for navigation back to the source file
- **Export status** -- whether the symbol is exported

:::info
Only top-level declarations are extracted as primary symbols. Class methods and interface members are extracted as children of their parent class or interface.
:::

## Relationships between symbols

Beyond individual symbols, Graph Memory captures three kinds of structural relationships:

### Imports

When one file imports from another, that relationship is recorded:

```typescript
// src/routes.ts
import { UserService } from './auth';
```

This creates a connection from `src/routes.ts` to `src/auth.ts`, so your AI assistant can follow the dependency chain.

### Inheritance

Class extension and interface implementation are tracked:

```typescript
class AdminService extends UserService { ... }
class PaymentHandler implements Auditable { ... }
```

Your AI assistant can see that `AdminService` inherits from `UserService`, making it easy to understand class hierarchies.

### Containment

Classes contain their methods, and files contain their symbols. This hierarchy lets you explore a file's structure or see everything inside a class.

## Import resolution

Graph Memory resolves relative imports to actual files in your project. It handles common patterns automatically:

- **Extension inference**: `import './auth'` resolves to `./auth.ts`, `./auth.tsx`, `./auth.js`, etc.
- **Index files**: `import './utils'` can resolve to `./utils/index.ts`
- **Path aliases**: `import '@/lib/config'` resolves using your `tsconfig.json` or `jsconfig.json` path mappings

External package imports (like `import express from 'express'`) are skipped since they live outside your project.

:::tip
If you use path aliases (like `@/` or `~/`), make sure you have a `tsconfig.json` or `jsconfig.json` with the appropriate `paths` configuration. Graph Memory will find and use the nearest config file automatically.
:::

## Searching code

### Semantic search

```
search_code({ query: "function that hashes passwords" })
```

Finds symbols by meaning. Even if no function is literally named `hashPassword`, Graph Memory can find the relevant function based on its signature, JSDoc comments, body, and semantic similarity. Each symbol is embedded from its full content (signature + docComment + body), so even functions without JSDoc are visible to semantic search.

### Symbol lookup

```
get_symbol({ nodeId: "src/auth.ts::UserService::login" })
```

Returns the full source body, signature, JSDoc, and line numbers for a specific symbol. Use this after searching to read the actual implementation.

### File exploration

```
get_file_symbols({ fileId: "src/auth.ts" })
```

Lists all symbols in a file sorted by line number, like an IDE's outline view. Great for understanding what a file contains without reading it entirely.

### Cross-references

```
cross_references({ symbol: "loginUser" })
```

Finds both the code definition and any documentation examples that reference the same symbol. This bridges the Code and Docs graphs.

## Incremental updates

Like docs indexing, code indexing is incremental. Only files that have changed since the last index (based on modification time) are re-parsed and re-embedded. The graph is updated in place -- old symbols from a changed file are removed and replaced with fresh data.

## Configuration

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphs:
      code:
        include: "**/*.{js,ts,jsx,tsx,mjs,mts,cjs,cts}"   # default pattern
        exclude: "**/generated/**"        # skip certain paths
        enabled: true                     # set to false to disable
```
