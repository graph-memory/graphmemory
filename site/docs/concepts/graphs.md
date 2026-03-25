---
title: "Graphs"
sidebar_label: "Graphs"
sidebar_position: 1
description: "Overview of Graph Memory's interconnected graphs: Docs, Code, Knowledge, Tasks, Skills, and File Index."
keywords: [graphs, overview, docs, code, knowledge, tasks, skills, file index, cross-graph]
---

# Graphs

Graph Memory organizes your project into specialized graphs, each designed for a different kind of information. Together, they give your AI assistant a complete, searchable picture of your project.

## At a glance

| Graph | What it stores | How it's populated |
|-------|---------------|-------------------|
| **Docs** | Markdown documentation, split by section | Automatic indexing |
| **Code** | Functions, classes, interfaces, and their relationships | Automatic indexing |
| **File Index** | Every file and directory in your project | Automatic indexing |
| **Knowledge** | Notes, decisions, facts, and observations | You or your AI create them |
| **Tasks** | Tasks with kanban workflow and priorities | You or your AI create them |
| **Skills** | Reusable recipes, procedures, and troubleshooting guides | You or your AI create them |

The first three graphs are **automatically populated** when Graph Memory indexes your project. The last three are **manually curated** -- you and your AI assistant create entries as you work.

## Docs Graph

The Docs Graph indexes your markdown documentation. Each file is split into sections at heading boundaries, so a search for "how does authentication work?" can return the specific section that explains it -- not the entire file.

What you can do:
- **Search by meaning** -- find documentation sections by what they explain, not just keywords
- **Browse by topic** -- list all documentation files, then drill into their sections
- **Find code examples** -- code blocks inside docs are extracted and searchable separately
- **Follow cross-references** -- links between doc files are preserved as graph connections

Key tools: `docs_search`, `docs_search_files`, `docs_get_toc`, `docs_get_node`, `docs_find_examples`

## Code Graph

The Code Graph parses your TypeScript and JavaScript source files and extracts every meaningful symbol: functions, classes, interfaces, types, enums, and variables. It also captures relationships like imports, inheritance, and interface implementations.

What you can do:
- **Search code by meaning** -- "find the function that validates user input" works even if no function is named `validateUserInput`
- **Look up symbols** -- get the full signature, JSDoc comments, and source body of any function or class
- **Explore structure** -- list all symbols in a file, see what a class contains, follow import chains
- **Find cross-references** -- see where a symbol is referenced across both code and documentation

Key tools: `code_search`, `code_get_symbol`, `code_get_file_symbols`, `code_list_files`, `docs_cross_references`

## File Index Graph

The File Index Graph catalogs every file and directory in your project. It detects languages, tracks file sizes, and maintains the directory hierarchy. This gives your AI assistant the ability to find files by path or purpose without scanning the filesystem.

What you can do:
- **Find files by path** -- "find config files" returns files with "config" in the path
- **Browse directories** -- explore the project structure like a file explorer
- **Get file metadata** -- language, size, MIME type for any file

Key tools: `files_search`, `files_list`, `files_get_info`

## Knowledge Graph

The Knowledge Graph is your project's persistent memory. Use it to store architectural decisions, bug investigation notes, meeting summaries, non-obvious patterns -- anything that would be useful to remember across conversations.

What you can do:
- **Create notes** with titles, content, and tags
- **Search by meaning** -- "why did we choose PostgreSQL?" finds the relevant note
- **Link notes to code** -- connect a decision note to the exact code symbol it affects
- **Link notes to docs, tasks, and files** -- build a web of context
- **Edit in your IDE** -- notes are mirrored to `.notes/` as markdown files

Key tools: `notes_create`, `notes_search`, `notes_get`, `notes_create_link`, `notes_find_linked`

:::tip
Knowledge notes are ideal for capturing the "why" behind decisions. Your AI assistant can create notes during conversations and find them again later, giving it long-term memory across sessions.
:::

## Tasks Graph

The Tasks Graph provides a lightweight kanban workflow right inside your project. Tasks flow through statuses (backlog, todo, in_progress, review, done, cancelled) and can be linked to the code they affect, the docs they reference, and the notes that provide context.

What you can do:
- **Create and manage tasks** with priorities, assignees, due dates, and estimates
- **Track progress** through a kanban workflow
- **Link tasks to context** -- connect a task to the code it modifies, the docs it references, or the notes that explain the background
- **Search tasks** -- "what authentication tasks are open?" uses semantic search
- **Edit in your IDE** -- tasks are mirrored to `.tasks/` as markdown files

Key tools: `tasks_create`, `tasks_list`, `tasks_move`, `tasks_search`, `tasks_create_link`

## Skills Graph

The Skills Graph stores reusable recipes and procedures. When your AI assistant figures out how to do something -- deploy a service, debug an auth issue, add a new API endpoint -- it can save that knowledge as a skill with step-by-step instructions for next time.

What you can do:
- **Create skills** with descriptions, steps, and trigger phrases
- **Recall relevant skills** -- when starting a task, ask "what recipes do I have for this?"
- **Track usage** -- see which skills are used most often
- **Link skills to code and docs** -- connect a skill to the files it applies to
- **Edit in your IDE** -- skills are mirrored to `.skills/` as markdown files

Key tools: `skills_create`, `skills_search`, `skills_recall`, `skills_bump_usage`, `skills_create_link`

## How the graphs connect

The real power of Graph Memory comes from **cross-graph links**. Any note, task, or skill can link to nodes in any other graph:

```
Knowledge note: "Why we use JWT tokens"
    ├── links to → Code: src/auth.ts::createToken
    ├── links to → Docs: docs/auth.md::JWT Tokens
    └── links to → Task: implement-token-refresh

Task: "Fix auth redirect loop"
    ├── links to → Code: src/auth.ts::login
    ├── links to → Knowledge: auth-redirect-loop-root-cause
    └── links to → Skill: debug-authentication-issues
```

This means your AI assistant can:

- **Before modifying code**: check if any notes document design decisions about it
- **When starting a task**: find linked code, relevant docs, and applicable skills
- **When investigating a bug**: search notes for past investigations, find related tasks

:::info
Cross-graph links are validated -- you can only link to nodes that actually exist. If a linked file is removed during re-indexing, the link is automatically cleaned up.
:::

## Enabling and disabling graphs

You can disable any graph you don't need in your configuration:

```yaml
graphs:
  code:
    enabled: false    # Skip code indexing
  skills:
    enabled: false    # No skills graph
```

When a graph is disabled, its MCP tools are not registered and its REST API routes return 404. The other graphs continue to work independently.
