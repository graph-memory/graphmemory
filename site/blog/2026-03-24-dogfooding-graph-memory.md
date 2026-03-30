---
slug: dogfooding-graph-memory
title: "How We Use Graph Memory to Develop Graph Memory"
authors: [graphmemory]
tags: [engineering, workflow, dogfooding]
description: "We use Graph Memory's own task and knowledge tools to plan, track, and execute feature work on Graph Memory itself. Here's what that workflow looks like."
---

We build Graph Memory with Graph Memory. Not as a marketing exercise — it's genuinely the fastest way for us to work. Here's a concrete example from a recent development session where we shipped six features in one sitting.

<!-- truncate -->

## The setup

Graph Memory runs against its own codebase. Claude Code connects to it via MCP. Every conversation has access to the full code graph, docs graph, and — critically — the task and knowledge graphs where we track work and decisions.

The six features we shipped: WebSocket event fixes, sidebar color improvements, WebSocket connection indicator, Pino structured logging, unified filter components, and task grouping in the UI. Here's how Graph Memory's own tools drove the process.

## Step 1: Create tasks

We started by breaking work into tasks using `tasks_create`:

```
tasks_create({
  title: "Fix WebSocket event broadcasting",
  description: "WS events not reaching all connected clients...",
  priority: "high",
  status: "todo",
  tags: ["bug", "websocket"]
})
```

Each task got a priority, tags, and a description with enough context for any AI session to pick it up later. Six tasks, six clear scopes.

The tasks immediately appeared as markdown files in `.tasks/` — visible in the IDE sidebar, editable in any text editor. This is the file mirror at work: every task, note, and skill has a corresponding markdown file that syncs bidirectionally with the graph.

## Step 2: Plan in notes

Before writing code, we captured design decisions as notes:

```
notes_create({
  title: "Pino logger migration plan",
  content: "Replace console.log/warn/error with Pino structured logging...",
  tags: ["architecture", "decision"]
})
```

Then linked the note to the relevant task:

```
tasks_create_link({
  taskId: "pino-logger-migration",
  toId: "pino-logger-migration-plan",
  kind: "planned_by",
  targetGraph: "knowledge"
})
```

Now the task knows about the plan, and the plan links back to the task. Any AI session that looks at either one finds the other.

## Step 3: Implement with full context

When working on the Pino logger task, Claude Code already had context from the task description and the linked planning note. But it also had the code graph — it could search for every `console.log` call, find the existing logging patterns, and understand the module structure.

The workflow was: pick a task, read its linked notes for decisions, search the code graph for relevant symbols, implement, then update the task.

## Step 4: Track progress

As each feature landed, we moved tasks through the kanban:

```
tasks_move({
  taskId: "fix-websocket-event-broadcasting",
  status: "done"
})
```

The task graph maintained the full history — when each task was created, when it moved to `in_progress`, when it was completed. The `.tasks/` files updated automatically.

## Why this works

Three things make this workflow effective:

**Persistent context.** Notes and tasks survive across AI sessions. When you start a new conversation, the AI can search for existing decisions instead of re-discovering them. "What did we decide about the logger?" returns the actual planning note.

**Cross-graph links.** Tasks link to notes (decisions), notes link to code (implementation), code links to docs (explanation). The AI navigates these connections to build complete context for any piece of work.

**File mirror.** The `.tasks/` and `.notes/` directories make graph data visible in your IDE. You can scan task status in the file explorer, edit a note in your editor, or review decisions during code review — all without opening the web UI or making API calls. Changes sync back to the graph automatically.

## The meta observation

The best test of a developer tool is whether the developers building it actually want to use it. We don't use Graph Memory on our own project because we should — we use it because going back to ad-hoc context management feels broken once you've had structured graph memory.

Every decision is searchable. Every task links to its context. Every AI session starts with full project knowledge instead of a blank slate.

---

Want to try this workflow on your own project? [Get started in under 5 minutes](/blog/getting-started-5-minutes).
