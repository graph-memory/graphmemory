---
title: Changelog
description: Graph Memory release history and version changes.
---

# Changelog

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

Initial public release with 58 MCP tools, 6 graph types, REST API, Web UI, hybrid search, multi-project support, and workspaces.
