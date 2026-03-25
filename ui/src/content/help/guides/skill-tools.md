# Skill Tools

The skill tools provide a **recipe/procedure management** system within Graph Memory. Skills capture reusable knowledge — step-by-step procedures, patterns, and best practices — with triggers, usage tracking, and cross-graph links.

## Why skills in Graph Memory?

Skills here are tightly integrated with your project's knowledge graph:
- Link a skill to the code files it applies to
- Link a skill to documentation that describes the pattern
- Link a skill to knowledge notes for context
- Link a skill to tasks that use the procedure
- Track dependencies and variants between skills

## Tool overview

| Tool | Purpose | Type |
|------|---------|------|
| `skills_create` | Create a skill with steps, triggers, and metadata | Mutation |
| `skills_update` | Modify skill fields (partial update) | Mutation |
| `skills_delete` | Remove a skill and all its edges | Mutation |
| `skills_get` | Read a skill with all relations | Read |
| `skills_list` | List skills with filters | Read |
| `skills_search` | Semantic search across skills | Read |
| `skills_link` | Create skill-to-skill relation | Mutation |
| `skills_create_link` | Link skill to external graph node | Mutation |
| `skills_delete_link` | Remove cross-graph link | Mutation |
| `skills_find_linked` | Reverse lookup: find skills linked to an external node | Read |
| `skills_add_attachment` | Attach a file to a skill | Mutation |
| `skills_remove_attachment` | Remove an attachment from a skill | Mutation |
| `skills_recall` | Recall relevant skills for a task context | Read |
| `skills_bump_usage` | Increment usage counter + set lastUsedAt | Mutation |

> **Mutation tools** are serialized through a queue to prevent concurrent graph modifications.

## Skill properties

| Property | Type | Values / Format | Notes |
|----------|------|-----------------|-------|
| `title` | string | Free text | Becomes slug ID |
| `description` | string | Markdown | Full skill description |
| `steps` | string[] | Ordered list | Step-by-step procedure |
| `triggers` | string[] | Free-form | When to apply this skill |
| `source` | enum | `user`, `learned` | How the skill was created |
| `tags` | string[] | Free-form | For filtering |
| `usageCount` | number | Auto-managed | Incremented by `skills_bump_usage` |
| `lastUsedAt` | number | Unix timestamp (auto) | Set by `skills_bump_usage` |
| `createdAt` | number | Unix timestamp (auto) | Set at creation |
| `updatedAt` | number | Unix timestamp (auto) | Updated on every change |

## Skill ID generation

Like notes and tasks, skill IDs are slugified from the title:
- "Add REST Endpoint" -> `add-rest-endpoint`
- Duplicates get suffixes: `add-rest-endpoint::2`

## Tool reference

### skills_create

Create a new skill. Automatically embedded for semantic search.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `title` | string | Yes | -- | Short title, e.g. `"Add REST Endpoint"` |
| `description` | string | Yes | -- | Full description (markdown) |
| `steps` | string[] | No | `[]` | Ordered steps of the procedure |
| `triggers` | string[] | No | `[]` | When this skill should be applied |
| `source` | enum | No | `"user"` | `"user"`, `"learned"` |
| `tags` | string[] | No | `[]` | Tags for filtering |

**Returns:** `{ skillId }`

### skills_update

Update an existing skill. Only provided fields change. Re-embeds if title, description, or triggers change.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | Yes | Skill ID to update |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `steps` | string[] | No | Replace steps array |
| `triggers` | string[] | No | Replace triggers array |
| `source` | enum | No | New source |
| `tags` | string[] | No | Replace tags array (include all you want to keep) |

**Returns:** `{ skillId, updated: true }`

### skills_delete

Delete a skill and all its edges (relations + cross-graph links). Orphaned proxy nodes cleaned up automatically. **Irreversible.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | Yes | Skill ID to delete |

**Returns:** `{ skillId, deleted: true }`

### skills_get

Return full skill details including all relations. This is the most complete view of a skill.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | Yes | Skill ID to retrieve |

**Returns:**
```
{
  id, title, description, steps, triggers, source, tags,
  usageCount, lastUsedAt, createdAt, updatedAt,
  dependsOn: [{ id, title }],
  dependedBy: [{ id, title }],
  related: [{ id, title }],
  variants: [{ id, title }]
}
```

The `dependsOn`, `dependedBy`, `related`, and `variants` arrays are automatically populated from skill-to-skill edges.

### skills_list

List skills with optional filters. Sorted by usage count (most used first).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `source` | enum | No | -- | Filter by source (`user`, `learned`) |
| `tag` | string | No | -- | Filter by tag (exact match, case-insensitive) |
| `filter` | string | No | -- | Substring match on title or ID |
| `limit` | number | No | 50 | Maximum results |

**Returns:** `[{ id, title, description, steps, triggers, source, tags, usageCount, lastUsedAt, createdAt, updatedAt }]`

### skills_search

Semantic search over the skill graph with BFS expansion.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | -- | Natural language search query |
| `topK` | number | No | 5 | Seed nodes (1–500) |
| `bfsDepth` | number | No | 1 | Hops to follow relations (0–10) |
| `maxResults` | number | No | 5 | Maximum results (1–500) |
| `minScore` | number | No | 0.5 | Minimum relevance score (0–1) |
| `bfsDecay` | number | No | 0.8 | Score multiplier per hop (0–1) |
| `searchMode` | string | No | `hybrid` | `hybrid`, `vector`, or `keyword` |

**Returns:** `[{ id, title, description, steps, triggers, source, tags, score }]`

### skills_recall

Recall relevant skills for a task context. Uses a lower default `minScore` (0.3) for higher recall.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `context` | string | Yes | -- | Description of the current task or context to match skills against |
| `topK` | number | No | 5 | How many top similar skills to use as seeds |
| `minScore` | number | No | 0.3 | Minimum relevance score (0-1) |

**Returns:** `[{ id, title, description, steps, triggers, source, tags, score, usageCount }]`

### skills_bump_usage

Record that a skill was used. Increments `usageCount` and sets `lastUsedAt` to the current time.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | Yes | Skill ID to bump |

**Returns:** `{ skillId, usageCount, lastUsedAt }`

### skills_link

Create a directed relation between two skills.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromId` | string | Yes | Source skill ID |
| `toId` | string | Yes | Target skill ID |
| `kind` | enum | Yes | `"depends_on"`, `"related_to"`, `"variant_of"` |

**Returns:** `{ fromId, toId, kind, created: true }`

**Semantics:**
- `depends_on` -- `fromId` depends on `toId` (prerequisite)
- `related_to` -- free association between skills
- `variant_of` -- `fromId` is a variation of `toId`

### skills_create_link

Link a skill to a node in another graph (docs, code, files, knowledge, or tasks).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | Yes | Source skill ID |
| `targetId` | string | Yes | Target node ID in the external graph |
| `targetGraph` | enum | Yes | `"docs"`, `"code"`, `"files"`, `"knowledge"`, `"tasks"` |
| `kind` | string | Yes | Relation type: `"applies_to"`, `"documented_in"`, `"used_by"`, etc. |

**Returns:** `{ skillId, targetId, targetGraph, kind, created: true }`

**Examples:**
```
skills_create_link({ skillId: "add-rest-endpoint", targetId: "src/routes/index.ts", targetGraph: "code", kind: "applies_to" })
skills_create_link({ skillId: "add-rest-endpoint", targetId: "guide.md::REST API", targetGraph: "docs", kind: "documented_in" })
skills_create_link({ skillId: "add-rest-endpoint", targetId: "implement-api", targetGraph: "tasks", kind: "used_by" })
```

### skills_delete_link

Remove a cross-graph link from a skill. Orphaned proxy nodes cleaned up automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | Yes | Source skill ID |
| `targetId` | string | Yes | Target node ID in the external graph |
| `targetGraph` | enum | Yes | `"docs"`, `"code"`, `"files"`, `"knowledge"`, `"tasks"` |

**Returns:** `{ skillId, targetId, targetGraph, deleted: true }`

### skills_find_linked

Reverse lookup: given a node in an external graph, find all skills that link to it.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `targetId` | string | Yes | Target node ID, e.g. `"src/auth.ts"`, `"guide.md::Setup"`, `"my-task"` |
| `targetGraph` | enum | Yes | `"docs"`, `"code"`, `"files"`, `"knowledge"`, `"tasks"` |
| `kind` | string | No | Filter by relation kind. Omit for all relations |

**Returns:** `[{ skillId, title, kind, source, tags }]`

**Use case:** When working on a file, call `skills_find_linked({ targetId: "src/routes/index.ts", targetGraph: "code" })` to see all skills related to that file.

### skills_add_attachment

Attach a file to a skill. The file is copied into the skill's directory (`.skills/{skillId}/`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | Yes | Skill ID to attach the file to |
| `filePath` | string | Yes | Absolute path to the file on disk |

**Returns:** `{ skillId, attachment: { filename, mimeType, size } }`

### skills_remove_attachment

Remove an attachment from a skill. Deletes the file from disk.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `skillId` | string | Yes | Skill ID |
| `filename` | string | Yes | Filename of the attachment to remove |

**Returns:** `{ skillId, filename, deleted: true }`

## Tips

- Use `skills_recall` when starting a task to find relevant procedures -- it uses a lower threshold for better recall
- Call `skills_bump_usage` after applying a skill to track which skills are most useful
- Skills with `source: "learned"` are typically created by AI agents that discover patterns
- Skills with `source: "user"` are created by humans documenting their procedures
- Link skills to code files they apply to -- makes it easy to find relevant skills when working on code
- Use `skills_search` to find skills by meaning, not just title keywords
- `skills_update` with `tags` replaces the entire array -- include all tags you want to keep
- Skill-to-skill `kind` values are a fixed enum (`depends_on`, `related_to`, `variant_of`)
- Skills support file attachments -- attach templates, examples, or reference files via `skills_add_attachment`
- Attachments are stored in `.skills/{skillId}/` alongside the skill's markdown file
- When the skill graph is configured as `readonly: true`, mutation tools (create, update, delete) are hidden from MCP clients and REST mutation endpoints return 403. The UI hides write buttons accordingly.
