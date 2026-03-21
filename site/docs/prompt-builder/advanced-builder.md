---
title: "Advanced Builder"
sidebar_label: "Advanced Builder"
sidebar_position: 3
description: "Full control over your system prompt with 14 configuration tabs: tools, workflow, behavior, memory, search, context budgets, collaboration, and more."
keywords: [advanced builder, prompt builder, tools, workflow, behavior, memory, search, context budget, collaboration]
---

# Advanced Builder

The Advanced Builder gives you granular control over every aspect of the generated system prompt. It starts with the same core settings as the Simple Builder (scenario, graphs, role, style) and adds 10 additional configuration tabs.

![Advanced Prompt Builder](/img/screenshots/prompts-advanced-dark.png)

## Configuration tabs

### Scenario

Select a starting scenario template. This pre-fills defaults across all other tabs, giving you a head start that you can then customize. Changing the scenario resets other tabs to that scenario's defaults.

### Graphs

Toggle which of the six graphs (Documentation, Code, Files, Knowledge, Tasks, Skills) are included in the prompt. Each enabled graph adds its tools and usage instructions.

### Role

Choose the assistant's personality and workflow. Same as the Simple Builder, but in the Advanced Builder you can see how it interacts with other tabs.

### Style

Set the mutation behavior (Proactive, Reactive, Read-only, Balanced, Aggressive, Guided). This controls how the assistant decides when to create notes, tasks, and skills.

### Stack

Configure technology domains relevant to your project. Select active domains and pick specific frameworks, languages, or tools within each domain. This helps the prompt include domain-specific guidance.

### Tools

Fine-tune individual tool priorities. For each of the 58 MCP tools, you can set a priority level:

| Priority | Meaning |
|----------|---------|
| **Always** | Use this tool proactively in every relevant context |
| **Prefer** | Use when relevant, favor over alternatives |
| **Available** | Use when explicitly needed |
| **Avoid** | Only use if specifically requested |
| **Disabled** | Never use this tool |

You can also add custom instructions per tool and define **tool chains** — ordered sequences of tools that should be used together for specific workflows.

### Workflow

Define step-by-step procedures as workflow steps. Each step has a description, a list of tools to use, and an optional condition. Workflows appear in the prompt as structured procedures the assistant should follow.

### Behavior

Control response characteristics:

- **Verbosity**: concise, normal, detailed, or exhaustive
- **Code examples**: always include, only when helpful, or never
- **Explanation depth**: brief, standard, or deep-dive
- **Response language**: target language for responses
- **Format preference**: bullets, tables, prose, or mixed

### Memory

Configure how the assistant manages the knowledge graph:

- **Auto-create notes**: always, ask first, or never
- **Note detail level**: 1-5 scale for how detailed captured notes should be
- **Relation strategy**: aggressive (link everything), conservative (important connections only), or manual (only when asked)
- **Skill capture threshold**: 1-5 scale for when to save procedures as skills
- **Task auto-create**: always, ask first, or never

### Search

Tune search behavior:

- **Default depth**: shallow, medium, or deep
- **Cross-graph expansion**: always expand to related graphs, only when needed, or never
- **BFS hops**: how many relationship hops to follow (1-5)
- **Result count**: number of results to return (5-50)
- **Keyword weight**: balance between keyword matching and semantic search (0-100)

### Context

Set token budgets to control how much context from each graph is included:

- **Max code tokens**: limit for code graph content
- **Max doc tokens**: limit for documentation content
- **Max knowledge tokens**: limit for knowledge graph content
- **Priority order**: which graphs get priority when budgets are tight
- **Deduplication**: strict, fuzzy, or none

### Rules

Define project-specific rules that appear in the prompt:

- **Focus patterns**: file or code patterns to prioritize
- **Ignore patterns**: patterns to skip
- **Naming conventions**: project naming standards
- **Code style rules**: formatting and style requirements
- **Architecture patterns**: approved design patterns
- **Anti-patterns**: patterns to flag and avoid

### Collaboration

Configure team interaction settings:

- **Mode**: solo (individual work), pair (two people collaborating), or team-lead (managing others)
- **Review strictness**: lenient, standard, strict, or pedantic
- **Commit style**: conventional commits, descriptive, or minimal
- **PR format**: detailed, standard, or minimal

### Advanced

Add custom prompt sections with free-form markdown. Use this for anything not covered by the other tabs — project-specific instructions, special constraints, or custom workflows.

## Live preview with token estimation

The preview panel shows the assembled prompt in real time and displays an estimated token count. This helps you stay within your AI assistant's context window limits and identify sections that might be too large.

## Export options

The Advanced Builder supports all export options:

- **Copy to clipboard**: paste directly into your AI assistant
- **Download as `.md`**: save as a markdown file
- **Save as preset**: store in browser for quick access later
- **Export as Skill**: create a skill in your project's graph

See [Presets & Export](./presets-export.md) for more on saving and sharing.
