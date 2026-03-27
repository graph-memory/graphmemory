# Cross-Graph Links

One of Graph Memory's most powerful features is the ability to **link knowledge across different graphs**. A note can reference a code symbol, a task can link to documentation, and everything stays connected.

## How it works

When you create a cross-graph link (via `notes_create_link`, `tasks_create_link`, or `skills_create_link`), the system creates a **proxy node** — a lightweight placeholder in the source graph that represents a node from another graph.

Proxy node IDs follow the format `@{graph}::{nodeId}`:
- `@docs::guide.md::Setup` — a doc section
- `@code::auth.ts::AuthService` — a code symbol
- `@files::src/config.ts` — a file
- `@tasks::fix-auth-bug` — a task
- `@knowledge::auth-architecture` — a note
- `@skills::add-rest-endpoint` — a skill

## Creating cross-graph links

### From Knowledge (notes)

Use `notes_create_link` with the `targetGraph` parameter:

```
notes_create_link({
  fromId: "auth-architecture",
  toId: "auth.ts::AuthService",
  kind: "documents",
  targetGraph: "code"
})
```

Supported target graphs: `docs`, `code`, `files`, `tasks`, `skills`

### From Tasks

Use `tasks_create_link` with the optional `targetGraph` parameter (omit for task-to-task links):

```
tasks_create_link({
  taskId: "update-auth-docs",
  targetId: "guide.md::Authentication",
  kind: "relates_to",
  targetGraph: "docs"
})
```

Supported target graphs: `docs`, `code`, `files`, `knowledge`, `skills`

### From Skills

Use `skills_create_link` with the optional `targetGraph` parameter (omit for skill-to-skill links):

```
skills_create_link({
  skillId: "add-rest-endpoint",
  targetId: "api-guide.md::REST",
  kind: "relates_to",
  targetGraph: "docs"
})
```

Supported target graphs: `docs`, `code`, `files`, `knowledge`, `tasks`

## Discovering cross-graph links

- `notes_find_linked` — find all notes linked to a specific external node
- `tasks_find_linked` — find all tasks linked to a specific external node
- `skills_find_linked` — find all skills linked to a specific external node
- `notes_list_links` — list all relations for a note (including cross-graph)
- `tasks_get` — returns enriched task data including all cross-graph links
- `skills_get` — returns enriched skill data including all cross-graph links

## Proxy cleanup

Proxy nodes are automatically cleaned up when:
- The source note, task, or skill is deleted (orphaned proxies removed)
- The relation/link is explicitly deleted
- During indexing, if the target file no longer exists

## Use cases

- **Architecture decisions**: Create notes documenting why code is structured a certain way, link to the actual code symbols
- **Task context**: Link tasks to the files and docs they affect for quick navigation
- **Knowledge mapping**: Build a web of connections between concepts, implementations, and documentation
- **Reusable skills**: Link skills to the code, docs, and tasks they relate to so they can be recalled in context
