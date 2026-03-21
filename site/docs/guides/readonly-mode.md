---
title: "Readonly Mode"
sidebar_label: "Readonly Mode"
sidebar_position: 5
description: "Protect production knowledge and shared reference data by setting graphs to readonly mode."
keywords: [readonly, read-only, protection, production, access control, immutable, graphs]
---

# Readonly Mode

Readonly mode lets you lock a graph so it can be searched and read but not modified. This is useful for protecting production knowledge, shared reference data, or curated content that should not be changed by AI assistants or API consumers.

## When to Use Readonly Mode

- **Production knowledge base** — lock down a curated set of notes so they serve as a stable reference
- **Shared reference docs** — protect indexed documentation from accidental modification
- **Audited content** — freeze skills or tasks after review
- **Demo environments** — let users explore without modifying data

## Configuration

Set `readonly: true` on any graph in `graph-memory.yaml`:

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphs:
      knowledge:
        readonly: true
      skills:
        readonly: true
```

You can make any combination of graphs readonly. The read-only graphs are still loaded and fully searchable — only mutations are blocked.

## Effect on MCP Tools

When a graph is readonly, all mutation tools for that graph are **hidden** from MCP clients. The AI assistant will not see `create_note`, `update_note`, `delete_note`, etc. — it can only use read and search tools like `search_notes`, `list_notes`, and `get_note`.

This means the AI cannot accidentally modify protected data, and it will not attempt operations that would fail.

## Effect on Web UI

In the Web UI, write buttons (create, edit, delete) are **hidden** for readonly graphs. Users can browse, search, and read content but cannot make changes through the interface.

## Effect on REST API

REST API mutation requests to a readonly graph return **403 Forbidden**. Read and search endpoints work normally.

## Effect on File Mirror

File mirroring is **disabled** for readonly graphs. Changes to `.notes/`, `.tasks/`, or `.skills/` files are not imported back into a readonly graph. This prevents modifications through the filesystem from bypassing the readonly restriction.

## How readonly, enabled, and access Interact

| Setting | Graph loaded? | Read tools | Mutation tools | REST mutations |
|---------|--------------|------------|----------------|----------------|
| `enabled: false` | No | Hidden | Hidden | N/A |
| `enabled: true` (default) | Yes | Visible | Visible | Allowed |
| `readonly: true` | Yes | Visible | Hidden from MCP | 403 Forbidden |

## Readonly vs. Per-User Access Control

Readonly mode and per-user access control serve different purposes:

| Feature | Scope | Use case |
|---------|-------|----------|
| `readonly: true` | Global — applies to everyone | Lock down a graph entirely |
| `access: { alice: r }` | Per-user — different levels per person | Alice can read, Bob can write |

**Readonly overrides per-user access.** Even a user with `rw` access cannot mutate a readonly graph — they effectively have `r` access. If you need some users to write and others to only read, use per-user access control instead of readonly mode.

### Example: Mixed Access

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphs:
      knowledge:
        access:
          alice: rw     # Alice can read and write
          bob: r        # Bob can only read
      skills:
        readonly: true  # Nobody can write, regardless of access level
```
