---
title: Changelog
description: Graph Memory release history and version changes.
---

# Changelog

## v1.4.0

**Released: March 2026**

### Highlights

- **Code-Optimized Embedding Model** — code graph now defaults to `jinaai/jina-embeddings-v2-base-code` via new `codeModel` config field. Separate inheritance chain: `graphs.code.model → project.codeModel → server.codeModel → code defaults`.
- **Full Body in Code Embeddings** — code symbols now embed `signature + docComment + body` (was signature + docComment only). Functions without JSDoc are now visible to semantic search.
- **Edge-Specific BFS Decay** — code graph BFS uses per-edge-type decay: `contains` (0.95), `extends/implements` (0.85), `imports` (0.70). Reflects that class→method is a tighter relationship than a cross-file import.
- **Hybrid File Search** — file-level searches (`search_files`, `search_topic_files`, `search_all_files`) now use BM25 + vector hybrid (was vector-only). Exact filename queries like "embedder.ts" now work reliably.
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
