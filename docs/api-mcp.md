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
| `docs_list_files` | optional `filter`, `limit` | `[{ fileId, title, chunks }]` |
| `docs_docs_get_toc` | `fileId` | `[{ id, title, level }]` |
| `docs_search` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode` | `[{ id, fileId, title, content, level, score }]` |
| `docs_docs_get_node` | `nodeId` | `{ id, fileId, title, content, level, mtime }` |
| `docs_code_search_files` | `query` + optional `topK`, `minScore` | `[{ fileId, title, chunks, score }]` |

## Code block tools

| Tool | Input | Output |
|------|-------|--------|
| `docs_docs_find_examples` | `symbol` + optional `language`, `fileId` | `[{ id, fileId, language, symbols, content, parentId, parentTitle }]` |
| `docs_docs_search_snippets` | `query` + optional `topK`, `minScore` | `[{ id, fileId, language, symbols, content, score }]` |
| `docs_docs_list_snippets` | optional `fileId`, `language`, `filter` | `[{ id, fileId, language, symbols, preview }]` |
| `docs_docs_explain_symbol` | `symbol` + optional `fileId` | `{ codeBlock, explanation, fileId }` |

## Cross-graph tools

| Tool | Input | Output |
|------|-------|--------|
| `docs_docs_cross_references` | `symbol` | `{ definitions, documentation, examples }` |

Requires both DocGraph and CodeGraph to be enabled. Bridges code definitions with documentation examples.

## Code tools

| Tool | Input | Output |
|------|-------|--------|
| `code_list_files` | optional `filter`, `limit` | `[{ fileId, symbolCount }]` |
| `code_code_get_file_symbols` | `fileId` | `[{ id, kind, name, signature, startLine, endLine, isExported }]` |
| `code_search` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode`, `includeBody` | `[{ id, fileId, kind, name, signature, docComment, startLine, endLine, score, body? }]` |
| `code_code_get_symbol` | `nodeId` | `{ id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported, crossLinks? }` |
| `code_code_search_files` | `query` + optional `topK`, `minScore` | `[{ fileId, symbolCount, score }]` |

## File index tools

| Tool | Input | Output |
|------|-------|--------|
| `files_list` | optional `directory`, `extension`, `language`, `filter`, `limit` | `[{ filePath, kind, fileName, extension, language, mimeType, size, fileCount }]` |
| `files_search` | `query` + optional `topK`, `minScore` | `[{ filePath, fileName, extension, language, size, score }]` |
| `files_get_info` | `filePath` | `{ filePath, kind, fileName, directory, extension, language, mimeType, size, fileCount, mtime }` |

## Knowledge tools

| Tool | Input | Output |
|------|-------|--------|
| `notes_create` | `title`, `content`, optional `tags` | `{ noteId }` |
| `notes_update` | `noteId` + optional `title`, `content`, `tags` | `{ noteId, updated }` |
| `notes_delete` | `noteId` | `{ noteId, deleted }` |
| `notes_get` | `noteId` | `{ id, title, content, tags, createdAt, updatedAt }` |
| `notes_list` | optional `filter`, `tag`, `limit` | `[{ id, title, tags, updatedAt }]` |
| `notes_search` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode` | `[{ id, title, content, tags, score }]` |
| `notes_create_link` | `fromId`, `toId`, `kind` + optional `targetGraph`, `projectId` | `{ fromId, toId, kind, targetGraph?, created }` |
| `notes_delete_link` | `fromId`, `toId` + optional `targetGraph`, `projectId` | `{ fromId, toId, deleted }` |
| `notes_list_links` | `noteId` | `[{ fromId, toId, kind, targetGraph? }]` |
| `notes_find_linked` | `targetId`, `targetGraph` + optional `kind`, `projectId` | `[{ noteId, title, kind, tags }]` |
| `notes_add_attachment` | `noteId`, `filePath` (absolute path on disk) | `{ filename, mimeType, size, addedAt }` |
| `notes_remove_attachment` | `noteId`, `filename` | `{ deleted: filename }` |

## Task tools

| Tool | Input | Output |
|------|-------|--------|
| `tasks_create` | `title` + optional `description`, `status`, `priority`, `tags`, `dueDate`, `estimate`, `assignee` | `{ taskId }` |
| `tasks_update` | `taskId` + optional fields | `{ taskId, updated }` |
| `tasks_delete` | `taskId` | `{ taskId, deleted }` |
| `tasks_get` | `taskId` | `{ id, title, description, status, priority, tags, dueDate, estimate, assignee, completedAt, createdAt, updatedAt, subtasks, blockedBy, blocks, related, crossLinks? }` |
| `tasks_list` | optional `status`, `priority`, `tag`, `filter`, `assignee`, `limit` | `[{ id, title, status, priority, tags, dueDate, estimate, assignee, completedAt }]` |
| `tasks_search` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode` | `[{ id, title, description, status, priority, tags, score }]` |
| `tasks_move` | `taskId`, `status` | `{ taskId, status, completedAt }` |
| `tasks_link` | `fromId`, `toId`, `kind` (`subtask_of`, `blocks`, `related_to`) | `{ fromId, toId, kind, created }` |
| `tasks_create_link` | `taskId`, `targetId`, `targetGraph`, `kind` + optional `projectId` | `{ taskId, targetId, targetGraph, kind, created }` |
| `tasks_delete_link` | `taskId`, `targetId`, `targetGraph` + optional `projectId` | `{ taskId, targetId, deleted }` |
| `tasks_find_linked` | `targetId`, `targetGraph` + optional `kind`, `projectId` | `[{ taskId, title, kind, status, priority, tags }]` |
| `tasks_add_attachment` | `taskId`, `filePath` (absolute path on disk) | `{ filename, mimeType, size, addedAt }` |
| `tasks_remove_attachment` | `taskId`, `filename` | `{ deleted: filename }` |

## Skill tools

| Tool | Input | Output |
|------|-------|--------|
| `skills_create` | `title`, `description` + optional `steps`, `triggers`, `inputHints`, `filePatterns`, `tags`, `source`, `confidence` | `{ skillId }` |
| `skills_update` | `skillId` + optional fields | `{ skillId, updated }` |
| `skills_delete` | `skillId` | `{ skillId, deleted }` |
| `skills_get` | `skillId` | `{ id, title, description, steps, triggers, inputHints, filePatterns, source, confidence, tags, usageCount, lastUsedAt, createdAt, updatedAt, dependsOn, dependedBy, related, variants, crossLinks? }` |
| `skills_list` | optional `source`, `tag`, `filter`, `limit` | `[{ id, title, source, tags, usageCount, lastUsedAt }]` |
| `skills_search` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode` | `[{ id, title, description, source, confidence, usageCount, tags, score }]` |
| `skills_recall` | `context` + optional `topK`, `minScore` | `[{ id, title, description, steps, triggers, source, tags, score, usageCount }]` |
| `skills_bump_usage` | `skillId` | `{ skillId, usageCount, lastUsedAt }` |
| `skills_link` | `fromId`, `toId`, `kind` (`depends_on`, `related_to`, `variant_of`) | `{ fromId, toId, kind, created }` |
| `skills_create_link` | `skillId`, `targetId`, `targetGraph`, `kind` + optional `projectId` | `{ skillId, targetId, targetGraph, kind, created }` |
| `skills_delete_link` | `skillId`, `targetId`, `targetGraph` + optional `projectId` | `{ skillId, targetId, deleted }` |
| `skills_find_linked` | `targetId`, `targetGraph` + optional `kind`, `projectId` | `[{ skillId, title, kind, source, tags }]` |
| `skills_add_attachment` | `skillId`, `filePath` (absolute path on disk) | `{ filename, mimeType, size, addedAt }` |
| `skills_remove_attachment` | `skillId`, `filename` | `{ deleted: filename }` |

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
