# MCP Tools Reference

**Files**: `src/api/index.ts`, `src/api/tools/`

58 MCP tools exposed via stdio and HTTP transports.

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
| `get_context` | — | `{ projectId, workspaceId?, workspaceProjects?, availableGraphs }` |

## Docs tools

| Tool | Input | Output |
|------|-------|--------|
| `list_topics` | — | `[{ fileId, title, chunks }]` |
| `get_toc` | `fileId` | `[{ id, title, level }]` |
| `search` | `query` + optional `topK`, `bfsDepth`, `maxResults`, `minScore`, `bfsDecay`, `searchMode` | `[{ id, fileId, title, content, level, score }]` |
| `get_node` | `nodeId` | `{ id, fileId, title, content, level, mtime }` |
| `search_topic_files` | `query` + optional `topK`, `minScore` | `[{ fileId, title, score }]` |

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
| `list_files` | — | `[{ fileId, symbolCount }]` |
| `get_file_symbols` | `fileId` | `[{ id, kind, name, signature, startLine, endLine, isExported }]` |
| `search_code` | `query` + optional search params | `[{ id, fileId, kind, name, signature, docComment, startLine, endLine, score }]` |
| `get_symbol` | `nodeId` | `{ id, fileId, kind, name, signature, docComment, body, startLine, endLine, isExported }` |
| `search_files` | `query` + optional `topK`, `minScore` | `[{ fileId, score }]` |

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
| `search_notes` | `query` + optional search params | `[{ id, title, content, tags, score }]` |
| `create_relation` | `fromId`, `toId`, `kind` + optional `targetGraph` | `{ fromId, toId, kind, targetGraph?, created }` |
| `delete_relation` | `fromId`, `toId` + optional `targetGraph` | `{ fromId, toId, deleted }` |
| `list_relations` | `noteId` | `[{ fromId, toId, kind, targetGraph? }]` |
| `find_linked_notes` | `targetId`, `targetGraph` | `[{ noteId, kind }]` |
| `add_note_attachment` | `noteId`, `filename`, `content` (base64) | `{ noteId, filename, added }` |
| `remove_note_attachment` | `noteId`, `filename` | `{ noteId, filename, removed }` |

## Task tools

| Tool | Input | Output |
|------|-------|--------|
| `create_task` | `title` + optional `description`, `status`, `priority`, `tags`, `dueDate`, `estimate`, `assignee` | `{ taskId }` |
| `update_task` | `taskId` + optional fields | `{ taskId, updated }` |
| `delete_task` | `taskId` | `{ taskId, deleted }` |
| `get_task` | `taskId` | `{ id, title, description, status, priority, tags, dueDate, estimate, assignee, completedAt, createdAt, updatedAt, subtasks, blockedBy, blocks, related }` |
| `list_tasks` | optional `status`, `priority`, `tag`, `filter`, `assignee`, `limit` | `[{ id, title, status, priority, tags, dueDate, estimate, assignee, completedAt }]` |
| `search_tasks` | `query` + optional search params | `[{ id, title, description, status, priority, tags, score }]` |
| `move_task` | `taskId`, `status` | `{ taskId, status, completedAt }` |
| `link_task` | `fromId`, `toId`, `kind` (`subtask_of`, `blocks`, `related_to`) | `{ fromId, toId, kind, created }` |
| `create_task_link` | `taskId`, `targetId`, `targetGraph` | `{ taskId, targetId, targetGraph, created }` |
| `delete_task_link` | `taskId`, `targetId`, `targetGraph` | `{ taskId, targetId, deleted }` |
| `find_linked_tasks` | `targetId`, `targetGraph` | `[{ taskId, kind }]` |
| `add_task_attachment` | `taskId`, `filename`, `content` (base64) | `{ taskId, filename, added }` |
| `remove_task_attachment` | `taskId`, `filename` | `{ taskId, filename, removed }` |

## Skill tools

| Tool | Input | Output |
|------|-------|--------|
| `create_skill` | `title` + optional `description`, `steps`, `triggers`, `source`, `tags` | `{ skillId }` |
| `update_skill` | `skillId` + optional fields | `{ skillId, updated }` |
| `delete_skill` | `skillId` | `{ skillId, deleted }` |
| `get_skill` | `skillId` | `{ id, title, description, steps, triggers, source, tags, usageCount, lastUsedAt, createdAt, updatedAt, dependsOn, dependedBy, related, variants }` |
| `list_skills` | optional `source`, `tag`, `filter`, `limit` | `[{ id, title, source, tags, usageCount, lastUsedAt }]` |
| `search_skills` | `query` + optional search params | `[{ id, title, description, source, tags, score }]` |
| `recall_skills` | `query` + optional `topK`, `maxResults` | `[{ id, title, description, steps, triggers, source, tags, score }]` |
| `bump_skill_usage` | `skillId` | `{ skillId, usageCount, lastUsedAt }` |
| `link_skill` | `fromId`, `toId`, `kind` (`depends_on`, `related_to`, `variant_of`) | `{ fromId, toId, kind, created }` |
| `create_skill_link` | `skillId`, `targetId`, `targetGraph` | `{ skillId, targetId, targetGraph, created }` |
| `delete_skill_link` | `skillId`, `targetId`, `targetGraph` | `{ skillId, targetId, deleted }` |
| `find_linked_skills` | `targetId`, `targetGraph` | `[{ skillId, kind }]` |
| `add_skill_attachment` | `skillId`, `filename`, `content` (base64) | `{ skillId, filename, added }` |
| `remove_skill_attachment` | `skillId`, `filename` | `{ skillId, filename, removed }` |

## Mutation serialization

Mutation tools (create/update/delete) are wrapped via `createMutationServer()` — a proxy that enqueues every mutation handler into a `PromiseQueue`. This prevents race conditions from parallel MCP sessions.

Read-only tools (list, get, search) run freely without queueing.

## Transports

| Transport | Method | Use case |
|-----------|--------|----------|
| **stdio** | `startStdioServer()` | IDE integration, single project |
| **HTTP** | `startMultiProjectHttpServer()` | Multi-project, remote clients |

### HTTP session management

- Route: `/mcp/{projectId}`
- Each POST creates a new session (`randomUUID()`), returned via `mcp-session-id` header
- Sessions share graph instances via `ProjectManager`
- Idle session sweep every 60s (configurable timeout, default 30 min)
