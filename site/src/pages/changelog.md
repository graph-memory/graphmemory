---
title: Changelog
description: Graph Memory release history and version changes.
---

# Changelog

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
- **`--debug` CLI flag** — logs MCP tool calls and responses to stderr

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
