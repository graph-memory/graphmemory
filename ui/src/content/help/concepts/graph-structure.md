# Graph Structure

Graph Memory organizes project knowledge into five interconnected graphs. Each graph is a set of **nodes** (entities) connected by **edges** (relationships).

## DocGraph

Indexes markdown documentation by parsing files into a hierarchy of sections.

**Nodes:**
- **File root** (level 1) — represents the markdown file itself
- **Sections** (level 2+) — headings and their content (`# Title`, `## Subtitle`)
- **Code blocks** — fenced code snippets extracted as child nodes with `language` and `symbols` fields

**Edges:**
- `sibling` — links consecutive sections within the same file
- `cross-file link` — when markdown contains `[text](./other.md)`, links to the target file

**Node IDs:** `"guide.md"` for file root, `"guide.md::Setup"` for sections, `"guide.md::Setup::code-1"` for code blocks.

## CodeGraph

Indexes TypeScript/JavaScript source code using `ts-morph` AST parsing.

**Nodes:**
- **File** — represents the source file
- **Symbols** — functions, classes, interfaces, types, variables, enums, methods

**Edges:**
- `contains` — file → symbol, class → method
- `imports` — file → imported file (resolved by ts-morph)
- `extends` — class → base class
- `implements` — class → interface

**Node IDs:** `"auth.ts"` for file, `"auth.ts::createUser"` for top-level symbols, `"auth.ts::AuthService::login"` for methods.

## FileIndexGraph

Indexes **every file and directory** in the project, regardless of docs/code patterns.

**Nodes:**
- **Files** — with size, language, MIME type, modification date
- **Directories** — with aggregate size and file count

**Edges:**
- `contains` — directory → child file or subdirectory

## KnowledgeGraph

A manually curated graph for notes, facts, and decisions. Not populated by indexing — created through tools or the UI.

**Nodes:**
- **Notes** — title, content, tags, embedding

**Edges:**
- Free-form typed relations: `relates_to`, `depends_on`, `contradicts`, etc.
- **Cross-graph links** — can link to nodes in DocGraph, CodeGraph, FileIndexGraph, or TaskGraph via proxy nodes

## TaskGraph

Task management with kanban workflow. Also manually curated.

**Nodes:**
- **Tasks** — title, description, status, priority, tags, dueDate, estimate

**Edges:**
- `subtask_of` — parent-child tasks
- `blocks` — dependency ordering
- `related_to` — loose associations
- **Cross-graph links** — can link to any other graph

## Cross-graph links

KnowledgeGraph and TaskGraph can create edges to nodes in other graphs using **proxy nodes**. A proxy is a lightweight placeholder node (e.g., `@docs::guide.md::Setup`) that represents an external entity.

This lets you create connections like:
- Note "Auth architecture" → links to `auth.ts::AuthService` in CodeGraph
- Task "Update auth docs" → links to `guide.md` in DocGraph
- Note "Config format" → links to `src/config.ts` in FileIndexGraph
