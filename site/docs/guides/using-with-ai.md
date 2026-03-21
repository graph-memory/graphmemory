---
title: "Using with AI Assistants"
sidebar_label: "Using with AI Assistants"
sidebar_position: 6
description: "Best practices for using Graph Memory tools with AI coding assistants — search strategies, knowledge capture, and prompt building."
keywords: [AI, assistant, Claude, tools, search, knowledge, prompts, best practices, workflow]
---

# Using with AI Assistants

Graph Memory gives your AI assistant structured access to your project's documentation, code, knowledge, tasks, and skills. This guide covers how to get the most out of it.

## Search First, Read Later

The most important habit: **search the graph before reading files directly**. Graph Memory has already indexed your codebase and documentation with semantic embeddings. Searching is faster and more targeted than grepping or reading files.

| Instead of... | Use... |
|--------------|--------|
| Reading source files to find a function | `search_code` — finds symbols by meaning |
| Grepping docs for a topic | `search` — finds relevant sections even with different wording |
| Browsing the file tree | `search_all_files` — finds files by semantic path matching |

## Building Context

When your AI assistant needs to understand something about the project, follow this pattern:

### 1. Start Broad

Use search tools to find relevant content:

```
search({ query: "authentication flow" })
search_code({ query: "JWT token validation" })
```

### 2. Get Specific

Once you find relevant results, drill into details:

```
get_node({ nodeId: "docs/auth.md::## Token Validation" })
get_symbol({ symbolId: "src/auth.ts::validateToken" })
```

### 3. Cross-Reference

Bridge documentation and code:

```
cross_references({ symbol: "validateToken" })
```

This returns the code definition, documentation examples, and explanations in one call.

### 4. Check Knowledge

See if there are existing notes about the topic:

```
search_notes({ query: "authentication decisions" })
```

## Knowledge Capture

Graph Memory is most valuable when it accumulates knowledge over time. Capture decisions and discoveries as you work.

### Notes for Decisions

When you make an architectural choice or discover something non-obvious:

```
create_note({
  title: "Why we use JWTs instead of sessions",
  content: "Sessions require sticky load balancing...",
  tags: ["architecture", "auth"]
})
```

### Link Notes to Code

Connect knowledge to the relevant code:

```
create_relation({
  fromId: "why-we-use-jwts-instead-of-sessions",
  toId: "src/auth/jwt.ts::createToken",
  targetGraph: "code",
  kind: "documents"
})
```

### Skills for Procedures

Save reusable procedures so they can be recalled later:

```
create_skill({
  title: "Add a new API endpoint",
  description: "Step-by-step guide for adding a REST endpoint",
  steps: [
    "1. Create route file in src/routes/",
    "2. Define Zod request/response schemas",
    "3. Implement handler function",
    "4. Register route in src/routes/index.ts",
    "5. Add tests in src/tests/"
  ],
  triggers: ["new endpoint", "add API route", "create route"],
  tags: ["api", "backend"]
})
```

Before starting a complex task, check for existing skills:

```
recall_skills({ query: "add a new API endpoint" })
```

## Task Tracking

Create tasks directly from AI conversations:

```
create_task({
  title: "Fix auth redirect loop on expired tokens",
  description: "When a JWT expires during a request...",
  priority: "high",
  status: "todo",
  tags: ["bug", "auth"]
})
```

Link tasks to the relevant code:

```
create_task_link({
  taskId: "fix-auth-redirect-loop-on-expired-tokens",
  targetId: "src/auth/middleware.ts::checkAuth",
  targetGraph: "code",
  kind: "fixes"
})
```

Before working on a file, check for related tasks:

```
find_linked_tasks({ targetId: "src/auth/middleware.ts", targetGraph: "code" })
```

## Cross-Graph Linking

The real power of Graph Memory comes from connections across graphs. Link discoveries to code, docs, and tasks:

- **Note to code** — document why a function exists
- **Task to code** — track what needs fixing
- **Skill to docs** — reference documentation in a procedure
- **Note to note** — build a knowledge web

Every cross-graph link creates a proxy node in the target graph, making relationships discoverable from either side.

## Prompt Builder

The Web UI includes a **Prompt Builder** that generates optimized system prompts for 14 different scenarios:

Onboarding, Development, Code Review, Bug Investigation, Refactoring, Architecture, Documentation, Task Planning, Knowledge Capture, Mentoring, Incident Response, Dependency Audit, Sprint Retrospective, and Custom.

Open the Web UI at `http://localhost:3000`, go to the Prompt Builder section, select a scenario, and copy the generated prompt into your AI assistant's system configuration (e.g., `CLAUDE.md`, `.cursorrules`).

You can also use the reference prompt from `PROMPT.md` in the project root — it contains a complete tool reference optimized for AI consumption.
