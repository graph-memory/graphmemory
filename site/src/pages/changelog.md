---
title: Changelog
description: Graph Memory release history and version changes.
---

# Changelog

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
