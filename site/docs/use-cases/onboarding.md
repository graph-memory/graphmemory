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
docs_list_files()
```

This returns all indexed markdown files with their titles and section counts. Get an overview of the project's documentation landscape.

Search for specific topics:

```
docs_search({ query: "getting started" })
docs_search({ query: "architecture overview" })
```

### 2. Understand the Code Structure

List code graph source files (TypeScript/JavaScript) to see how the codebase is organized:

```
code_list_files()
```

For a full project structure overview including all file types, use `files_list()` instead.

Explore symbols in key files:

```
code_get_file_symbols({ fileId: "src/index.ts" })
code_get_file_symbols({ fileId: "src/api/routes.ts" })
```

Search for specific concepts in the code:

```
code_search({ query: "authentication middleware" })
code_search({ query: "database connection" })
```

### 3. Read Existing Knowledge

Check for team notes and decisions:

```
notes_list()
notes_search({ query: "architecture decisions" })
```

These notes often contain the "why" behind design choices — exactly what onboarding docs miss.

### 4. Review Current Tasks

See what the team is working on:

```
tasks_list({ status: "in_progress" })
tasks_list({ status: "todo" })
```

This gives context on active development areas and priorities.

### 5. Find Procedures

Check for existing skills and procedures:

```
skills_list()
skills_recall({ context: "development setup" })
skills_recall({ context: "deployment process" })
```

## Key Tools

| Tool | Purpose in onboarding |
|------|----------------------|
| `docs_list_files` | See all available documentation |
| `docs_search` | Find relevant doc sections by topic |
| `code_list_files` | List code graph source files (TS/JS) |
| `files_list` | Browse full project file tree |
| `code_get_file_symbols` | Explore what a source file exports |
| `code_search` | Find code by concept, not just name |
| `notes_list` | Read team knowledge and decisions |
| `notes_search` | Find notes on specific topics |
| `tasks_list` | See current work items |
| `skills_recall` | Find documented procedures |

## Tip: Use the Prompt Builder

The Web UI's Prompt Builder has an **Onboarding** scenario that generates a system prompt optimized for exploration and discovery. Copy it into your AI assistant configuration to get the best onboarding experience.
