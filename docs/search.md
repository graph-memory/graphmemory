# Search Algorithms

**Directory**: `src/lib/search/`

All graph searches use the same hybrid algorithm combining BM25 keyword search and vector cosine similarity, fused via Reciprocal Rank Fusion (RRF).

## Hybrid search algorithm

### Step 1: Score all nodes

Two scoring methods run in parallel:

**Vector scoring**: cosine similarity between query embedding and each node's embedding. Nodes with empty embeddings are skipped.

**BM25 keyword scoring**: BM25 algorithm scores nodes against the query text. The BM25 index is maintained incrementally (updated on every CRUD operation).

### Step 2: Reciprocal Rank Fusion (RRF)

Results from both methods are fused using RRF:

```
score(d) = 1/(k + rank_vector) + 1/(k + rank_bm25)
```

Where `k = 60` by default. This formula gives balanced weight to both ranking methods regardless of score scale differences.

### Step 3: Seed selection

From the fused results, take the top `topK` candidates above `minScore`.

### Step 4: BFS expansion

From each seed node, traverse outgoing **and** incoming edges up to `bfsDepth` hops:
- Each hop multiplies the score by a decay factor
- **Code graph** uses **edge-specific decay**: `contains` (0.95), `extends`/`implements` (0.85), `imports` (0.70). This reflects that a class→method relationship is much tighter than a cross-file import
- **Other graphs** use a uniform `bfsDecay` (default 0.8)
- Prune early if the best possible decay can't pass `minScore`
- Neighboring nodes discovered via BFS inherit decayed scores
- **Code graph**: incoming `imports` edges are excluded from BFS to avoid noise from popular utility files being pulled in as neighbors of every search result
- When `bfsDecay` is explicitly passed as a parameter, it overrides edge-specific decay (uniform behavior)

### Step 5: Merge and output

- De-duplicate: keep highest score per node across all seeds and BFS paths
- Discard below `minScore`
- Sort descending by score
- Cap at `maxResults`

## Search modes

The `searchMode` parameter controls which scoring methods are used:

| Mode | Description |
|------|-------------|
| `hybrid` | BM25 + vector (default) |
| `vector` | Embedding cosine similarity only |
| `keyword` | BM25 keyword search only |

## Default parameters

| Parameter | Docs/Code/Knowledge/Tasks/Skills | File-level search |
|-----------|----------------------------------|-------------------|
| `topK` | 5 | 10 |
| `bfsDepth` | 1 | — (no BFS) |
| `maxResults` | 20 | 10 |
| `minScore` | 0.5 | 0.3 |
| `bfsDecay` | 0.8 | — |

`recall_skills` uses `minScore: 0.3` for higher recall in task contexts.

## BM25 index

**File**: `src/lib/search/bm25.ts`

### BM25Index class

Maintained incrementally by each graph manager:
- `add(id, text)` — on node creation
- `remove(id)` — on node deletion
- `update(id, text)` — on node update

### Tokenizer

Splits text into tokens by:
1. Whitespace
2. Punctuation boundaries
3. CamelCase boundaries: `getUserById` → `[get, user, by, id]`

All tokens are lowercased. A minimal stop-word list filters common words that never carry meaning in code search: articles (`a`, `an`, `the`), conjunctions (`and`, `or`, `but`), prepositions (`of`, `with`, `by`, `from`, `in`, `to`, etc.), pronouns (`it`, `he`, `she`, `we`, `they`), and modals (`would`, `could`, `should`). Programming-significant words like `for`, `do`, `if`, `not`, `is`, `has`, `can` are preserved.

### Text extraction

Each graph defines what text to extract for BM25 indexing:

| Graph | BM25 text |
|-------|-----------|
| DocGraph | `title + content` |
| CodeGraph | `name + signature + docComment + body` (body truncated to 2000 chars) |
| KnowledgeGraph | `title + content` |
| TaskGraph | `title + description` |
| SkillGraph | `title + description + triggers` (triggers included!) |
| FileIndexGraph | N/A (cosine only, no BM25) |

## File-level search

`search_files` and `search_topic_files` use **file-level embeddings** stored on root nodes:
- Code: file path only
- Docs: file path + h1 title

These searches use simple cosine similarity with no BFS expansion. Default `minScore: 0.3`, `topK: 10`.

## Search modules

| Module | File | Used by |
|--------|------|---------|
| Docs search | `src/lib/search/docs.ts` | `search` MCP tool |
| Code search | `src/lib/search/code.ts` | `search_code` MCP tool |
| Knowledge search | `src/lib/search/knowledge.ts` | `search_notes` MCP tool |
| Task search | `src/lib/search/tasks.ts` | `search_tasks` MCP tool |
| Skill search | `src/lib/search/skills.ts` | `search_skills`, `recall_skills` MCP tools |
| File-level search | `src/lib/search/files.ts` | `search_files`, `search_topic_files` MCP tools |
| File index search | `src/lib/search/file-index.ts` | `search_all_files` MCP tool |

## Proxy node exclusion

Knowledge, Task, and Skill searches automatically exclude proxy nodes (cross-graph phantom nodes). Proxies have empty embeddings and their IDs start with `@`.
