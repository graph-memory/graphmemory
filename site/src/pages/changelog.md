---
title: Changelog
description: Graph Memory release history and version changes.
---

# Changelog

## v1.6.3

**Released: March 2026**

### New

- **OAuth 2.0 Authorization Code + PKCE** — full browser-based OAuth flow with PKCE (`S256`) support. Clients redirect to `GET /oauth/authorize`; authenticated users see a **consent page** at `/ui/auth/authorize` and can approve without re-entering credentials. Unauthenticated users are redirected to the login page at `/ui/auth/signin` first.
- **Frontend consent page** — new UI page at `/ui/auth/authorize` for reviewing and approving OAuth authorization requests. Displays client name, requested scopes, and redirect URI.
- **Frontend login page** — new dedicated login page at `/ui/auth/signin` for the OAuth redirect flow, separate from the main UI login gate.
- **Refresh token support** — `POST /oauth/token` with `grant_type=refresh_token` issues a new access token using a previously issued refresh token (JWT type `oauth_refresh`). Enables long-lived sessions without re-authentication.
- **`oauth_refresh` JWT type** — refresh tokens are self-contained signed JWTs with `type: "oauth_refresh"`. They are only accepted at `POST /oauth/token`; presenting one as a Bearer token for API/MCP access returns 401.
- **New OAuth endpoints** — `GET /oauth/userinfo` (RFC 7662 user info), `POST /oauth/introspect` (RFC 7662 token introspection), `POST /oauth/revoke` (RFC 7009 token revocation), `GET /oauth/end-session` (session termination).
- **Redis session store** — session store is now pluggable. Set `server.redis.url` to use Redis for MCP HTTP sessions instead of the default in-memory store. Enables horizontal scaling and survives server restarts.
- **Redis embedding cache** — embedding cache can be backed by Redis (`server.redis.url`). Embeddings computed once are reused across restarts and shared between server instances.
- **Session store abstraction** — internal `SessionStore` interface with `Memory` and `Redis` implementations. Selecting the backend is done via config; no code changes required.

### Updated OAuth discovery

`GET /.well-known/oauth-authorization-server` now includes `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `introspection_endpoint`, `revocation_endpoint`, `end_session_endpoint`, `response_types_supported: ["code"]`, `code_challenge_methods_supported: ["S256"]`, and `refresh_token` in `grant_types_supported`.

---

## v1.6.2

**Released: March 2026**

### New

- **OAuth 2.0 Authorization Code + PKCE** — Claude.ai and other browser-based OAuth clients can now authenticate via the full Authorization Code flow with PKCE (`S256`). Endpoint `GET /authorize` redirects to the session-aware `GET /api/oauth/authorize`; if the user has an active UI session they are immediately redirected back with an authorization code. If not logged in, redirects to `/ui`.
- **Refresh tokens** — `POST /oauth/token` now supports `grant_type=refresh_token`. Tokens are self-contained signed JWTs using the configured `refreshTokenTtl` (default `7d`). Access and refresh tokens use the configured `accessTokenTtl`/`refreshTokenTtl` from `graph-memory.yaml`.
- **Updated OAuth discovery** — `/.well-known/oauth-authorization-server` now includes `authorization_endpoint`, `response_types_supported: ["code"]`, `code_challenge_methods_supported: ["S256"]`, and `refresh_token` in `grant_types_supported`.

---

## v1.6.1

**Released: March 2026**

### Fixes

- **Express `trust proxy`** — enabled `trust proxy` so that `X-Forwarded-For` and `X-Forwarded-Proto` headers from reverse proxies (nginx, etc.) are correctly trusted. Fixes real IP detection for rate limiting and `Secure` cookie behavior behind HTTPS proxies.

---

## v1.6.0

**Released: March 2026**

### Highlights

- **OAuth 2.0 for AI chat clients** — Graph Memory now implements the OAuth 2.0 `client_credentials` flow. AI chat clients that support OAuth connectors (Claude.ai, etc.) can authenticate automatically — no manual API key headers required. Client ID = `userId`, Client Secret = `apiKey` from config.
- **Tool naming consistency** — all 58 MCP tools audited and renamed to consistent `graph_verb_noun` prefixes. Parameter names, defaults, and descriptions aligned across MCP tools and REST endpoints.
- **Array syntax for `include` patterns** — the `include` field in graph config now accepts a YAML array in addition to a single glob string, matching the existing `exclude` behavior.
- **Cleaner MCP responses** — internal graph fields (`fileEmbedding`, `pendingLinks`, `pendingImports`, `pendingEdges`, `version`), null values, and empty arrays stripped from all MCP tool responses to reduce noise and token usage.

### New Endpoints

- `GET /.well-known/oauth-authorization-server` — RFC 8414 OAuth discovery metadata
- `POST /oauth/token` — OAuth 2.0 `client_credentials` grant; returns a short-lived Bearer JWT (1 hour, type `oauth_access`)

### Security

- **Auth before project lookup** — MCP handler now checks authentication before resolving the project, preventing unauthenticated callers from enumerating which project IDs exist via 404 vs 401 responses
- **`WWW-Authenticate: Bearer` on 401** — MCP endpoints include the RFC 6750 required header on all 401 responses, enabling OAuth clients to trigger automatic re-authentication

### Fixes

- `docs_get_node` — removed `fileEmbedding`, `pendingLinks`, `mtime` from response
- `code_get_symbol` — removed `fileEmbedding`, `pendingImports`, `pendingEdges` from response
- `notes_get`, `tasks_get`, `skills_get` — removed `version`; null fields and empty arrays stripped
- `notes_list` — removed content preview field (not in tool description)

### Tests

- 33 new tests in `oauth.test.ts`: unit tests for `signOAuthToken` and `resolveUserFromBearer`, supertest coverage of discovery and token endpoints, integration tests against a real HTTP server for `WWW-Authenticate` header behavior

### Documentation

- `docs/authentication.md` — added OAuth 2.0 section with endpoint reference and token format
- `site/docs/security/authentication.md` — new OAuth 2.0 subsection and "Connecting Claude.ai" guide
- `site/docs/guides/mcp-clients.md` — new Claude.ai section with connector setup instructions

---

## v1.5.0

**Released: March 2026**

### Highlights

- **Code Browsing UI** — new dedicated Code section in the Web UI. Browse indexed files, expand to see symbols with kind chips and signature snippets, view full source code and graph relations (imports, extends, contains), navigate between symbols. Semantic search with clickable results.
- **Graph Visualization Removed** — the Cytoscape.js force-directed graph page has been removed from the UI along with the `GET /api/projects/:id/graph` export endpoint. Code browsing and search provide better navigation.
- **Prompt Builder Unlocked** — empty graphs can now be toggled on in the prompt builder. Previously, graphs with 0 nodes were disabled and couldn't be included in generated prompts.

### Security

- **Upload filename validation** — attachment uploads now validate `file.originalname` through `attachmentFilenameSchema` in all three routers (knowledge, tasks, skills), preventing path traversal via crafted filenames
- **Relation schema length limits** — added `.max()` constraints to `fromId`, `toId`, `kind`, and `projectId` in `createRelationSchema`, `createTaskLinkSchema`, and `createSkillLinkSchema`
- **Code edges encapsulation** — new `getSymbolEdges()` public method on `CodeGraphManager` replaces direct `_graph` access in the REST endpoint

### New Endpoints

- `GET /api/projects/:id/code/symbols/:symbolId/edges` — returns all incoming and outgoing edges for a code symbol (imports, contains, extends, implements)

### UI Changes

- New Code list page: file list with symbol counts, expandable symbols with kind/export chips and signature preview
- New Code detail page: metadata, signature, source code, relations (in-graph edges + cross-graph links), file siblings
- Code search results in unified Search page are now clickable and navigate to symbol detail
- Docs TOC entries now show content snippets (first 120 chars)
- Removed Graph page, graph entity, Cytoscape/cytoscape-fcose dependencies
- Fixed RelationManager navigation for code links (was routing to removed graph page)
- Cleaned orphaned `cytoscape-fcose.d.ts` type declaration and vite `vendor-graph` chunk config

### Tests

- Added 3 tests for code symbol edges endpoint (edges returned, leaf symbol, unknown symbol)
- Added 7 tests for skill attachment CRUD (upload, list, download, delete, 404, no-file, empty-list)
- Removed graph export tests (endpoint removed)

### Documentation

- Updated docs/: removed graph visualization references, added Code endpoints and Code browsing sections
- Updated site/: search-graph → "Search & Code Browsing", updated getting-started, quick-start, knowledge-tasks-skills
- Updated UI help: fixed RelationManager code link navigation

---

## v1.4.0

**Released: March 2026**

### Highlights

- **Code-Optimized Embedding Model** — code graph now defaults to `jinaai/jina-embeddings-v2-base-code` via new `codeModel` config field. Separate inheritance chain: `graphs.code.model → project.codeModel → server.codeModel → code defaults`.
- **Full Body in Code Embeddings** — code symbols now embed `signature + docComment + body` (was signature + docComment only). Functions without JSDoc are now visible to semantic search.
- **Edge-Specific BFS Decay** — code graph BFS uses per-edge-type decay: `contains` (0.95), `extends/implements` (0.85), `imports` (0.70). Reflects that class→method is a tighter relationship than a cross-file import.
- **Hybrid File Search** — file-level searches (`code_search_files`, `docs_search_files`, `files_search`) now use BM25 + vector hybrid (was vector-only). Exact filename queries like "embedder.ts" now work reliably.
- **Embedding API Model Selection** — `POST /api/embed` accepts `model: "default" | "code"` to select which embedding model to use. Both models loaded at startup when `embeddingApi` is enabled.
- **Graph Data Versioning** — persisted graphs now store `GRAPH_DATA_VERSION`. Version mismatch triggers automatic re-index (alongside existing embedding fingerprint check).

### Search Improvements

- BFS `queue.shift()` replaced with index pointer — O(1) dequeue instead of O(n) array shift
- File paths normalized for embedding: `src/lib/search/code.ts` → `src lib search code ts` for better tokenization
- `embedding.maxChars` default raised from 8000 to 24000, matching ~8k token model capacity

### Configuration

- New `codeModel` field at server/project/workspace levels with its own inheritance chain
- New `embedding.remoteModel` field: `"default"` or `"code"` — auto-set to `"code"` for code graph with remote embedding
- New `CODE_EDGE_DECAY` constants in defaults for per-edge-type BFS decay
- `GRAPH_DATA_VERSION = 2` — bump when changing embedding content or stored format

### Breaking Changes

- Code graph default model changed from `Xenova/bge-m3` to `jinaai/jina-embeddings-v2-base-code` — existing code graphs will be automatically re-indexed on first startup
- `embedding.maxChars` default changed from 8000 to 24000
- Embedding API `embeddingApiModelName` option replaced with `embeddingApiModelNames: { default, code }`

---

## v1.3.4

**Released: March 2026**

### Bug Fixes

- **Fix UI 404 when Node is installed via nvm/fnm/volta** — the `send` module's default `dotfiles: 'ignore'` policy rejected `sendFile` paths containing dot-directories (`.nvm`, `.fnm`, `.volta`), causing the SPA fallback to silently fail. Now passes `dotfiles: 'allow'` to `sendFile`.

## v1.3.3

**Released: March 2026**

### Highlights

- **Security Audit** — comprehensive security audit and hardening across the entire codebase (~90 files changed). Fixed 4 HIGH, 4 MEDIUM, and 4 LOW severity findings.

### Security

- **Path traversal via entity IDs** — `sanitizeEntityId()` applied to all file mirror operations, preventing directory traversal through crafted note/task/skill IDs
- **Path traversal via attachments** — attachment tools now reject operations when `projectDir` is not configured; use `fs.realpathSync()` to prevent case-insensitive and symlink-based bypasses
- **Insecure graph deserialization** — `validateGraphStructure()` validates JSON structure before `graph.import()` in all 6 graph load functions, preventing injection of arbitrary nodes/edges
- **Stored XSS via Markdown** — added `rehype-sanitize` to MDEditor preview pane to strip dangerous HTML
- **Symlink following in indexer** — `scan()` now skips symbolic links, preventing indexing of files outside the project directory
- **Input size limits** — added `.max()` constraints to all 58 MCP tool Zod schemas and REST list schemas, preventing memory exhaustion via oversized inputs
- **AuthGate fail-open** — UI now redirects to login on network error instead of showing the full interface
- **Error message disclosure** — removed user-supplied IDs from MCP tool error messages (18 handlers)
- **Log injection** — added `sanitizeForLog()` to all `process.stderr.write` calls in file-mirror.ts
- **scrypt cost increased** — `SCRYPT_COST` raised from 16384 to 65536 per OWASP 2023 recommendations
- **projectDir disclosure** — removed server filesystem path from project list API response

### Improvements

- **Graph export size** — stripped `body`, `pendingImports`, `pendingEdges` from `/api/graph` response, reducing payload by 50-100 MB on large projects
- **PromiseQueue rewrite** — replaced `.then()` chain with array-based drain loop to prevent memory growth under sustained mutation load

---

## v1.3.2

**Released: March 2026**

### Highlights

- **Signature Extraction Fix** — `sliceBeforeBody` now uses AST `bodyNode.startPosition.column` instead of `indexOf('{')`, fixing truncated signatures for functions with destructured params or type annotations containing braces.
- **API Key Security** — `apiKey` removed from `GET /api/auth/status` response to prevent exposure in DevTools/proxy logs. New dedicated `GET /api/auth/apikey` endpoint (requires JWT cookie).
- **Cookie Secure Flag** — New `server.cookieSecure` config option for explicit control over cookie `Secure` attribute, replacing unreliable `NODE_ENV` guessing.
- **Indexer Race Condition Fix** — `dispatchRemove` now enqueues removals into serial queues instead of executing synchronously, preventing races with in-flight indexing tasks.

### Fixes

- `sliceBeforeBody` — use `bodyNode.startPosition.column` for accurate body brace detection; fixes signatures like `({ data }: { data: string }) =>` and `parse(cfg: { key: string })`
- `_wikiIndex` — cache now invalidated when `.md` files are added or removed during watch mode; previously `[[NewFile]]` wiki links wouldn't resolve until restart
- `dispatchRemove` — enqueued to serial queues (docs/code/files) to prevent race with in-flight `indexDocFile`/`indexCodeFile` tasks during rapid file changes
- `dispatchAdd` — added missing `docGraph` null check (consistent with `dispatchRemove`)
- Default `codeInclude` — expanded from `**/*.{js,ts,jsx,tsx}` to `**/*.{js,ts,jsx,tsx,mjs,mts,cjs,cts}` to cover ES module and CommonJS variants
- File index removal now logged (`[indexer] removed file ...`) for debugging parity with docs/code removal
- CORS `credentials: true` now always enabled (was missing in zero-config mode, breaking cookie auth behind reverse proxy)
- CLI version now read from `package.json` instead of hardcoded

### Security

- `apiKey` no longer returned in `/api/auth/status` — use `GET /api/auth/apikey` instead
- `server.cookieSecure` config for explicit `Secure` cookie flag (fallback: `NODE_ENV !== 'development'`)
- CORS credentials always enabled for cookie-based auth support

### Documentation

- Deep audit of docs/, site/, UI help, and example config — fixed stale test counts, missing endpoints (`/api/workspaces`, `/api/auth/apikey`), wrong embed API format, missing server settings in config tables
- Added `cookieSecure` to all config references (docs, site, UI help, example YAML)
- Updated `codeInclude` default pattern across all documentation sources

---

## v1.3.1

**Released: March 2026**

### Highlights

- **Code Audit Bugfixes** — 10 bugs fixed from deep codebase audit: Unicode signature extraction, import-based symbol disambiguation, BM25 body truncation, embedding codec optimization, attachment limits, graph persistence recovery, WebSocket cleanup.
- **Embedding API Base64** — `POST /api/embed` now supports `format: "base64"` for compact transfer (~2x smaller than JSON number arrays).
- **REST Embedding Stripping** — GET endpoints for notes/symbols/docs no longer return raw embedding vectors.
- **Centralized Defaults** — All magic numbers extracted to `src/lib/defaults.ts` (~80 constants).

### Fixes

- `buildSignature` — line-based slicing instead of byte offsets; correct for Cyrillic/emoji in JSDoc
- `getDocComment` — use `previousNamedSibling` for robustness across tree-sitter grammars
- `resolvePendingEdges` — disambiguate via import edges when multiple classes share the same name
- `float32ToBase64` — O(n) `Buffer.from` instead of O(n²) string concatenation
- BM25 body truncation to 2000 chars prevents `avgDl` distortion from large code files
- Parser caches (`_pathMappings`, `_wikiIndex`) cleared between projects in multi-project mode
- Graph `loadGraph` recovers from interrupted saves via `.tmp` file fallback
- WebSocket `attachWebSocket` returns cleanup function for listener removal

### Security

- Attachment limits enforced: 10 MB per file, 20 per entity (note/task/skill)
- REST endpoints strip embedding vectors from responses (matching MCP tool behavior)

---

## v1.3.0

**Released: March 2026**

### Highlights

- **MCP Authentication** — API key authentication for MCP sessions. When users are configured, MCP clients must provide `Authorization: Bearer <apiKey>` to create sessions.
- **Per-Graph Readonly Mode** — New `readonly: true` graph setting. Graph remains loaded and searchable, but mutation tools are hidden from MCP clients and REST mutations return 403.
- **Per-User MCP Access** — MCP tool visibility now respects per-user access levels (deny/r/rw). Users with read-only access don't see mutation tools.
- **AI Prompt Builder** — New Web UI page with Simple and Advanced modes. 14 scenarios, 8 roles, 6 styles. Generate optimized system prompts for any MCP-connected AI assistant.
- **Connect Dialog** — Web UI button to generate MCP connection config for Claude Code, Cursor, Windsurf, and Claude Desktop.
- **Code Parser Audit** — 6-phase audit improving search quality, symbol matching, embedding compression, stop words, wiki-link cache, and docs link extraction.
- **Bundle Optimization** — Vite manual chunks for vendor splitting. React.lazy for MarkdownEditor (~679 KB lazy-loaded).

### Security

- MCP endpoints now require authentication when users are configured
- Timing-safe API key comparison for MCP sessions
- Readonly mode as defense-in-depth for sensitive graphs

### Breaking Changes

- License changed from ISC to **Elastic License 2.0 (ELv2)** — free to use, modify, and self-host; not permitted to offer as a managed/hosted service
- MCP clients connecting to servers with configured users now require an API key

---

## v1.2.0

**Released: January 2026**

Initial public release with 58 MCP tools, 6 graph types, REST API, Web UI, hybrid search, multi-project support, and workspaces.
