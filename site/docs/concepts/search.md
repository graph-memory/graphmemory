---
title: "Search"
sidebar_label: "Search"
sidebar_position: 8
description: "How Graph Memory searches across all six graphs — hybrid BM25 + vector search, Reciprocal Rank Fusion, and BFS graph expansion."
keywords: [search, hybrid search, BM25, vector search, cosine similarity, RRF, BFS, semantic search]
---

# Search

Every graph in Graph Memory uses the same **hybrid search algorithm** that combines keyword matching with semantic similarity. This gives you the best of both worlds: exact keyword hits and conceptually related results.

## How hybrid search works

When you run a search query, two scoring methods run in parallel:

### 1. BM25 keyword search

BM25 is a proven text-ranking algorithm. It scores each node based on how well its text matches your query terms. The tokenizer handles code-style names — `getUserById` is split into `[get, user, by, id]` — so partial matches on camelCase identifiers work naturally.

### 2. Vector cosine similarity

Your query is converted into a vector (embedding), and compared against every node's pre-computed embedding. This captures **semantic meaning**: searching for "authentication" finds results about "login," "JWT," and "session management" even without those exact keywords.

### 3. Reciprocal Rank Fusion (RRF)

The two result lists are merged using RRF, which combines rankings without needing to normalize scores:

```
score(node) = 1/(k + rank_vector) + 1/(k + rank_bm25)
```

This gives balanced weight to both methods. A node ranked highly by either method surfaces near the top.

:::info
You can override the search mode if needed. Set `searchMode` to `vector` (embeddings only) or `keyword` (BM25 only) to use a single method instead of the hybrid default.
:::

## BFS graph expansion

After the initial scoring, Graph Memory takes the top results and **expands outward** through the graph using breadth-first search (BFS). This finds related nodes that are structurally connected to your results.

For example, searching for "authentication" might directly match a note about JWT tokens. BFS expansion then pulls in related notes about session management and linked code symbols — nodes you did not search for but that are connected to your results.

Each hop away from the original result reduces the score by a decay factor, so directly connected nodes rank higher than nodes two hops away. The code graph uses **edge-specific decay** (`contains`: 0.95, `extends`/`implements`: 0.85, `imports`: 0.70) to reflect that a class→method link is tighter than a cross-file import. Other graphs use a uniform decay of 0.8.

:::tip
BFS expansion is what makes graph-based search more powerful than flat document search. Connections between your notes, code, docs, and tasks enrich every query.
:::

## Default parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `topK` | 5 | Number of seed results before BFS expansion |
| `bfsDepth` | 1 | How many hops to expand |
| `bfsDecay` | 0.8 | Score multiplier per hop |
| `maxResults` | 20 | Maximum results returned |
| `minScore` | 0.5 (docs, notes, tasks, skills) / 0.3 (code) | Minimum score threshold |

:::note File Index search defaults
File Index search (`search_all_files`) uses different defaults: `topK: 10`, `minScore: 0.3`, and no BFS expansion. It uses vector-only search (no BM25) since file paths have no meaningful keyword text.
:::

:::note Code graph BFS behavior
During BFS expansion in the Code graph, incoming import edges are excluded. This prevents popular utility files from pulling in every module that imports them, which would add noise to search results.
:::

## Unified cross-graph search

Graph Memory includes search tools for each graph:

| Tool | Searches |
|------|----------|
| `search` | Documentation chunks |
| `search_code` | Code symbols |
| `search_notes` | Knowledge graph notes |
| `search_tasks` | Tasks |
| `search_skills` / `recall_skills` | Skills and recipes |
| `search_all_files` | File index (by path) |

Each tool searches its own graph but follows the same hybrid algorithm. Cross-graph links mean that BFS expansion can surface related nodes from the searched graph's connections.

## What text gets indexed

Each graph extracts different text for keyword search:

| Graph | Indexed text |
|-------|-------------|
| Docs | Title + content |
| Code | Name + signature + doc comment + body (body truncated to 2000 chars) |
| Knowledge | Title + content |
| Tasks | Title + description |
| Skills | Title + description + triggers |
| File Index | Path only (vector search, no BM25) |

:::tip
For skills, **triggers are included in the keyword index**. Adding good trigger phrases like `["new endpoint", "add route"]` makes a skill easier to find via keyword search.
:::

## Search modes

| Mode | Method | When to use |
|------|--------|-------------|
| `hybrid` | BM25 + vector (default) | General-purpose search |
| `vector` | Embedding similarity only | When you want semantic matches without exact keyword bias |
| `keyword` | BM25 only | When you know the exact terms to match |
