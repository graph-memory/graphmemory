---
slug: architecture-deep-dive
title: "From 0 to 70 MCP Tools — The Architecture of Graph Memory"
authors: [graphmemory]
tags: [engineering, architecture, mcp]
description: "How Graph Memory turns six Graphology graphs, tree-sitter WASM, and a serial promise queue into 70 MCP tools with real-time sync."
---

Graph Memory exposes 70 MCP tools, a REST API, and a WebSocket event stream from a single Node.js process. This post breaks down the architecture that makes it work: Graphology for storage, tree-sitter for AST parsing, serial queues for mutation safety, and hybrid search for retrieval.

<!-- truncate -->

## The big picture

```
┌─────────────────────────────────────────────────────┐
│                   MCP Clients                       │
│          (Claude Code, Cursor, etc.)                │
└──────────────┬──────────────────────────────────────┘
               │  Streamable HTTP
┌──────────────▼──────────────────────────────────────┐
│              HTTP Server                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ MCP      │  │ REST API │  │ WebSocket Server │  │
│  │ Sessions │  │ /api/*   │  │ /api/ws          │  │
│  └────┬─────┘  └────┬─────┘  └────────▲─────────┘  │
│       │              │                 │             │
│  ┌────▼──────────────▼─────────────────┤             │
│  │         PromiseQueue (per project)  │             │
│  │         Serializes all mutations    │             │
│  └────┬────────────────────────────────┘             │
│       │                                              │
│  ┌────▼──────────────────────────────────────────┐  │
│  │            Graph Managers                     │  │
│  │  ┌──────┐ ┌──────┐ ┌───────────┐ ┌─────────┐ │  │
│  │  │ Docs │ │ Code │ │ Knowledge │ │  Tasks  │ │  │
│  │  └──────┘ └──────┘ └───────────┘ └─────────┘ │  │
│  │  ┌──────┐ ┌───────────┐                       │  │
│  │  │Skills│ │ FileIndex │                       │  │
│  │  └──────┘ └───────────┘                       │  │
│  └────┬──────────────────────────────────────────┘  │
│       │                                              │
│  ┌────▼──────────────────────────────────────────┐  │
│  │          Graphology (DirectedGraph)            │  │
│  │    Nodes + edges + embeddings in memory        │  │
│  └────┬──────────────────────────────────────────┘  │
│       │                                              │
│  ┌────▼────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ File Mirror │  │ Embedder  │  │ tree-sitter   │  │
│  │ .notes/     │  │ BGE-M3    │  │ WASM parser   │  │
│  │ .tasks/     │  │ (ONNX)    │  │ TS/JS/TSX/JSX │  │
│  │ .skills/    │  └───────────┘  └───────────────┘  │
│  └─────────────┘                                     │
└─────────────────────────────────────────────────────┘
```

## Graphology: the storage layer

Every graph is a [Graphology](https://graphology.github.io/) `DirectedGraph` instance. Six of them run per project:

| Graph | Node type | Edge semantics |
|-------|-----------|----------------|
| **DocGraph** | Markdown heading chunks | parent-child (heading hierarchy), cross-file links |
| **CodeGraph** | Functions, classes, imports | calls, imports, exports, contains |
| **KnowledgeGraph** | User-created notes | typed relations, cross-graph proxy links |
| **TaskGraph** | Tasks and epics | blocks, depends_on, parent/child |
| **SkillGraph** | Reusable procedures | relates_to, cross-graph links |
| **FileIndexGraph** | Every project file | directory containment, language tagging |

Graphology gives us constant-time node/edge lookup, iteration, and serialization to JSON. Each node carries an `embedding` array (from the embedding model) alongside its domain attributes. The entire graph lives in memory and serializes to disk as compressed JSON on shutdown and at periodic auto-save intervals.

Cross-graph connections use **proxy nodes**. When a note links to a code symbol, the KnowledgeGraph creates a proxy node like `@code::src/auth.ts::AuthService` and connects it with a typed edge. The proxy stores a `proxyFor` attribute pointing to the real node in the CodeGraph. Orphaned proxies are cleaned up automatically when the target node disappears.

## tree-sitter WASM: code understanding

Graph Memory uses [web-tree-sitter](https://github.com/nicolo-ribaudo/tree-sitter-wasm) (the WASM build of tree-sitter) to parse TypeScript, JavaScript, TSX, and JSX into ASTs. From the AST, it extracts:

- Function and method declarations (name, parameters, return type, body span)
- Class declarations with their members
- Import/export relationships
- Call expressions connecting symbols to each other

The WASM approach was a deliberate choice over native tree-sitter bindings. Native bindings require platform-specific compilation and break in Docker multi-arch builds. WASM runs identically on amd64 and arm64 with no native dependencies.

## PromiseQueue: mutation serialization

Every write operation in Graph Memory passes through a `PromiseQueue` -- a simple serial async queue that executes functions one at a time, in order:

```typescript
export class PromiseQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = false;

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()); } catch (e) { reject(e as Error); }
      });
      if (!this.running) this.drain();
    });
  }
}
```

This solves a real problem. Multiple MCP clients can connect simultaneously, and the REST API accepts concurrent requests. Without serialization, two clients creating notes at the same time could corrupt the graph. The queue ensures mutations execute sequentially while reads can happen freely (Graphology reads are safe concurrent with the event loop since mutations yield at `await` points).

The MCP server uses a proxy pattern to wrap mutation tool handlers. `createMutationServer` intercepts `registerTool` calls and wraps each handler in `queue.enqueue()`. Read-only tools bypass the queue entirely.

## Hybrid search: BM25 + vector + RRF + BFS

Search in Graph Memory fuses three strategies:

1. **Vector cosine similarity** -- every node's content is embedded via BGE-M3 (ONNX runtime). Query embeddings use a separate `embedQuery` function with instruction prefixes optimized for retrieval.

2. **BM25 keyword search** -- a custom BM25 index tokenizes content with camelCase splitting, stop-word removal, and term frequency normalization. This catches exact matches that vector search misses ("getUserById" as a query matches the function name precisely).

3. **Reciprocal Rank Fusion (RRF)** -- the vector and BM25 result lists are fused using RRF scoring (`1 / (k + rank)`), which combines both rankings without needing score normalization.

After fusion, the top-K seeds are expanded via **BFS graph traversal**. If a note scores highly, its linked notes get a decayed score boost. This means searching for "authentication" surfaces not just the auth note itself, but related notes about JWT tokens, session management, and security decisions.

The search mode is configurable per query: `hybrid` (default), `vector`, or `keyword`.

## How a tool call flows

Here's the path of a `notes_create` MCP tool call:

```
1. MCP client sends JSON-RPC request
2. StreamableHTTPServerTransport routes to session's McpServer
3. McpServer dispatches to registered tool handler
4. createMutationServer wraps handler → queue.enqueue()
5. PromiseQueue executes when it's this request's turn:
   a. KnowledgeGraphManager.createNote()
   b. Generate slug ID, validate input
   c. embedFn(title + content) → embedding vector
   d. graph.addNode(id, { title, content, embedding, ... })
   e. BM25 index updated
   f. ctx.markDirty() → flags project for auto-save
   g. mirrorNoteCreate() → writes .notes/{id}/events.jsonl + content.md
   h. ctx.emit('note:created', { id, title, ... })
6. EventEmitter fires → WebSocket server broadcasts to connected UI clients
7. Tool returns { id, title } to MCP client
```

Every mutation follows this pattern. The graph manager encapsulates the full lifecycle: validate, embed, mutate graph, update search index, mark dirty, mirror to disk, emit event.

## Key design decisions

**CommonJS, not ESM.** The project uses `module: "CommonJS"` in tsconfig. Several dependencies (Graphology, ONNX Runtime) have better CommonJS support, and the WASM loading for tree-sitter is simpler in CJS context.

**Web-tree-sitter over native.** Native tree-sitter bindings are faster but require platform-specific compilation. The Docker image supports both amd64 and arm64 -- WASM handles this transparently.

**File mirror with bidirectional sync.** Every note, task, and skill is mirrored as markdown files with YAML frontmatter. A chokidar watcher detects external edits and imports them back into the graph. This makes AI memory editable in any IDE and committable to git.

**Three serial indexing queues.** Docs, code, and file index run as independent sequential queues. They process concurrently with each other but each queue is serial internally. This prevents file-level race conditions while keeping indexing fast.

**EventEmitter for real-time sync.** The ProjectManager extends EventEmitter. Every graph mutation emits an event (`note:created`, `task:updated`, etc.) that the WebSocket server broadcasts to connected clients. The Web UI updates in real time without polling.

## Numbers

At the time of writing, Graph Memory registers **70 MCP tools** across the six graphs:

- Docs: 10 tools (search, list, get, explain, cross-references)
- Code: 5 tools (list files, get symbols, search)
- Knowledge: 12 tools (CRUD notes + relations + attachments)
- Tasks: 17 tools (CRUD + bulk ops + epics)
- Skills: 14 tools (CRUD + recall + usage tracking)
- Files: 3 tools (list, search, get info)
- Context: 1 tool (project/workspace info)
- Epics: 8 tools (CRUD + link/unlink tasks)

Each tool is a thin adapter -- typically under 50 lines -- that validates input with Zod, calls the graph manager, and formats the response. The real logic lives in the managers.

---

The architecture is intentionally straightforward. Graphology handles graph storage, PromiseQueue handles concurrency, EventEmitter handles real-time sync, and the graph managers tie it all together. No database server, no message broker, no external dependencies beyond the embedding model.

[Explore the source on GitHub](https://github.com/graph-memory/graphmemory) or [get started in under a minute](/docs/getting-started/quick-start).
