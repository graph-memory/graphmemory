# MCP Tools Reference

**Files**: `src/api/index.ts`, `src/api/tools/`

58 MCP tools exposed via HTTP transport.

## Authentication

MCP endpoints require `Authorization: Bearer <apiKey>` when users are configured in `graph-memory.yaml`. Without users, MCP is open (backward-compatible).

See [Authentication](authentication.md) for details on API key setup and the per-user tool visibility model.

## Readonly graphs

When a graph is configured with `readonly: true`, its mutation tools (create, update, delete) are hidden from MCP clients. Read-only tools (list, get, search) remain available. See [Configuration](configuration.md) for details.

## Tool visibility

The set of tools registered for an MCP session depends on:

1. **Graph enabled** — disabled graphs have no tools registered
2. **Graph readonly** — readonly graphs hide mutation tools for all users
3. **User access level** — users with `r` access don't see mutation tools; users with `deny` don't see any tools for that graph

## Tool groups

| Group | Count | Condition | File |
|-------|-------|-----------|------|
| Context | 1 | always | `tools/context/` |
| Docs | 5 | docs graph enabled | `tools/docs/` |
| Code blocks | 4 | docs graph enabled | `tools/docs/` |
| Cross-graph | 1 | docs + code enabled | `tools/docs/` |
| Code | 5 | code graph enabled | `tools/code/` |
| File index | 3 | always | `tools/file-index/` |
| Knowledge | 12 | always | `tools/knowledge/` |
| Tasks | 13 | always | `tools/tasks/` |
| Skills | 14 | always | `tools/skills/` |

## Context tool

| Tool | Input | Output |
|------|-------|--------|
| `get_context` | — | `{ projectId, workspaceId?, workspaceProjects?, availableGraphs, userId? }` |

## Docs tools

| Tool | Input | Output |
|------|-------|--------|
| `list_topics` | optional `filter`, `limit` | `[{ fileId, title, chunks }]` |
| `get_toc` | `fileId` | `[{ id, title, level }]` |
| `search` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode` | `[{ id, fileId, title, content, level, score }]` |
| `get_node` | `nodeId` | `{ id, fileId, title, content, level, mtime }` |
| `search_topic_files` | `query` + optional `topK`, `minScore` | `[{ fileId, title, chunks, score }]` |

## Code block tools

| Tool | Input | Output |
|------|-------|--------|
| `find_examples` | `symbol` + optional `language`, `fileId` | `[{ id, fileId, language, symbols, content, parentId, parentTitle }]` |
| `search_snippets` | `query` + optional `topK`, `minScore` | `[{ id, fileId, language, symbols, content, score }]` |
| `list_snippets` | optional `fileId`, `language`, `filter` | `[{ id, fileId, language, symbols, preview }]` |
| `explain_symbol` | `symbol` + optional `fileId` | `{ codeBlock, explanation, fileId }` |

## Cross-graph tools

| Tool | Input | Output |
|------|-------|--------|
| `cross_references` | `symbol` | `{ definitions, documentation, examples }` |

Requires both DocGraph and CodeGraph to be enabled. Bridges code definitions with documentation examples.

## Code tools

| Tool | Input | Output |
|------|-------|--------|
| `list_files` | optional `filter`, `limit` | `[{ fileId, symbolCount }]` |
| `get_file_symbols` | `fileId` | `[{ id, kind, name, signature, startLine, endLine, isExported }]` |
| `search_code` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode`, `includeBody` | `[{ id, fileId, kind, name, signature, docComment, startLine, endLine, score, body? }]` |
| `get_symbol` | `nodeId` | `{ id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported, crossLinks? }` |
| `search_files` | `query` + optional `topK`, `minScore` | `[{ fileId, symbolCount, score }]` |

## File index tools

| Tool | Input | Output |
|------|-------|--------|
| `list_all_files` | optional `directory`, `extension`, `language`, `filter`, `limit` | `[{ filePath, kind, fileName, extension, language, mimeType, size, fileCount }]` |
| `search_all_files` | `query` + optional `topK`, `minScore` | `[{ filePath, fileName, extension, language, size, score }]` |
| `get_file_info` | `filePath` | `{ filePath, kind, fileName, directory, extension, language, mimeType, size, fileCount, mtime }` |

## Knowledge tools

| Tool | Input | Output |
|------|-------|--------|
| `create_note` | `title`, `content`, optional `tags` | `{ noteId }` |
| `update_note` | `noteId` + optional `title`, `content`, `tags` | `{ noteId, updated }` |
| `delete_note` | `noteId` | `{ noteId, deleted }` |
| `get_note` | `noteId` | `{ id, title, content, tags, createdAt, updatedAt }` |
| `list_notes` | optional `filter`, `tag`, `limit` | `[{ id, title, tags, updatedAt }]` |
| `search_notes` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode` | `[{ id, title, content, tags, score }]` |
| `create_relation` | `fromId`, `toId`, `kind` + optional `targetGraph`, `projectId` | `{ fromId, toId, kind, targetGraph?, created }` |
| `delete_relation` | `fromId`, `toId` + optional `targetGraph`, `projectId` | `{ fromId, toId, deleted }` |
| `list_relations` | `noteId` | `[{ fromId, toId, kind, targetGraph? }]` |
| `find_linked_notes` | `targetId`, `targetGraph` + optional `kind`, `projectId` | `[{ noteId, title, kind, tags }]` |
| `add_note_attachment` | `noteId`, `filePath` (absolute path on disk) | `{ filename, mimeType, size, addedAt }` |
| `remove_note_attachment` | `noteId`, `filename` | `{ deleted: filename }` |

## Task tools

| Tool | Input | Output |
|------|-------|--------|
| `create_task` | `title` + optional `description`, `status`, `priority`, `tags`, `dueDate`, `estimate`, `assignee` | `{ taskId }` |
| `update_task` | `taskId` + optional fields | `{ taskId, updated }` |
| `delete_task` | `taskId` | `{ taskId, deleted }` |
| `get_task` | `taskId` | `{ id, title, description, status, priority, tags, dueDate, estimate, assignee, completedAt, createdAt, updatedAt, subtasks, blockedBy, blocks, related, crossLinks? }` |
| `list_tasks` | optional `status`, `priority`, `tag`, `filter`, `assignee`, `limit` | `[{ id, title, status, priority, tags, dueDate, estimate, assignee, completedAt }]` |
| `search_tasks` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode` | `[{ id, title, description, status, priority, tags, score }]` |
| `move_task` | `taskId`, `status` | `{ taskId, status, completedAt }` |
| `link_task` | `fromId`, `toId`, `kind` (`subtask_of`, `blocks`, `related_to`) | `{ fromId, toId, kind, created }` |
| `create_task_link` | `taskId`, `targetId`, `targetGraph`, `kind` + optional `projectId` | `{ taskId, targetId, targetGraph, kind, created }` |
| `delete_task_link` | `taskId`, `targetId`, `targetGraph` + optional `projectId` | `{ taskId, targetId, deleted }` |
| `find_linked_tasks` | `targetId`, `targetGraph` + optional `kind`, `projectId` | `[{ taskId, title, kind, status, priority, tags }]` |
| `add_task_attachment` | `taskId`, `filePath` (absolute path on disk) | `{ filename, mimeType, size, addedAt }` |
| `remove_task_attachment` | `taskId`, `filename` | `{ deleted: filename }` |

## Skill tools

| Tool | Input | Output |
|------|-------|--------|
| `create_skill` | `title`, `description` + optional `steps`, `triggers`, `inputHints`, `filePatterns`, `tags`, `source`, `confidence` | `{ skillId }` |
| `update_skill` | `skillId` + optional fields | `{ skillId, updated }` |
| `delete_skill` | `skillId` | `{ skillId, deleted }` |
| `get_skill` | `skillId` | `{ id, title, description, steps, triggers, inputHints, filePatterns, source, confidence, tags, usageCount, lastUsedAt, createdAt, updatedAt, dependsOn, dependedBy, related, variants, crossLinks? }` |
| `list_skills` | optional `source`, `tag`, `filter`, `limit` | `[{ id, title, source, tags, usageCount, lastUsedAt }]` |
| `search_skills` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode` | `[{ id, title, description, source, confidence, usageCount, tags, score }]` |
| `recall_skills` | `context` + optional `topK`, `minScore` | `[{ id, title, description, steps, triggers, source, tags, score, usageCount }]` |
| `bump_skill_usage` | `skillId` | `{ skillId, usageCount, lastUsedAt }` |
| `link_skill` | `fromId`, `toId`, `kind` (`depends_on`, `related_to`, `variant_of`) | `{ fromId, toId, kind, created }` |
| `create_skill_link` | `skillId`, `targetId`, `targetGraph`, `kind` + optional `projectId` | `{ skillId, targetId, targetGraph, kind, created }` |
| `delete_skill_link` | `skillId`, `targetId`, `targetGraph` + optional `projectId` | `{ skillId, targetId, deleted }` |
| `find_linked_skills` | `targetId`, `targetGraph` + optional `kind`, `projectId` | `[{ skillId, title, kind, source, tags }]` |
| `add_skill_attachment` | `skillId`, `filePath` (absolute path on disk) | `{ filename, mimeType, size, addedAt }` |
| `remove_skill_attachment` | `skillId`, `filename` | `{ deleted: filename }` |

## Mutation serialization

Mutation tools (create/update/delete) are wrapped via `createMutationServer()` — a proxy that enqueues every mutation handler into a `PromiseQueue`. This prevents race conditions from parallel MCP sessions.

Read-only tools (list, get, search) run freely without queueing.

## Transport

| Transport | Method | Use case |
|-----------|--------|----------|
| **HTTP** | `startMultiProjectHttpServer()` | Multi-project, MCP clients |

### HTTP session management

- Route: `/mcp/{projectId}`
- Each POST creates a new session (`randomUUID()`), returned via `mcp-session-id` header
- Sessions share graph instances via `ProjectManager`
- Idle session sweep every 60s (configurable timeout, default 30 min)
