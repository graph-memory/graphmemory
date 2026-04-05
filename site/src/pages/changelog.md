---
title: Changelog
description: Graph Memory release history and version changes.
---

# Changelog

## v1.9.5

**March 2026**

### Fixes

- **Epic→Task navigation crash** — `statusLabel()`/`priorityLabel()` threw `Cannot read properties of undefined (reading 'toUpperCase')` when task relations (`blockedBy`, `blocks`, `related`) lacked `status` field. Server now returns `status` for all relation types; UI guards against undefined
- **Epic→Task breadcrumbs** — navigating from epic to task now passes `?from=epic&epicId=` so breadcrumbs show full path: Tasks → Epics → Epic Name → Task

### Improved

- **Inline status/priority editing** — task detail view replaces "Move to" dropdown with badge-style select (matching list view); epic detail view now has inline status and priority selects
- **Inline assignee editing** — task detail view shows assignee as a select dropdown (like epic field), visible even when unassigned
- **Board column height** — all board columns now stretch to match the tallest column, making drag & drop into empty columns easy
- **Full-width selects** — Epic and Assignee selects on task detail stretch to full width

---

## v1.9.4

**March 2026**

### New

- **Per-user author attribution** — when authentication is configured, all mutations (create, update, delete, link, attachment) record the authenticated user as author (`createdBy`/`updatedBy`) instead of the static config `author`. Falls back to config author when auth is disabled
- **Team from users config** — `GET /api/projects/:id/team` returns users from config when auth is enabled, instead of reading `.team/` directory files. `.team/` files still used when auth is disabled
- **Author in all mirror events** — relation and attachment events in `events.jsonl` now include `by` field for audit trail

### Tests

- **29 new tests** — author flow: `resolveRequestAuthor`, mirror `by` field, manager author override for Task/Knowledge/Skill managers
- **Total: 1947 tests across 55 suites**

---

## v1.9.3

**March 2026**

### Fixes

- **Epic-task links lost on restart** — `linkTaskToEpic`/`unlinkTaskFromEpic` used `mirrorTaskUpdate` instead of `mirrorTaskRelation`, so `belongs_to` events were never written to `events.jsonl`; on restart the relation was replayed without the link and `syncRelationsFromFile` removed it
- **WebSocket false auth redirect** — WS reconnect blindly called `/api/auth/refresh` on every close; when auth is not configured or the server is briefly down, this triggered a redirect to login. Now checks `/api/auth/status` first and only triggers auth failure when auth is truly required and refresh fails

---

## v1.9.2

**March 2026**

### New

- **Tasks tabs navigation** — Summary, List, Board, and Epics as tabs within a single Tasks section. Epics moved from top-level nav to Tasks tab at `/tasks/epics`
- **Task Summary dashboard** — 6 stat cards (Total, Active, Completed, Overdue, In Review, Unassigned), breakdowns by status/priority, by assignee, by epic with progress bars, recently updated tasks, upcoming & overdue deadlines. All clickable with URL filters
- **Epic selector in task forms** — single-select epic dropdown in create/edit forms with auto link/unlink on save
- **Inline priority editing** — pill-badge priority selector on task detail view
- **Attachments in edit forms** — upload/delete attachments during task, note, and skill editing (previously only on detail view)
- **Skills grid layout** — 2-column card grid with 3-dot menu (Edit/Delete), matching Knowledge layout
- **Epic detail two-column layout** — description + tasks list on left, progress bar + properties on right
- **Context-aware breadcrumbs** — task pages show origin (Board/List) via URL `?from=` param, persists through navigation
- **Column visibility from URL** — `/tasks/list?status=review` sets visible columns, `/tasks/list?group=assignee` sets grouping

### Fixes

- **Board drag & drop rewrite** — SortableContext per column with `useDroppable`, custom collision detection (cards over columns), `arrayMove` for correct position, live cross-column movement in `handleDragOver`, WebSocket refresh suppressed during drag
- **List drag & drop rewrite** — migrated from `useDraggable`/`useDroppable` to `SortableContext`/`useSortable` with visual row displacement during drag, same `arrayMove` approach as board
- **Docker healthcheck** — replaced `node -e "fetch(...)"` with `curl -f` (no Node process spawn)
- **Duplicate submit buttons** — removed redundant Create/Save buttons from PageTopBar on all create/edit pages
- **Attachments/relations in main column** — moved from sidebar to main content area on task, note, and skill detail views
- **Uppercase status/priority labels** — consistent uppercase labels across all views (board, list, forms, badges, summary, epics)
- **FieldRow vertical layout** — label above value with dividers (instead of side-by-side)

### Performance

- **React.memo on card/row components** — `SortableTaskCard` and `SortableTaskRow` wrapped in `memo`
- **Stable callback props** — extracted inline callbacks to `useCallback` to prevent unnecessary re-renders
- **Team lookup map** — replaced `team.find()` (O(n)) with `Map<id, TeamMember>` (O(1)) per card render
- **Memoized activeTask** — `useMemo` instead of `.find()` on every render

---

## v1.9.1

**March 2026**

### Fixes

- **npm ci dependencies** — resolved dependency installation issues

---

## v1.9.0

**March 2026**

### New

- **Pino structured logging** — replaced all `process.stderr.write` calls with Pino logger. Pretty output by default, `LOG_JSON=1` for production. Configurable via `--log-level` flag (fatal/error/warn/info/debug/trace). Removed `--debug` flag
- **Task list grouping** — group tasks by any field: status, priority, assignee, tag, epic, or flat view. Drag-and-drop between groups changes the field value. Grouping preference saved in local storage
- **Unified filter system** — reusable `useFilters` hook, `FilterControl` select wrapper, and `FilterChip` components. Active filters shown as removable chips below controls. Migrated Tasks (board + list) and Epics pages
- **WebSocket connection indicator** — colored dot inside the Connect button shows real-time connection state (green = connected, yellow pulsing = reconnecting, red = disconnected)
- **Sidebar colorization** — each navigation item has a unique icon color (VS Code palette). Tasks moved to 2nd position in nav order
- **Epics** — full epic management: backend, REST API, 8 MCP tools, UI pages (list, detail, create, edit), task↔epic linking, progress tracking, filters
- **Bulk task operations** — MCP tools for bulk move, priority change, and delete
- **Task board** — kanban with @dnd-kit drag-and-drop, column visibility chips, inline creation, quick actions
- **Task list view** — table with sorting, bulk selection, DnD reordering, status toggle chips
- **Pagination** — offset-based pagination on all list endpoints and UI pages
- **Quick create dialog** — two-column layout with description, "Create & New" button
- **AI Prompt Builder** — generate optimized system prompts with 14 scenarios, 8 roles, 6 styles, per-tool priority control
- **File attachments** — support attachments during entity creation (tasks, notes, skills)
- **Two-column layouts** — detail pages (content 65% / sidebar 35%) and create/edit forms
- **Parse-duration** — human-readable time strings for config values (e.g. `30d`, `15m`)
- **VS Code deep links** — `vscode://` links for files in code/docs graphs

### Fixes

- **Missing WebSocket events** — added epic:created/updated/deleted/linked/unlinked and task:reordered to WS broadcast (were emitted but never sent to clients)
- **BM25 Unicode support** — tokenizer now handles Cyrillic, CJK, Arabic, and other scripts
- **Graph version migration** — preserve user data (knowledge, tasks, skills) on version/embedding config change instead of discarding
- **WebSocket access control** — broadcast filters events by user access level
- **Security** — reject anonymous requests when users configured, rate limit OAuth endpoint, timing-safe PKCE, Docker non-root user + healthcheck
- **Dependency vulnerabilities** — resolved 5 npm audit issues
- **Mutation queue drain** — drain queue before saving on shutdown
- **Event emission** — emit events for relation create/delete operations

### Tests

- WebSocket server tests (connect, broadcast, events, auth, debounce, filtering)
- MCP epic CRUD tests, bulk task tests
- BM25 Unicode, graph migration, version conflict, relation events
- Mirror-watcher, file-import, events-log, team, promise-queue tests
- **Total: 1918 tests across 54 suites**

---

## v1.8.2

**March 2026**

### Fixes

- **Session expiry — 403 instead of 401** — access cookie `maxAge` now matches refresh token TTL so the browser delivers expired JWT cookies to the server; auth middleware returns 401 (triggering client-side refresh) instead of falling through to anonymous 403
- **Client-side session refresh** — `checkAuthStatus()`, file uploads, attachment images/downloads, and WebSocket reconnect all handle 401→refresh→retry; previously only `request()` wrapper did
- **WebSocket reconnect on server restart** — WS reconnect now distinguishes network errors (server down → exponential backoff retry) from auth rejection (→ redirect to login); previously any failure kicked to login
- **CLI password input visibility** — `users add` command no longer echoes password to terminal

---

## v1.8.1

**March 2026**

### Fixes

- **ACL enforcement on project/workspace listing** — `GET /api/projects` now hides projects where the user has no read access to any graph; previously all projects were returned to all users
- **ACL enforcement on stats endpoints** — `GET /api/projects/:id/stats` returns `null` for graphs the user cannot read; `GET /api/projects` stats zeroed for denied graphs
- **Workspace listing filtered by access** — `GET /api/workspaces` only returns workspaces (and projects within) that the user can access
- **Concurrent token refresh deduplication** — multiple parallel 401 responses now share a single refresh request instead of firing one per failed call
- **UI respects graph access** — navigation sidebar, dashboard stat cards, and Recent Notes/Tasks sections hidden for denied graphs

---

## v1.8.0

**March 2026**

### New

- **OAuth config section** — dedicated `server.oauth` config with `enabled`, `accessTokenTtl`, `refreshTokenTtl`, and `authCodeTtl` fields
- **Per-model embedding cache** — cache factory supports per-model namespacing for multi-model setups

### Fixes

- Cross-graph link deletion from mirror side now works correctly; proxy nodes excluded from graph stats
- OAuth token endpoint moved to `/api/oauth/token` for consistency with all other OAuth endpoints
- Security hardening — path traversal, input validation, headers, error message disclosure

### Docs

- Comprehensive documentation audit — synced all docs, site, UI help, and changelog with actual code
- Changelog rewritten in compact user-facing format, trimmed to v1.5.0+

---

## v1.7.1

**March 2026**

### Fixes

- Fixed auth redirect loop after login — sign-in page now uses full page reload so `AuthGate` re-checks auth state
- `trust proxy` set to `1` to prevent rate-limit bypass via `X-Forwarded-For` spoofing
- Documentation fixes for Redis config, OAuth endpoint paths, and Docker Compose examples

---

## v1.7.0

**March 2026**

### New

- **OAuth 2.0** — `client_credentials` and Authorization Code + PKCE (`S256`) flows. Discovery at `GET /.well-known/oauth-authorization-server`
- **OAuth endpoints** — `POST /api/oauth/authorize`, `POST /api/oauth/token`, `GET /api/oauth/userinfo`, `POST /api/oauth/introspect`, `POST /api/oauth/revoke`, `POST /api/oauth/end-session`
- **Frontend auth pages** — consent page at `/ui/auth/authorize`, login page at `/ui/auth/signin`
- **Redis backend** — optional Redis for session store and embedding cache (`server.redis` config). In-memory fallback when disabled
- **Docker Compose** includes Redis service with healthcheck

### Changes

- `include` config field accepts YAML array in addition to single glob string
- Auth checked before project lookup on MCP endpoints (prevents project ID enumeration)
- `WWW-Authenticate: Bearer` header on all MCP 401 responses
- Cleaner MCP responses — internal fields, null values, and empty arrays stripped

### Breaking

- OAuth `/authorize` changed from GET to POST

---

## v1.6.2

**March 2026**

### New

- **OAuth Authorization Code + PKCE** — browser-based OAuth clients (Claude.ai) can authenticate via Authorization Code flow with PKCE S256
- **Refresh tokens** — `POST /api/oauth/token` supports `grant_type=refresh_token` with configurable TTL
- Updated OAuth discovery metadata with authorization endpoint and PKCE support

---

## v1.6.1

**March 2026**

### New

- **Docker Compose** file for self-hosting

### Fixes

- `trust proxy` enabled for correct IP detection and rate limiting behind reverse proxies

---

## v1.6.0

**March 2026**

### New

- **OAuth 2.0 `client_credentials`** flow for MCP chat clients (Claude.ai). Discovery at `GET /.well-known/oauth-authorization-server`, token exchange at `POST /api/oauth/token`
- **Array syntax for `include` patterns** — `include` field now accepts YAML array of globs
- **`--log-level` CLI flag** — configurable log level (fatal/error/warn/info/debug/trace)

### Changes

- REST search endpoints now expose all MCP search parameters (`bfsDepth`, `maxResults`, `bfsDecay`, `searchMode`)
- Default `maxResults` reduced from 20 to 5; default list `limit` reduced to 10

### Breaking

- **All 58 MCP tools renamed** to `graph_verb_noun` format (e.g. `search_code` → `code_search`)
- **`topK` renamed to `limit`** across all tools
- MCP responses no longer include internal fields (`fileEmbedding`, `pendingEdges`, `version`, etc.)
- 404 returned for stale MCP session IDs (per MCP spec)

---

## v1.5.0

**March 2026**

### New

- **Code Browsing UI** — browse indexed files, symbols with kind chips, source code, and graph relations
- **Code symbol edges endpoint** — `GET /api/projects/:id/code/symbols/:symbolId/edges`
- **Prompt Builder** — empty graphs can now be toggled on

### Changes

- Graph Visualization page removed (replaced by Code Browsing)
- `GET /api/projects/:id/graph` export endpoint removed

### Security

- Upload filename validation prevents path traversal
- Relation schema length limits added
