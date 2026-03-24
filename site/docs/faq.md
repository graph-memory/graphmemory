---
title: "FAQ"
sidebar_label: "FAQ"
sidebar_position: 100
description: "Frequently asked questions about Graph Memory — privacy, languages, disk space, and how it compares to other approaches."
keywords: [FAQ, questions, privacy, languages, disk space, RAG, offline, embedding model]
---

# FAQ

## Do I need an internet connection?

No. Graph Memory runs entirely locally. The embedding model is downloaded once and cached at `~/.graph-memory/models/`. After the initial download, everything — indexing, search, and inference — runs offline on your machine.

## What programming languages are supported?

**Code indexing** (full AST parsing with symbol extraction) supports TypeScript, JavaScript, TSX, and JSX. The parser is built on tree-sitter and is extensible to other languages.

**File indexing** covers all files in your project regardless of language. Every file and directory is indexed by path and metadata, making them searchable via `files_search` and `files_list`.

**Documentation indexing** processes all Markdown files (`**/*.md`).

## How much disk space does the embedding model need?

The default model (BGE-M3 quantized to q8) requires approximately **560 MB** of disk space. It is cached at `~/.graph-memory/models/` and shared across all projects.

## Is my code sent anywhere?

No. Everything runs locally on your machine. Your code, documentation, and knowledge never leave your computer. There are no external API calls for indexing or search. The embedding model runs locally via ONNX Runtime.

## How is this different from RAG?

Traditional RAG (Retrieval-Augmented Generation) splits documents into flat text chunks and retrieves them by similarity. Graph Memory takes a different approach:

- **Structured graphs** — code is parsed into functions, classes, and interfaces with their relationships. Docs are split by heading structure. Knowledge, tasks, and skills have typed fields and relations.
- **Cross-graph links** — a note can link to a code symbol, a task can reference a doc section, and a skill can point to a file. These connections are navigable from either side.
- **Hybrid search** — BM25 keyword matching + vector cosine similarity, fused via Reciprocal Rank Fusion, with BFS graph expansion to find related nodes.
- **Six specialized graphs** — instead of one flat index, each type of content has its own graph with appropriate schema and tools.

## How many files can it handle?

There is no hard limit. Graph Memory has been tested on projects with over 10,000 files. Indexing speed depends on the number of files and the embedding model's inference speed. The default q8 quantization balances quality and speed well for most projects.

## Can I use it without MCP?

Yes. Graph Memory provides three interfaces:

- **MCP** — for AI assistants (Claude, Cursor, Windsurf, etc.)
- **Web UI** — a browser-based interface at `http://localhost:3000` for browsing, searching, and managing all six graphs
- **REST API** — programmatic access to all graphs at `/api/*`

You can use any combination. The Web UI and REST API work without any MCP client connected.

## Can I run multiple projects?

Yes. A single Graph Memory server can manage multiple projects simultaneously. Define them in `graph-memory.yaml`:

```yaml
projects:
  frontend:
    projectDir: "/path/to/frontend"
  backend:
    projectDir: "/path/to/backend"
```

Each project gets its own MCP endpoint (`/mcp/frontend`, `/mcp/backend`) and its own set of graphs. See the [Multi-Project Setup](/docs/guides/multi-project) guide.

## How much memory does indexing use?

Embedding models are loaded **lazily** — they are registered at startup but the ONNX pipeline only loads into memory when the first embedding is actually needed. During initial indexing, graphs are processed in three sequential phases (**docs → files → code**), so only one model is in memory at a time. This keeps peak memory low even for multi-project setups with per-graph models. Combined with ONNX Runtime session tuning, this approach reduces peak memory by up to ~3 GB compared to loading all models at once.

## What happens if I change the embedding model?

Graph Memory detects changes automatically. Each graph stores a data version and embedding model fingerprint. When you change the model in `graph-memory.yaml`, upgrade to a new version with schema changes, or restart after any update that affects stored data, the affected graphs are automatically discarded and re-indexed. No manual `--reindex` is needed.

## Does it support other languages besides TypeScript?

The code parser is built on [tree-sitter](https://tree-sitter.github.io/tree-sitter/) using WASM grammars. Currently, TypeScript, JavaScript, TSX, and JSX are supported with full AST parsing (functions, classes, interfaces, imports, exports).

Adding support for additional languages (Python, Go, Rust, etc.) is architecturally possible by adding the corresponding tree-sitter grammar and a language-specific visitor. The file index graph already indexes all files regardless of language.
