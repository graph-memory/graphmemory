# Getting Started with Graph Memory

Graph Memory is an MCP server that builds a **semantic graph** from your project directory. It indexes markdown documentation, TypeScript/JavaScript source code, and all project files — then exposes 58 tools for searching, navigating, and enriching that knowledge.

## What does it do?

Imagine having a smart assistant that has read every file in your project and can instantly:

- **Find relevant documentation** by meaning, not just keywords
- **Look up any code symbol** — functions, classes, interfaces — with full context
- **Track knowledge and decisions** in a persistent note graph
- **Manage tasks** with a full kanban workflow
- **Store reusable skills** — recipes, procedures, and troubleshooting guides
- **Cross-reference** code definitions with documentation examples

## The Six Graphs

Graph Memory maintains six separate but interconnected graphs:

| Graph | What it indexes | Created from |
|-------|----------------|--------------|
| **DocGraph** | Markdown sections, headings, code blocks | Files matching `graphs.docs.pattern` |
| **CodeGraph** | Functions, classes, methods, imports | Files matching `graphs.code.pattern` |
| **FileIndexGraph** | All files and directories with metadata | Entire project directory |
| **KnowledgeGraph** | User-created notes, facts, decisions | Manual creation via tools |
| **TaskGraph** | Tasks with status, priority, dependencies | Manual creation via tools |
| **SkillGraph** | Reusable recipes, procedures, triggers | Manual creation via tools |

## How search works

All search tools use **semantic search** — you describe what you're looking for in natural language, and the system finds the most relevant results by meaning.

Under the hood:
1. Your query is converted to a **vector embedding** (a list of numbers representing meaning)
2. This vector is compared against all indexed items using **cosine similarity**
3. Top matches are expanded via **BFS graph walk** — following links to find related content
4. Results are scored and ranked by relevance

This means `"how to authenticate users"` will find documentation about auth even if it never contains that exact phrase.

## Quick start workflow

1. **Configure** your project in `graph-memory.yaml` with `graphs.docs.pattern` and `graphs.code.pattern`
2. **Start** the server: `mcp-graph-memory serve --config graph-memory.yaml`
3. **Browse** your indexed content in the UI
4. **Search** across all graphs using natural language
5. **Create notes** to capture knowledge and decisions
6. **Link** notes to code, docs, files, and tasks for a connected knowledge base
