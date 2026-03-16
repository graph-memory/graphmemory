# Cross References Tool

`cross_references` is the only tool that works across **both** the CodeGraph and DocGraph simultaneously. It's the most comprehensive way to understand a symbol — combining source code definitions, documentation context, and usage examples.

## When to use it

Use `cross_references` when you want to fully understand a symbol:
- "Where is `createUser` defined, and where is it documented?"
- "Show me all examples of `AuthService` in the docs"
- "What does `parseConfig` do, and how is it used?"

## Requirements

This tool is **only available** when both `docsPattern` and `codePattern` are configured in the project. It needs both graphs to bridge definitions and documentation.

## Tool reference

### cross_references

Find all references to a symbol across both code and documentation graphs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Symbol name to look up, e.g. `"createUser"`, `"AuthService"` |

**Returns:**
```
{
  definitions: [{
    id,              // CodeGraph node ID, e.g. "src/auth.ts::createUser"
    fileId,          // Source file path
    kind,            // Symbol kind: function, class, method, interface, etc.
    name,            // Symbol name
    signature,       // Full type signature
    docComment,      // JSDoc comment text
    startLine,       // First line number
    endLine          // Last line number
  }],
  documentation: [{
    id,              // DocGraph node ID of parent text section
    fileId,          // Documentation file path
    title,           // Section heading
    content          // Full section text (narrative context)
  }],
  examples: [{
    id,              // DocGraph node ID of code block
    fileId,          // Documentation file path
    language,        // Code block language (e.g. "typescript")
    symbols,         // All symbols found in this code block
    content          // Full code block text
  }]
}
```

## How it works in detail

### Step 1: Find definitions in CodeGraph

The tool iterates over all nodes in the CodeGraph, looking for exact `name` matches. This finds where the symbol is **defined** — the source code declarations.

A single symbol name can have multiple definitions (e.g., overloaded functions, or the same name in different files).

### Step 2: Find examples in DocGraph

The tool iterates over all nodes in the DocGraph, checking the `symbols` array of code block nodes. When markdown is indexed, fenced code blocks are parsed:

1. The code block's language is detected from the fence tag (` ```ts `, ` ```javascript `, etc.)
2. TypeScript/JavaScript blocks are parsed with `ts-morph` using a virtual in-memory file
3. Top-level symbol names are extracted: function declarations, class declarations, variable declarations
4. These are stored in the `symbols` field

So `cross_references` can find a code block like:

```typescript
const user = createUser({ name: 'Alice', role: 'admin' });
await sendWelcomeEmail(user);
```

This block would have `symbols: ["user"]` (the top-level variable declaration), but **not** `symbols: ["createUser"]` — because `createUser` is a function **call**, not a declaration. Only top-level declarations are extracted.

> **Important:** Symbol extraction captures **declarations**, not **usages**. A code block that calls `createUser()` won't match unless it also declares something named `createUser`.

For the symbol to match, the code block must contain a **declaration** of that name. For example:

```typescript
function createUser(data: UserInput): User {
  return db.insert(data);
}
```

This block **would** match because `createUser` is declared as a top-level function.

### Step 3: Find documentation context

For each matching code block example, the tool looks at its **parent text section** — the in-neighbors in the doc graph that are in the same file with a lower heading level and no language tag (i.e., text content, not another code block).

This gives you the narrative context around the example: the explanation, the motivation, the caveats.

## Example scenario

Project structure:
- `src/auth.ts` contains `export function createUser(data: UserInput): User { ... }`
- `docs/guide.md` has a section "## Creating Users" with an example code block that declares/uses `createUser`

Calling `cross_references({ symbol: "createUser" })` returns:
- **definitions**: `[{ id: "src/auth.ts::createUser", kind: "function", signature: "function createUser(data: UserInput): User", ... }]`
- **examples**: `[{ id: "docs/guide.md::Creating Users::code-1", language: "typescript", symbols: ["createUser"], content: "..." }]`
- **documentation**: `[{ id: "docs/guide.md::Creating Users", title: "Creating Users", content: "To create a new user, call..." }]`

## Comparison with other symbol tools

| Tool | Graph | Finds | Best for |
|------|-------|-------|----------|
| `get_symbol` | CodeGraph only | One specific symbol by ID | Reading full implementation |
| `search_code` | CodeGraph only | Symbols by semantic similarity | Finding code by description |
| `find_examples` | DocGraph only | Code blocks by symbol name | Finding doc examples |
| `explain_symbol` | DocGraph only | Code blocks + parent text | Understanding via docs |
| `cross_references` | Both graphs | Definitions + examples + docs | Complete understanding |

## Tips

- Use exact symbol names (case-sensitive match)
- If you get no results, check that both `docsPattern` and `codePattern` are configured
- Empty `definitions` + non-empty `examples` means the symbol is documented but not in your indexed code
- Empty `examples` + non-empty `definitions` means the symbol exists in code but isn't documented with examples
- Combine with `get_symbol` to read the full implementation body (which `cross_references` doesn't include)
