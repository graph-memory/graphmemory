---
slug: graph-memory-vs-rag
title: "Graph Memory vs RAG: Structured Graphs vs Text Chunks"
authors: [graphmemory]
tags: [comparison, architecture, rag]
description: "How Graph Memory's structured graph approach compares to traditional RAG for AI-powered code understanding."
---

If you're building AI-powered developer tools, you've probably considered RAG (Retrieval-Augmented Generation). Graph Memory takes a different approach. Here's how they compare and when to use each.

<!-- truncate -->

## How RAG works

Traditional RAG splits your codebase into text chunks, embeds them into vectors, and retrieves the most similar chunks for a given query. It's simple, well-understood, and works reasonably well for many use cases.

But it has limitations:

- **No structure** — a function definition is just text, no different from a comment
- **No relationships** — RAG doesn't know that `AuthService` calls `TokenManager`
- **No cross-references** — the doc explaining auth and the code implementing it are unrelated chunks
- **No persistence** — you can't store decisions, track tasks, or build team knowledge

## How Graph Memory works

Graph Memory builds **six typed graphs** from your project:

| Graph | What it understands |
|-------|-------------------|
| Docs | Heading hierarchy, cross-file links, code blocks |
| Code | AST symbols, imports, call relationships |
| Knowledge | Notes, typed relations, cross-graph links |
| Tasks | Kanban status, priorities, assignees |
| Skills | Steps, triggers, usage frequency |
| Files | Directory structure, languages, metadata |

Every entity is embedded for vector search, but it's also connected to related entities through typed edges. When you search for "authentication", you don't just get text chunks — you get the auth module's functions, the docs explaining the auth flow, notes about auth decisions, and tasks related to auth work.

## Key differences

| Aspect | RAG | Graph Memory |
|--------|-----|-------------|
| **Data model** | Flat text chunks | Typed nodes + edges in typed graphs |
| **Code understanding** | Text similarity | AST-parsed symbols + import graph |
| **Relationships** | None | Typed edges (calls, imports, blocks, relates_to) |
| **Search** | Vector similarity | Hybrid BM25 + vector + graph expansion |
| **Persistence** | Read-only index | Read-write (notes, tasks, skills) |
| **Cross-domain** | Separate indices | Cross-graph links (code ↔ docs ↔ notes) |

## When to use what

**Use RAG when:**
- You need a quick, simple solution for text retrieval
- Your content is mostly unstructured prose (blog posts, wikis)
- You don't need to track relationships between entities

**Use Graph Memory when:**
- You're working with codebases (structure matters)
- You want AI to understand relationships (what calls what, what documents what)
- You need persistent team memory (notes, decisions, procedures)
- You want task tracking integrated with code context
- You want your AI to build and maintain knowledge over time

## The best of both worlds

Graph Memory actually includes vector search — every node is embedded and searchable via cosine similarity. But it adds BM25 keyword search and BFS graph expansion on top. You get the recall of RAG plus the precision of structured graphs.

The result: when your AI assistant asks "how does authentication work?", it gets:
1. The `AuthService` class and its methods (from Code Graph)
2. The authentication docs with step-by-step flow (from Docs Graph)
3. Team decisions about auth architecture (from Knowledge Graph)
4. Open tasks related to auth improvements (from Task Graph)
5. The "setup auth for new service" skill (from Skill Graph)

That's something flat RAG simply can't do.

---

Ready to try it? [Get started in under a minute →](/docs/getting-started/quick-start)
