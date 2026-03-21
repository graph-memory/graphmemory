---
title: "Project Onboarding"
sidebar_label: "Project Onboarding"
sidebar_position: 1
description: "Use Graph Memory to onboard new developers quickly — search docs, explore code symbols, and understand the project structure."
keywords: [onboarding, new developer, project exploration, search, documentation, code symbols]
---

# Project Onboarding

**Scenario:** A new developer joins the team and needs to understand a project quickly.

## The Problem

Onboarding typically involves reading scattered documentation, asking teammates for context, and slowly piecing together how the codebase works. This takes days or weeks, and much of the tribal knowledge never makes it into docs.

## The Workflow

With Graph Memory connected to your AI assistant, onboarding becomes a conversation.

### 1. Explore the Documentation

Start by understanding what documentation exists:

```
list_topics()
```

This returns all indexed markdown files with their titles and section counts. Get an overview of the project's documentation landscape.

Search for specific topics:

```
search({ query: "getting started" })
search({ query: "architecture overview" })
```

### 2. Understand the Code Structure

List code graph source files (TypeScript/JavaScript) to see how the codebase is organized:

```
list_files()
```

For a full project structure overview including all file types, use `list_all_files()` instead.

Explore symbols in key files:

```
get_file_symbols({ filePath: "src/index.ts" })
get_file_symbols({ filePath: "src/api/routes.ts" })
```

Search for specific concepts in the code:

```
search_code({ query: "authentication middleware" })
search_code({ query: "database connection" })
```

### 3. Read Existing Knowledge

Check for team notes and decisions:

```
list_notes()
search_notes({ query: "architecture decisions" })
```

These notes often contain the "why" behind design choices — exactly what onboarding docs miss.

### 4. Review Current Tasks

See what the team is working on:

```
list_tasks({ status: "in_progress" })
list_tasks({ status: "todo" })
```

This gives context on active development areas and priorities.

### 5. Find Procedures

Check for existing skills and procedures:

```
list_skills()
recall_skills({ query: "development setup" })
recall_skills({ query: "deployment process" })
```

## Key Tools

| Tool | Purpose in onboarding |
|------|----------------------|
| `list_topics` | See all available documentation |
| `search` | Find relevant doc sections by topic |
| `list_files` | List code graph source files (TS/JS) |
| `list_all_files` | Browse full project file tree |
| `get_file_symbols` | Explore what a source file exports |
| `search_code` | Find code by concept, not just name |
| `list_notes` | Read team knowledge and decisions |
| `search_notes` | Find notes on specific topics |
| `list_tasks` | See current work items |
| `recall_skills` | Find documented procedures |

## Tip: Use the Prompt Builder

The Web UI's Prompt Builder has an **Onboarding** scenario that generates a system prompt optimized for exploration and discovery. Copy it into your AI assistant configuration to get the best onboarding experience.
