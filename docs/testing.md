# Testing

## Overview

- **Framework**: Jest with ts-jest
- **Test suites**: 28 (29 files, 1 excluded from Jest)
- **Tests**: 1240
- **Coverage**: all graph types, MCP tools, REST API, search, config, file mirror, BM25, access control, JWT auth

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
| `code-parser.test.ts` | Code parser | tree-sitter AST parser |
| `codeblock-parser.test.ts` | Code blocks | Code block extraction + symbol extraction |
| `knowledge-graph.test.ts` | Knowledge graph | KnowledgeGraph CRUD + search + cross-graph proxy |
| `file-index-graph.test.ts` | File index | FileIndexGraph CRUD + directory chain + search |
| `task-graph.test.ts` | Task graph | TaskGraph CRUD + search + cross-graph proxy + persistence |
| `skill-graph.test.ts` | Skill graph | SkillGraph CRUD + search + cross-graph proxy + persistence |

### MCP tool tests

| Suite | File | Description |
|-------|------|-------------|
| `mcp-docs.test.ts` | Docs tools | list_topics, get_toc, search, get_node, search_topic_files |
| `mcp-code.test.ts` | Code tools | list_files, get_file_symbols, search_code, get_symbol, search_files |
| `mcp-codeblocks.test.ts` | Code block tools | find_examples, search_snippets, list_snippets, explain_symbol, cross_references |
| `mcp-knowledge.test.ts` | Knowledge tools | CRUD notes + relations + search + cross-graph links |
| `mcp-file-index.test.ts` | File index tools | list_all_files, search_all_files, get_file_info + cross-graph links |
| `mcp-tasks.test.ts` | Task tools | CRUD tasks + relations + search + cross-graph links |
| `mcp-skills.test.ts` | Skill tools | CRUD skills + relations + search + cross-graph links |
| `mcp-context.test.ts` | Context tool | get_context project/workspace context |

### Search tests

| Suite | File | Description |
|-------|------|-------------|
| `search.test.ts` | Docs search | BFS + cosine search unit test |
| `bm25.test.ts` | BM25 | BM25 algorithm, tokenizer, RRF fusion |

### Infrastructure tests

| Suite | File | Description |
|-------|------|-------------|
| `multi-config.test.ts` | Config | YAML config parsing + Zod validation |
| `promise-queue.test.ts` | Queue | PromiseQueue serial execution |
| `watcher.test.ts` | Watcher | chokidar file watcher |

### REST API tests

| Suite | File | Description |
|-------|------|-------------|
| `rest-api.test.ts` | REST API | Express routes, Zod validation, CRUD, JWT auth |

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
- `code/` — TypeScript files with `tsconfig.json`

## Test patterns

### MCP tool tests

Use `InMemoryTransport.createLinkedPair()` + fake unit-vector embeddings:

```typescript
const { client } = await setupMcpClient({
  docGraph, codeGraph, knowledgeGraph, /* ... */
  embedFn: fakeEmbed,
});

const result = await client.callTool({ name: 'create_note', arguments: { title: '...', content: '...' } });
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
