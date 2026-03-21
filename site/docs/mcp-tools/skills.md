---
title: "Skill Tools"
sidebar_label: "Skills"
sidebar_position: 10
description: "14 MCP tools for managing reusable skills — create, recall, track usage, and link procedural knowledge with steps, triggers, and patterns."
keywords: [skill tools, create_skill, recall_skills, bump_skill_usage, procedures, recipes, reusable knowledge]
---

# Skill Tools

These 14 tools manage the **skill graph** — a store of reusable procedures, recipes, and how-to knowledge. Skills have steps, triggers, file patterns, and usage tracking, making them ideal for capturing repeatable workflows. Skills are mirrored to `.skills/` markdown files for IDE access.

:::info
These tools are **always available**. Mutation tools (marked below) are hidden when the skill graph is set to `readonly`.
:::

## create_skill {#create_skill}

> **Mutation** — hidden in readonly mode

Creates a new skill (reusable procedure or recipe).

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `title` | Yes | — | Skill title |
| `description` | Yes | — | What this skill does |
| `steps` | No | — | Array of step strings (ordered procedure) |
| `triggers` | No | — | Array of trigger phrases that should activate this skill |
| `inputHints` | No | — | Array of expected inputs or prerequisites |
| `filePatterns` | No | — | Array of glob patterns for relevant files (e.g. `["src/**/*.ts"]`) |
| `tags` | No | — | Array of tags |
| `source` | No | `"manual"` | Source: `"manual"`, `"learned"`, `"imported"` |
| `confidence` | No | 1.0 | Confidence score (0-1) |

### Returns

`{ skillId }` — the generated skill ID.

### When to use

Save a procedure you want to reuse. For instance, after successfully deploying a service, save the steps as a skill so it can be recalled next time.

---

## update_skill {#update_skill}

> **Mutation** — hidden in readonly mode

Partially updates a skill. Only send fields you want to change.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `skillId` | Yes | Skill ID to update |
| All create_skill fields | No | Any field from create_skill can be updated |

### Returns

`{ skillId, updated }`.

---

## delete_skill {#delete_skill}

> **Mutation** — hidden in readonly mode

Deletes the skill, all its relations, proxy nodes, and mirror directory.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `skillId` | Yes | Skill ID to delete |

### Returns

`{ skillId, deleted }`.

---

## get_skill

Fetches a skill with all its relations and metadata.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `skillId` | Yes | Skill ID |

### Returns

`{ id, title, description, steps, triggers, inputHints, filePatterns, source, confidence, tags, usageCount, lastUsedAt, createdAt, updatedAt, dependsOn, dependedBy, related, variants, crossLinks? }` — includes resolved relations and usage statistics.

---

## list_skills

Lists skills with optional filters.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `source` | No | — | Filter by source (`"manual"`, `"learned"`, `"imported"`) |
| `tag` | No | — | Filter by tag |
| `filter` | No | — | Substring match on title |
| `limit` | No | 50 | Maximum results |

### Returns

Array of `{ id, title, source, tags, usageCount, lastUsedAt }`.

---

## search_skills

Hybrid semantic search over skills.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Search query (natural language) |
| `topK` | No | 5 | Seed results for BFS |
| `bfsDepth` | No | 1 | BFS expansion hops |
| `maxResults` | No | 20 | Maximum results |
| `minScore` | No | 0.5 | Minimum relevance score |
| `bfsDecay` | No | 0.8 | Score decay per hop |
| `searchMode` | No | `hybrid` | `hybrid`, `vector`, or `keyword` |

### Returns

Array of `{ id, title, description, source, confidence, usageCount, tags, score }`.

---

## recall_skills

Broad skill recall with a lower relevance threshold than `search_skills`.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `context` | Yes | — | Description of the current task or situation |
| `topK` | No | 5 | Maximum results |
| `minScore` | No | 0.3 | Minimum relevance score (lower than search_skills) |

### Returns

Array of `{ id, title, description, steps, triggers, source, tags, score, usageCount }` — includes full steps so skills can be applied immediately.

### When to use

At the start of a complex task, cast a wide net to find potentially relevant procedures. `recall_skills` uses a lower `minScore` (0.3 vs 0.5) than `search_skills`, so it returns more results including less obvious matches. For instance: "What skills might help with setting up a new microservice?"

---

## bump_skill_usage {#bump_skill_usage}

> **Mutation** — hidden in readonly mode

Increments a skill's usage counter and updates its last-used timestamp.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `skillId` | Yes | Skill ID |

### Returns

`{ skillId, usageCount, lastUsedAt }`.

### When to use

After successfully applying a skill's recipe, bump its usage. This helps surface frequently used skills in future searches.

---

## link_skill {#link_skill}

> **Mutation** — hidden in readonly mode

Creates a relation between two skills.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `fromId` | Yes | Source skill ID |
| `toId` | Yes | Target skill ID |
| `kind` | Yes | Relation type: `depends_on`, `related_to`, or `variant_of` |

### Returns

`{ fromId, toId, kind, created }`.

---

## create_skill_link {#create_skill_link}

> **Mutation** — hidden in readonly mode

Creates a cross-graph link from a skill to a node in another graph.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `skillId` | Yes | Source skill ID |
| `targetId` | Yes | Target node ID in the external graph |
| `targetGraph` | Yes | Target graph: `"docs"`, `"code"`, `"files"`, `"knowledge"`, `"tasks"` |
| `kind` | Yes | Relation type (free-form string) |
| `projectId` | No | Target project ID (for cross-project links) |

### Returns

`{ skillId, targetId, targetGraph, kind, created }`.

### When to use

Connect a skill to the code or docs it relates to. For instance, link a deployment skill to the configuration files it uses.

---

## delete_skill_link {#delete_skill_link}

> **Mutation** — hidden in readonly mode

Deletes a cross-graph link from a skill.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `skillId` | Yes | Skill ID |
| `targetId` | Yes | Target node ID |
| `targetGraph` | Yes | Target graph |
| `projectId` | No | Target project ID |

### Returns

`{ skillId, targetId, deleted }`.

---

## find_linked_skills

Reverse lookup: finds all skills that link to a specific node in another graph.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `targetId` | Yes | Target node ID |
| `targetGraph` | Yes | Which graph the target is in |
| `kind` | No | Filter by relation kind |
| `projectId` | No | Target project ID |

### Returns

Array of `{ skillId, title, kind, source, tags }`.

### When to use

Check if any skills are associated with a piece of code or documentation before modifying it.

---

## add_skill_attachment {#add_skill_attachment}

> **Mutation** — hidden in readonly mode

Attaches a file to a skill.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `skillId` | Yes | Skill ID |
| `filePath` | Yes | Absolute path to the file on disk |

### Returns

`{ filename, mimeType, size, addedAt }`.

---

## remove_skill_attachment {#remove_skill_attachment}

> **Mutation** — hidden in readonly mode

Removes a file attachment from a skill.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `skillId` | Yes | Skill ID |
| `filename` | Yes | Filename to remove |

### Returns

`{ deleted: filename }`.
