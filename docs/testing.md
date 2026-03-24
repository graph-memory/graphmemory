# Testing

## Overview

- **Framework**: Jest with ts-jest
- **Test suites**: 36 (38 files, 2 excluded from Jest)
- **Tests**: 1507
- **Coverage**: all graph types, MCP tools (58/58), REST API (70/70 endpoints), search (all 7 modules), parsers, config, file mirror, BM25, access control, JWT auth, attachments

## Running tests

```bash
npm test                               # Run all tests
npm test -- --testPathPatterns=search   # Run specific test file
npm run test:watch                     # Watch mode
```

### Special tests (excluded from Jest)

```bash
npx tsx src/tests/embedder.test.ts     # Real embedding model (slow, ~560MB download)
npx tsx src/tests/parser.debug.ts      # Debug script, no assertions
```

## Test suites

### Graph tests

| Suite | File | Description |
|-------|------|-------------|
| `graph.test.ts` | Docs graph | DocGraph CRUD + persistence |
| `code-graph.test.ts` | Code graph | CodeGraph CRUD + persistence |
| `code-parser.test.ts` | Code parser | tree-sitter AST parser (basic fixtures) |
| `code-parser-advanced.test.ts` | Code parser | abstract classes, constructors, generics, nested functions, ambient declarations, path aliases, JSONC |
| `codeblock-parser.test.ts` | Code blocks | Code block extraction + symbol extraction |
| `knowledge-graph.test.ts` | Knowledge graph | KnowledgeGraph CRUD + search + cross-graph proxy |
| `file-index-graph.test.ts` | File index | FileIndexGraph CRUD + directory chain + search |
| `task-graph.test.ts` | Task graph | TaskGraph CRUD + search + cross-graph proxy + persistence |
| `skill-graph.test.ts` | Skill graph | SkillGraph CRUD + search + cross-graph proxy + persistence |

### MCP tool tests

| Suite | File | Description |
|-------|------|-------------|
| `mcp-docs.test.ts` | Docs tools | docs_list_files, docs_get_toc, search, docs_get_node, docs_search_files |
| `mcp-code.test.ts` | Code tools | code_list_files, code_get_file_symbols, code_search, code_get_symbol, code_search_files |
| `mcp-codeblocks.test.ts` | Code block tools | docs_find_examples, docs_search_snippets, docs_list_snippets, docs_explain_symbol, docs_cross_references |
| `mcp-knowledge.test.ts` | Knowledge tools | CRUD notes + relations + search + cross-graph links |
| `mcp-file-index.test.ts` | File index tools | files_list, files_search, files_get_info + cross-graph links |
| `mcp-tasks.test.ts` | Task tools | CRUD tasks + relations + search + cross-graph links |
| `mcp-skills.test.ts` | Skill tools | CRUD skills + relations + search + cross-graph links |
| `mcp-context.test.ts` | Context tool | get_context project/workspace context |
| `mcp-attachments.test.ts` | Attachments | All 6 attachment MCP tools + filename validation |
| `mcp-auth.test.ts` | MCP auth | Config parsing for readonly, users, access |
| `mcp-readonly.test.ts` | MCP readonly | MCP tool visibility with readonly and per-user access |

### Docs parser tests

| Suite | File | Description |
|-------|------|-------------|
| `docs-parser-advanced.test.ts` | Docs parser | Wiki links, external URL filtering, tilde fences, chunkDepth, heading edge cases, filename fallback |

### Search tests

| Suite | File | Description |
|-------|------|-------------|
| `search.test.ts` | Docs search | BFS + cosine search unit test |
| `bm25.test.ts` | BM25 | BM25 algorithm, tokenizer, RRF fusion |
| `search-gaps.test.ts` | Search gaps | Hybrid/keyword modes, proxy filtering, BFS decay, empty graph, stop-words, normalization |

### Graph gap tests

| Suite | File | Description |
|-------|------|-------------|
| `graph-gaps.test.ts` | Graph gaps | VersionConflictError, resolvePendingLinks/Imports/Edges, manager methods, empty graph ops, BM25 wrapper, circular imports |

### Infrastructure tests

| Suite | File | Description |
|-------|------|-------------|
| `multi-config.test.ts` | Config | YAML config parsing + Zod validation |
| `promise-queue.test.ts` | Queue | PromiseQueue serial execution |
| `watcher.test.ts` | Watcher | chokidar file watcher |

### REST API tests

| Suite | File | Description |
|-------|------|-------------|
| `rest-api.test.ts` | REST API | Express routes, Zod validation, CRUD, JWT auth, attachments |
| `rest-api-gaps.test.ts` | REST gaps | Skills/Docs/Code/Tools REST, missing knowledge/tasks/files endpoints |

### File mirror tests

| Suite | File | Description |
|-------|------|-------------|
| `file-mirror.test.ts` | Mirror | Frontmatter serialization + file mirror helpers + manager integration |
| `file-import.test.ts` | Import | Reverse import parsing (parseNoteFile, parseTaskFile, diffRelations) |
| `mirror-watcher.test.ts` | Mirror watcher | MirrorWriteTracker + importFromFile/deleteFromFile + round-trip |

### Auth/access tests

| Suite | File | Description |
|-------|------|-------------|
| `access.test.ts` | Access | ACL resolution + user API key lookup |
| `jwt.test.ts` | JWT | Password hashing, JWT sign/verify, parseTtl, resolveUserByEmail |

### Workspace tests

| Suite | File | Description |
|-------|------|-------------|
| `workspace.test.ts` | Workspace | Workspace context + proxy ID formatting with projectId |

## Test infrastructure

### Helpers (`src/tests/helpers.ts`)

| Utility | Description |
|---------|-------------|
| `unitVec(dims, pos)` | Create a unit vector with 1.0 at position `pos` |
| `fakeEmbed(title, content)` | Deterministic fake embedder for tests |
| `setupMcpClient(opts)` | Create MCP server + InMemoryTransport pair |
| `text(result)` | Extract text content from MCP tool result |
| `json(result)` | Parse JSON content from MCP tool result |

### Mocks (`src/tests/__mocks__/`)

Jest mocks for ESM-only packages:

| Package | Mock |
|---------|------|
| `@huggingface/transformers` | No-op pipeline |
| `chokidar` | Mock watcher |
| `mime` | Mock MIME lookup |

### Fixtures (`src/tests/fixtures/`)

- `api.md`, `auth.md` — markdown docs for testing
- `codeblocks.md` — code blocks in markdown
- `duplicates.md` — duplicate headings
- `links.md` — wiki links, external URLs, link-in-code-fence
- `notitle.md` — file without `# Title` heading
- `tilde-fences.md` — tilde code fences and empty blocks
- `edge-cases.md` — heading edge cases, triple duplicates
- `code/` — TypeScript files with `tsconfig.json` (paths aliases)
- `code/advanced.ts` — abstract class, constructor, generics, ambient, nested fn, re-export

## Test patterns

### MCP tool tests

Use `InMemoryTransport.createLinkedPair()` + fake unit-vector embeddings:

```typescript
const { client } = await setupMcpClient({
  docGraph, codeGraph, knowledgeGraph, /* ... */
  embedFn: fakeEmbed,
});

const result = await client.callTool({ name: 'notes_create', arguments: { title: '...', content: '...' } });
const data = json(result);
expect(data.noteId).toBe('my-note');
```

No real embedding model is loaded — tests use deterministic fake embeddings for reproducibility.

### REST API tests

Use `supertest` against the Express app:

```typescript
const res = await request(app)
  .post(`/api/projects/${pid}/knowledge/notes`)
  .send({ title: 'Test', content: 'Content' });
expect(res.status).toBe(201);
```

### Graph unit tests

Direct CRUD on graph instances with `noopContext()`:

```typescript
const graph = createKnowledgeGraph();
const mgr = new KnowledgeGraphManager(graph, embedFn, bm25, noopContext(), externalGraphs);
const id = await mgr.createNote('title', 'content');
expect(graph.hasNode(id)).toBe(true);
```

## CI

GitHub Actions (`.github/workflows/ci.yml`):

```yaml
on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

steps:
  - npm ci
  - npm run build:server
  - npm test
```

Runs on every push and PR. Node.js 24.
