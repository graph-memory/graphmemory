# Graph Structure

Graph Memory organizes project knowledge into seven interconnected graphs. Each graph is a set of **nodes** (entities) connected by **edges** (relationships).

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

Indexes TypeScript/JavaScript source code using tree-sitter AST parsing.

**Nodes:**
- **File** — represents the source file
- **Symbols** — functions, classes, interfaces, types, variables, enums, methods

**Edges:**
- `contains` — file → symbol, class → method
- `imports` — file → imported file (resolved by import resolver)
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
- **Tasks** — title, description, status, priority, tags, dueDate, estimate, assignee

**Edges:**
- `subtask_of` — parent-child tasks
- `blocks` — dependency ordering
- `related_to` — loose associations
- **Cross-graph links** — can link to any other graph

## SkillGraph

Stores reusable recipes and procedures. Also manually curated.

**Nodes:**
- **Skills** — title, description, steps[], triggers[], source (`user`|`learned`), tags, usageCount, lastUsedAt, confidence, embedding

**Edges:**
- `depends_on` — skill requires another skill
- `related_to` — loose associations
- `variant_of` — alternative approaches to the same goal
- **Cross-graph links** — can link to docs, code, files, knowledge, or tasks via proxy nodes

**Node IDs:** slug from title (`"add-rest-endpoint"`), dedup with suffix (`"add-rest-endpoint::2"`).

**Persistence:** `skills.json` in the graphMemory directory, mirrored to `.skills/{id}/skill.md`.

## EpicGraph

Groups related tasks into milestone-level containers. Epics provide a higher-level view of work.

**Nodes:**
- **Epics** — title, description, status, tags, order, embedding

**Edges:**
- `belongs_to` — task → epic (a task belongs to an epic)
- **Cross-graph links** — can link to docs, code, files, knowledge, tasks, or skills via proxy nodes

**Node IDs:** slug from title (`"auth-overhaul"`), dedup with suffix (`"auth-overhaul::2"`).

**Statuses:** `draft`, `active`, `completed`, `archived`

**Persistence:** `epics.json` in the graphMemory directory.

**nodeType discriminator:** Epic nodes use `nodeType: "epic"` to distinguish them from other graph node types.

## Cross-graph links

KnowledgeGraph, TaskGraph, SkillGraph, and EpicGraph can create edges to nodes in other graphs using **proxy nodes**. A proxy is a lightweight placeholder node (e.g., `@docs::guide.md::Setup`) that represents an external entity.

This lets you create connections like:
- Note "Auth architecture" → links to `auth.ts::AuthService` in CodeGraph
- Task "Update auth docs" → links to `guide.md` in DocGraph
- Note "Config format" → links to `src/config.ts` in FileIndexGraph
- Skill "Add REST endpoint" → links to `auth.ts::AuthService` in CodeGraph
