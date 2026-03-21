---
title: "File Index"
sidebar_label: "File Index"
sidebar_position: 7
description: "The File Index gives your AI assistant a complete map of every file and directory in your project — metadata, structure, and semantic search by path."
keywords: [file index, files, directories, metadata, project structure, file search]
---

# File Index

The File Index gives your AI assistant a **complete map of your project's filesystem**. While the Docs graph indexes markdown content and the Code graph indexes source symbols, the File Index covers everything — configs, images, scripts, data files, lock files, and anything else in your project.

## What gets indexed

**Every file and directory** in your project that is not excluded. This includes:

- Source files (`.ts`, `.js`, `.py`, `.go`, `.rs`, etc.)
- Config files (`.json`, `.yaml`, `.toml`, `.env`)
- Documentation (`.md`, `.txt`)
- Images (`.png`, `.jpg`, `.svg`)
- Scripts, data files, Dockerfiles, CI configs
- Lock files, build configs, and everything else

:::info
A single file can exist in multiple graphs simultaneously. For example, `src/auth.ts` appears in both the Code graph (with parsed symbols) and the File Index (with metadata). `docs/api.md` appears in both the Docs graph (with heading chunks) and the File Index.
:::

## File metadata

Each file node stores rich metadata:

| Field | Description | Example |
|-------|-------------|---------|
| `filePath` | Relative path from project root | `src/lib/embedder.ts` |
| `fileName` | File name | `embedder.ts` |
| `extension` | File extension | `.ts` |
| `language` | Detected programming language | `typescript` |
| `mimeType` | IANA MIME type | `text/typescript` |
| `size` | File size in bytes | `4096` |
| `mtime` | Last modification time | `1710547200000` |

Language detection supports ~80 file types. MIME types use the IANA-complete database.

## Directory hierarchy

Directories also get nodes in the graph, with aggregated stats:

- **size** — total bytes of direct children
- **fileCount** — count of direct children files

When a file is indexed, nodes are automatically created for every parent directory up to the project root. Each directory-to-child relationship gets a `contains` edge, building a full tree you can traverse.

```
list_all_files({ directory: "src/lib/", limit: 20 })
```

## Searching files

File paths are embedded as vectors, enabling semantic search:

```
search_all_files({ query: "authentication configuration" })
```

This finds files like `src/lib/auth.ts` and `src/config/auth.yaml` — even though the query words do not appear literally in the path. The embeddings capture semantic meaning in file names and directory structure.

:::tip
Use `list_all_files` to browse directory contents and `search_all_files` for semantic discovery. Combine both to quickly orient in an unfamiliar project.
:::

## Exclusion patterns

The File Index uses the project's **exclude configuration patterns** (not `.gitignore`). By default, common directories like `node_modules/` and `dist/` are excluded at the server level.

You can add project-specific exclusions in your config:

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    exclude: "**/.git/**"
```

Internal directories (`.notes/`, `.tasks/`, `.skills/`) are always excluded from indexing.

## Include and exclude patterns

The File Index does not have a separate `include` setting — it indexes everything that passes the project's `exclude` filter. To control what gets indexed:

- Use `exclude` patterns to skip directories or file types you do not need
- The server applies default excludes (`**/node_modules/**`, `**/dist/**`) automatically

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    exclude: "**/vendor/**"    # skip vendor directory
    graphs:
      files:
        enabled: true          # enabled by default
```

## Common use cases

**Project structure discovery** — an AI starting a new conversation can understand the project layout:

```
list_all_files({ directory: "src/", limit: 50 })
```

**File type analysis** — find all configuration files:

```
list_all_files({ extension: ".yaml" })
list_all_files({ language: "typescript" })
```

**File metadata lookup** — check size and modification time:

```
get_file_info({ filePath: "src/lib/embedder.ts" })
```

**Cross-graph context** — link a note or task to a specific file:

```
create_relation({
  fromId: "deployment-config-note",
  toId: "docker-compose.yaml",
  targetGraph: "files",
  kind: "documents"
})
```
