---
title: "Team Knowledge Base"
sidebar_label: "Team Knowledge Base"
sidebar_position: 3
description: "Build and maintain a team knowledge base with notes, relations, and skills — searchable by AI assistants and editable in your IDE."
keywords: [knowledge base, notes, relations, skills, team, decisions, file mirror, IDE]
---

# Team Knowledge Base

**Scenario:** Your team wants to capture and maintain institutional knowledge — architecture decisions, debugging tips, onboarding notes, and reusable procedures.

## The Problem

Team knowledge lives in scattered places: Slack threads, meeting notes, individual memory, and outdated wiki pages. When someone leaves or a new person joins, critical context is lost.

## The Workflow

### 1. Capture Decisions as Notes

When the team makes an architectural choice, record it:

```
create_note({
  title: "Database: PostgreSQL over MongoDB",
  content: "We chose PostgreSQL because:\n- Strong consistency for financial transactions\n- JSON columns cover our semi-structured needs\n- Team has deep SQL experience",
  tags: ["architecture", "database"]
})
```

### 2. Connect Related Concepts

Build a knowledge web by creating relations between notes:

```
create_relation({
  fromId: "database-postgresql-over-mongodb",
  toId: "src/db/connection.ts::createPool",
  targetGraph: "code",
  kind: "documents"
})
```

Link notes to each other:

```
create_relation({
  fromId: "database-postgresql-over-mongodb",
  toId: "migration-strategy",
  targetGraph: "knowledge",
  kind: "related_to"
})
```

### 3. Save Procedures as Skills

Capture reusable procedures so they are discoverable:

```
create_skill({
  title: "Run database migrations",
  description: "How to create and apply database migrations",
  steps: [
    "1. Create migration: npm run migrate:create -- --name describe-change",
    "2. Write up/down SQL in the generated file",
    "3. Test locally: npm run migrate:up",
    "4. Verify: npm run migrate:status",
    "5. Commit the migration file"
  ],
  triggers: ["database migration", "schema change", "add column", "create table"],
  tags: ["database", "ops"]
})
```

Skills have `triggers` — short phrases that help the AI recall the skill when a matching task comes up.

### 4. Edit in Your IDE

Graph Memory mirrors notes, tasks, and skills to markdown files:

```
your-project/
  .notes/
    database-postgresql-over-mongodb/
      note.md
  .skills/
    run-database-migrations/
      skill.md
```

Team members can edit these files directly in their IDE or text editor. Changes are automatically imported back into the graph. This means the knowledge base is always editable as plain text — no vendor lock-in.

### 5. Search and Discover

The knowledge base is fully searchable:

```
search_notes({ query: "why did we choose PostgreSQL" })
recall_skills({ query: "how to deploy" })
```

Semantic search means you do not need to remember exact titles — searching by concept works.

## Key Tools

| Tool | Purpose |
|------|---------|
| `create_note` | Capture a decision, fact, or observation |
| `create_relation` | Connect notes to each other or to code/docs/tasks |
| `list_relations` | See all connections for a note |
| `search_notes` | Find notes by concept |
| `create_skill` | Save a reusable procedure |
| `recall_skills` | Find relevant skills for a task |
| `bump_skill_usage` | Track which skills get used |
| `link_skill` | Connect skills to each other |
| `create_skill_link` | Link a skill to code, docs, or tasks |

## Tips

- Use tags consistently across the team — they make filtering reliable.
- Add `triggers` to skills — they significantly improve recall accuracy.
- Link notes to code — it makes knowledge discoverable when working on related files.
- Review `.notes/` and `.skills/` in PRs — treat knowledge changes as part of the code review process.
