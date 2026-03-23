# How Search Works

Graph Memory uses **hybrid search** — combining BM25 keyword matching with vector similarity, fused via Reciprocal Rank Fusion (RRF). This gives you the best of both worlds: precise keyword matching for exact terms and semantic understanding for natural language queries.

## Vector embeddings

When content is indexed, each chunk (doc section, code symbol, file path, note, task, skill) is converted to a **vector embedding** — a list of ~1024 numbers that represent semantic meaning.

The default model is `bge-m3` for docs, notes, tasks, skills, and files. The code graph uses `jina-embeddings-v2-base-code`, a model trained on code + natural language pairs. Both run locally — no API calls, no data leaves your machine.

Similar concepts produce similar vectors:
- "authentication" and "login" will have high similarity
- "authentication" and "database schema" will have low similarity

### What gets embedded

| Graph | What's embedded | Embedding input |
|-------|-----------------|-----------------|
| DocGraph | Each section/heading | Section title + content text |
| DocGraph (file-level) | Each file root | File path + h1 title |
| CodeGraph | Each symbol | Symbol signature + docComment + body |
| CodeGraph (file-level) | Each file root | File path only |
| FileIndexGraph | Each file | File path |
| KnowledgeGraph | Each note | Note title + content |
| TaskGraph | Each task | Task title + description |
| SkillGraph | Each skill | Skill title + description |

### Per-graph models

Each graph can use a different embedding model, configured in `graph-memory.yaml`:

```yaml
projects:
  my-app:
    model:
      name: Xenova/bge-m3          # default for all graphs
    graphs:
      docs:
        model:
          name: Xenova/bge-m3      # override for docs (whole object, no merge)
      code:
        model:
          name: Xenova/bge-base-en-v1.5
      # knowledge, tasks, files, skills inherit project.model
```

Model resolution: `graph.model → project.model → server.model → defaults`. The code graph has its own chain: `graphs.code.model → project.codeModel → server.codeModel → code defaults`. Each level is a complete config block — no field-by-field merge. Embedding config (`batchSize`, `maxChars`, etc.) is separate and merges field-by-field.

## Cosine similarity

To compare a search query against indexed content, both are converted to vectors, then compared using **cosine similarity** (dot product of L2-normalized vectors).

Score ranges from 0 to 1:
- **> 0.7** — very relevant
- **0.5 - 0.7** — probably relevant
- **< 0.5** — weak match

The default `minScore` threshold is **0.5** for node search and **0.3** for file-level search.

## BFS graph expansion

After finding the top-K most similar nodes, the search expands outward through the graph using **breadth-first search** (BFS):

1. Start with the top-K seed nodes
2. Follow edges to neighboring nodes (linked sections, related code symbols, connected notes)
3. Each hop applies a **decay factor** — relevance decreases with distance. Code graph uses edge-specific decay (`contains`: 0.95, `extends`/`implements`: 0.85, `imports`: 0.70); other graphs use uniform 0.8
4. Continue up to `bfsDepth` hops (default 1)

This is powerful because relevant content is often **near** other relevant content in the graph.

### What edges are followed

| Graph | Edge types followed during BFS |
|-------|-------------------------------|
| DocGraph | `sibling` (next section), `cross-file link` (markdown links) |
| CodeGraph | `contains` (file→symbol), `imports`, `extends`, `implements` |
| KnowledgeGraph | All relation edges between notes |
| TaskGraph | `subtask_of`, `blocks`, `related_to` |
| SkillGraph | `depends_on`, `related_to`, `variant_of` |

## Hybrid scoring: BM25 + Vector

Each search combines two ranking methods:

1. **Vector search** — cosine similarity between query embedding and node embedding (finds semantically similar content)
2. **BM25 keyword search** — classic TF-IDF term matching (finds exact keyword matches)

Results are fused using **Reciprocal Rank Fusion (RRF)**:
```
score(d) = 1/(k + rank_vector) + 1/(k + rank_bm25)
```

This means a document ranked highly by both methods gets the highest fused score. A document ranked highly by only one method still appears, but lower.

### BM25 tokenizer

The BM25 tokenizer splits text on whitespace, punctuation, and **camelCase boundaries**:
- `getUserById` → `[get, user, by, id]`
- `AuthService` → `[auth, service]`
- `XMLParser` → `[xml, parser]`

This makes it effective for searching code symbols by partial name.

### Search mode

All search tools accept a `searchMode` parameter:

| Mode | Description |
|------|-------------|
| `hybrid` (default) | BM25 + vector, fused with RRF |
| `vector` | Embedding similarity only (original behavior) |
| `keyword` | BM25 keyword matching only |

Use `vector` mode when you want pure semantic search. Use `keyword` when you know the exact term.

## Two types of search

### Node search (hybrid + BFS)

Used by: `search`, `search_code`, `search_notes`, `search_tasks`, `search_skills`

Full parameter set:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `query` | (required) | Natural language search query |
| `topK` | 5 | Number of seed nodes from hybrid scoring |
| `bfsDepth` | 1 | Hops to follow in graph expansion (0 = no expansion) |
| `maxResults` | 20 | Maximum results to return |
| `minScore` | 0.5 | Minimum relevance score (0–1) |
| `bfsDecay` | 0.8 | Score multiplier per hop |
| `searchMode` | `hybrid` | `hybrid`, `vector`, or `keyword` |

### File-level search (cosine only)

Used by: `search_topic_files`, `search_files`, `search_all_files`, `search_snippets`

Simpler — no BFS expansion, just vector similarity:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `query` | (required) | Search query |
| `topK` | 10 | Maximum results |
| `minScore` | 0.3 | Minimum relevance score (0–1) |

Lower `minScore` default because file path and code snippet embeddings are less semantically rich than full content.

## All search tools at a glance

| Tool | Graph | Search type | What it searches |
|------|-------|-------------|-----------------|
| `search` | DocGraph | Node (BFS) | Documentation sections |
| `search_topic_files` | DocGraph | File-level | Documentation files |
| `search_snippets` | DocGraph | File-level | Code blocks in docs (+ language filter) |
| `search_code` | CodeGraph | Node (BFS) | Code symbols |
| `search_files` | CodeGraph | File-level | Source code files |
| `search_all_files` | FileIndexGraph | File-level | All project files |
| `search_notes` | KnowledgeGraph | Node (BFS) | Knowledge notes |
| `search_tasks` | TaskGraph | Node (BFS) | Tasks |
| `search_skills` | SkillGraph | Node (BFS) | Skills |

## Tips

- Lower `minScore` (e.g., 0.3) to get more results when you're exploring
- Increase `bfsDepth` to 2 when you want to discover loosely related content
- Set `bfsDepth: 0` for pure vector search without graph expansion
- Use `searchMode: 'keyword'` when searching for exact symbol names like `AuthService`
- Use `searchMode: 'vector'` for pure semantic queries like "how does authentication work"
- File-level searches are faster — use them as a first pass before diving into node-level search
- The search query is embedded the same way as the content — so descriptive natural language works best
- All models run locally — first search after startup may be slow while the model loads
