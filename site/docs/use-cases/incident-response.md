---
title: "Incident Response"
sidebar_label: "Incident Response"
sidebar_position: 5
description: "Use Graph Memory during incident response — quickly search code, check documentation, review past decisions, and create follow-up tasks."
keywords: [incident response, debugging, production, search, tasks, knowledge, postmortem]
---

# Incident Response

**Scenario:** A production issue occurs and you need to quickly understand the affected code, find relevant documentation, and track the fix.

## The Problem

During an incident, time is critical. You need to navigate unfamiliar code paths, understand system behavior, and find relevant context — all under pressure. Searching through files manually is slow, and tribal knowledge about past incidents is scattered or lost.

## The Workflow

### 1. Search the Code

Start by finding the relevant code:

```
code_docs_search({ query: "payment processing timeout" })
code_docs_search({ query: "database connection pool exhaustion" })
```

Get the full source of suspicious functions:

```
code_get_symbol({ nodeId: "src/payments/processor.ts::processPayment" })
```

### 2. Check Documentation

Find relevant documentation about the system's expected behavior:

```
docs_search({ query: "payment processing flow" })
docs_search({ query: "error handling strategy" })
```

### 3. Look Up Past Knowledge

Check if there are notes about this area — past incidents, known issues, or design constraints:

```
notes_search({ query: "payment timeout" })
notes_search({ query: "connection pool" })
```

Finding a note like "Database connection pool sizing decision" can immediately explain why the pool is configured a certain way and what the expected limits are.

### 4. Search for Related Skills

Check if there is a documented procedure for this type of incident:

```
skills_recall({ context: "database connection pool troubleshooting" })
skills_recall({ context: "payment system recovery" })
```

### 5. Create a Fix Task

Once you understand the issue, create a task to track the fix:

```
tasks_create({
  title: "Fix connection pool exhaustion under high payment load",
  description: "Under sustained high load, the connection pool is exhausted because...",
  priority: "critical",
  status: "in_progress",
  tags: ["incident", "payments", "database"]
})
```

Link the task to the affected code:

```
tasks_create_link({
  taskId: "fix-connection-pool-exhaustion-under-high-payment-load",
  targetId: "src/db/pool.ts::createPool",
  targetGraph: "code",
  kind: "fixes"
})
```

### 6. Document the Incident

After resolution, capture what you learned:

```
notes_create({
  title: "Incident: Connection pool exhaustion (2025-01-15)",
  content: "Root cause: Long-running transactions held connections during payment retries...\n\nResolution: Added connection timeout and retry backoff...\n\nPrevention: Monitor pool usage, alert at 80% utilization",
  tags: ["incident", "postmortem", "database"]
})
```

Link the postmortem to the fix and the code:

```
notes_create_link({
  fromId: "incident-connection-pool-exhaustion-2025-01-15",
  toId: "fix-connection-pool-exhaustion-under-high-payment-load",
  targetGraph: "tasks",
  kind: "documents"
})
```

### 7. Save a Procedure

If this type of incident might recur, save the debugging steps as a skill:

```
skills_create({
  title: "Debug connection pool exhaustion",
  steps: [
    "1. Check active connection count: SELECT count(*) FROM pg_stat_activity",
    "2. Find long-running queries: SELECT * FROM pg_stat_activity WHERE state = 'active' ORDER BY query_start",
    "3. Check pool config in src/db/pool.ts",
    "4. Review recent changes to transaction handling",
    "5. If immediate fix needed: restart service to release connections"
  ],
  triggers: ["connection pool", "too many connections", "database timeout"],
  tags: ["incident", "database", "ops"]
})
```

## Key Tools

| Tool | Purpose in incident response |
|------|------------------------------|
| `code_search` | Find relevant code quickly |
| `code_get_symbol` | Read the full source of a function |
| `docs_search` | Find documentation about system behavior |
| `notes_search` | Look up past decisions and incidents |
| `skills_recall` | Find existing troubleshooting procedures |
| `tasks_create` | Track the fix |
| `tasks_create_link` | Link fix task to affected code |
| `notes_create` | Write the postmortem |
| `skills_create` | Save the debugging procedure for next time |

## Tip: Use the Prompt Builder

The Web UI's Prompt Builder has an **Incident Response** scenario that generates a system prompt optimized for fast search and knowledge lookup during incidents. It enables deep search with aggressive knowledge capture — every finding gets documented and every fix gets tracked.
