# REST API

**Directory**: `src/api/rest/`

Express application mounted on the same HTTP server alongside MCP routes. All endpoints are prefixed with `/api/`.

## Authentication

See [Authentication](authentication.md) for details on auth middleware.

- **JWT cookie** (from UI login) — checked first
- **Bearer apiKey** header — for programmatic access
- **Anonymous** — uses `server.defaultAccess`

## Response format

- **List endpoints**: `{ results: [...] }`
- **Single endpoints**: direct object
- **DELETE endpoints**: `204 No Content`
- **Errors**: `{ error: "message" }` with appropriate HTTP status

## Auth endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/status` | Auth status (required, authenticated, userId, name, apiKey). The `apiKey` field is included when authenticated via cookie JWT — used by the UI's Connect MCP dialog |
| POST | `/api/auth/login` | Login with email + password → sets JWT cookies |
| POST | `/api/auth/refresh` | Refresh access token using refresh cookie |
| POST | `/api/auth/logout` | Clear auth cookies |

`/api/auth/status` is always accessible (before auth middleware).

## Project endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List projects with stats and graph info (includes `readonly` field per graph) |
| GET | `/api/projects/:id/stats` | Per-graph node/edge counts |

## Knowledge endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/knowledge/notes` | List notes (query: `filter`, `tag`, `limit`) |
| POST | `/api/projects/:id/knowledge/notes` | Create note (body: `title`, `content`, `tags`) |
| GET | `/api/projects/:id/knowledge/notes/:noteId` | Get note by ID |
| PUT | `/api/projects/:id/knowledge/notes/:noteId` | Update note (partial) |
| DELETE | `/api/projects/:id/knowledge/notes/:noteId` | Delete note (204) |
| GET | `/api/projects/:id/knowledge/search?q=...` | Search notes (query: `q`, `topK`, `minScore`, `searchMode`) |
| POST | `/api/projects/:id/knowledge/relations` | Create relation (body: `fromId`, `toId`, `kind`, `targetGraph?`) |
| DELETE | `/api/projects/:id/knowledge/relations` | Delete relation (body: `fromId`, `toId`, `targetGraph?`) |
| GET | `/api/projects/:id/knowledge/notes/:noteId/relations` | List note relations |
| GET | `/api/projects/:id/knowledge/linked` | Find linked notes (query: `targetGraph`, `targetNodeId`) |
| POST | `/api/projects/:id/knowledge/notes/:noteId/attachments` | Upload attachment (multipart) |
| GET | `/api/projects/:id/knowledge/notes/:noteId/attachments` | List attachments |
| GET | `/api/projects/:id/knowledge/notes/:noteId/attachments/:filename` | Download attachment |
| DELETE | `/api/projects/:id/knowledge/notes/:noteId/attachments/:filename` | Delete attachment |

## Task endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/tasks` | List tasks (query: `status`, `priority`, `tag`, `filter`, `assignee`, `limit`) |
| POST | `/api/projects/:id/tasks` | Create task |
| GET | `/api/projects/:id/tasks/:taskId` | Get task (enriched with subtasks/blocks/related) |
| PUT | `/api/projects/:id/tasks/:taskId` | Update task (partial) |
| DELETE | `/api/projects/:id/tasks/:taskId` | Delete task (204) |
| POST | `/api/projects/:id/tasks/:taskId/move` | Move task status (body: `status`) |
| GET | `/api/projects/:id/tasks/search?q=...` | Search tasks |
| POST | `/api/projects/:id/tasks/links` | Create task link |
| DELETE | `/api/projects/:id/tasks/links` | Delete task link |
| GET | `/api/projects/:id/tasks/:taskId/relations` | List task relations |
| GET | `/api/projects/:id/tasks/linked` | Find linked tasks (query: `targetGraph`, `targetNodeId`) |
| POST | `/api/projects/:id/tasks/:taskId/attachments` | Upload attachment |
| GET | `/api/projects/:id/tasks/:taskId/attachments` | List attachments |
| GET | `/api/projects/:id/tasks/:taskId/attachments/:filename` | Download attachment |
| DELETE | `/api/projects/:id/tasks/:taskId/attachments/:filename` | Delete attachment |

## Skill endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/skills` | List skills (query: `source`, `tag`, `filter`, `limit`) |
| POST | `/api/projects/:id/skills` | Create skill |
| GET | `/api/projects/:id/skills/:skillId` | Get skill (enriched) |
| PUT | `/api/projects/:id/skills/:skillId` | Update skill (partial) |
| DELETE | `/api/projects/:id/skills/:skillId` | Delete skill (204) |
| GET | `/api/projects/:id/skills/search?q=...` | Search skills |
| GET | `/api/projects/:id/skills/recall?q=...` | Recall skills (lower minScore) |
| POST | `/api/projects/:id/skills/:skillId/bump` | Bump usage counter |
| POST | `/api/projects/:id/skills/links` | Create skill link |
| DELETE | `/api/projects/:id/skills/links` | Delete skill link |
| GET | `/api/projects/:id/skills/:skillId/relations` | List skill relations |
| GET | `/api/projects/:id/skills/linked` | Find linked skills |
| POST | `/api/projects/:id/skills/:skillId/attachments` | Upload attachment |
| GET | `/api/projects/:id/skills/:skillId/attachments` | List attachments |
| GET | `/api/projects/:id/skills/:skillId/attachments/:filename` | Download attachment |
| DELETE | `/api/projects/:id/skills/:skillId/attachments/:filename` | Delete attachment |

## Search endpoints (docs/code/files)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/docs/search?q=...` | Search docs |
| GET | `/api/projects/:id/code/search?q=...` | Search code symbols |
| GET | `/api/projects/:id/files` | List files (query: `directory`, `extension`, `language`, `filter`, `limit`) |
| GET | `/api/projects/:id/files/search?q=...` | Search files by path |

## Team endpoint

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/team` | List team members |

## Graph export

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/graph?scope=...` | Export graph for visualization (scope: `knowledge`, `tasks`, `docs`, `code`, `files`, `skills`, `all`) |

## Tools explorer

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/tools` | List available MCP tools with categories |
| GET | `/api/projects/:id/tools/:toolName` | Tool details + input schema |
| POST | `/api/projects/:id/tools/:toolName/call` | Call a tool with arguments (returns result + duration) |

The tools router creates a lazy in-memory MCP client per project to proxy tool calls.

## Embedding endpoint

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/embed` | Embed texts (requires `embeddingApi.enabled`) |

See [Embeddings](embeddings.md) for details.

## Validation

All request bodies and query params are validated with Zod schemas (`src/api/rest/validation.ts`). Invalid requests return `400` with error details.

## Static files + SPA fallback

Non-API routes serve UI from `ui/dist/`. Unknown paths return `index.html` for client-side routing.

## CORS

Configurable via `server.corsOrigins`. When not set, allows all origins. Credentials are always enabled (`credentials: true`).
