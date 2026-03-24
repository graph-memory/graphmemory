---
title: "Scenarios"
sidebar_label: "Scenarios"
sidebar_position: 4
description: "14 built-in scenarios for common development workflows: onboarding, code review, bug investigation, architecture design, and more."
keywords: [scenarios, prompt builder, onboarding, code review, bug investigation, architecture, documentation, task planning]
---

# Scenarios

Scenarios are pre-configured starting points that optimize the prompt for a specific workflow. Each scenario selects default graphs, role, style, and focus tools. You can use a scenario as-is or customize any setting after selecting it.

## Onboarding

**Explore a new project — architecture, code, and docs.**

- **Default role**: Developer | **Style**: Balanced
- **Graphs**: All six (docs, code, files, knowledge, tasks, skills)
- **Focus tools**: `docs_search`, `code_search`, `docs_cross_references`, `docs_explain_symbol`, `docs_get_toc`, `docs_list_files`, `code_get_symbol`, `files_search`

Use this when joining a project for the first time or returning after a long break. The prompt emphasizes deep search, detailed explanations, and read-heavy exploration. Notes and tasks are created only when asked.

## Development

**Everyday coding — tasks, context, code, knowledge.**

- **Default role**: Developer | **Style**: Proactive
- **Graphs**: All six
- **Focus tools**: `code_search`, `code_get_symbol`, `tasks_search`, `tasks_move`, `skills_recall`, `notes_create`, `tasks_find_linked`, `docs_cross_references`

Use this for day-to-day development work. The prompt balances code search with task management and encourages the assistant to proactively capture knowledge and track work items.

## Code Review

**Review changes with full project context.**

- **Default role**: Reviewer | **Style**: Reactive
- **Graphs**: Code, Docs, Files, Tasks
- **Focus tools**: `code_search`, `code_get_symbol`, `tasks_find_linked`, `docs_find_examples`, `docs_cross_references`, `notes_search`, `code_get_file_symbols`

Use this when reviewing pull requests or code changes. The prompt focuses on correctness, consistency, and checking changes against documentation. The assistant searches freely but only creates notes or tasks when you ask.

## Bug Investigation

**Investigate and fix bugs with context.**

- **Default role**: Developer | **Style**: Proactive
- **Graphs**: Code, Knowledge, Tasks, Files
- **Focus tools**: `code_search`, `code_get_symbol`, `notes_search`, `tasks_find_linked`, `tasks_create`, `notes_create`, `code_get_file_symbols`, `files_search`

Use this when debugging issues. The prompt enables deep search with maximum cross-graph expansion and encourages the assistant to automatically capture findings as notes and create follow-up tasks.

## Refactoring

**Restructure code, understand dependencies.**

- **Default role**: Developer | **Style**: Reactive
- **Graphs**: Code, Docs, Files, Tasks
- **Focus tools**: `code_search`, `code_get_file_symbols`, `code_get_symbol`, `docs_cross_references`, `tasks_find_linked`, `code_list_files`, `code_search_files`

Use this when restructuring or reorganizing code. The prompt emphasizes dependency analysis and deep search to help you understand what depends on the code you're changing.

## Architecture

**Design features, analyze patterns and structure.**

- **Default role**: Architect | **Style**: Proactive
- **Graphs**: Code, Docs, Files, Knowledge, Skills
- **Focus tools**: `docs_search`, `code_search`, `docs_cross_references`, `code_list_files`, `docs_get_toc`, `notes_create`, `skills_create`, `skills_recall`

Use this when designing new features, evaluating system structure, or making architectural decisions. The prompt encourages capturing decisions as notes and saving architectural patterns as skills.

## Documentation

**Write and maintain project documentation.**

- **Default role**: Tech Writer | **Style**: Proactive
- **Graphs**: Docs, Code, Knowledge, Files
- **Focus tools**: `docs_search`, `docs_get_toc`, `docs_cross_references`, `docs_search_files`, `docs_get_node`, `code_search`, `notes_create`, `docs_list_files`

Use this when writing or updating documentation. The prompt focuses on finding documentation gaps, verifying code examples, and maintaining consistency between docs and code.

## Task Planning

**Plan sprints, manage priorities, track work.**

- **Default role**: Team Lead | **Style**: Proactive
- **Graphs**: Tasks, Skills, Knowledge, Code
- **Focus tools**: `tasks_list`, `tasks_search`, `tasks_create`, `tasks_move`, `skills_recall`, `notes_create`, `tasks_link`, `tasks_find_linked`

Use this for sprint planning, backlog grooming, or priority management. The prompt emphasizes task creation and management with concise, action-oriented responses.

## Knowledge Capture

**Capture decisions, facts, and procedures.**

- **Default role**: Developer | **Style**: Proactive
- **Graphs**: Knowledge, Tasks, Skills, Code
- **Focus tools**: `notes_create`, `notes_create_link`, `skills_create`, `tasks_create`, `tasks_create_link`, `notes_search`, `code_search`

Use this during or after meetings, decision discussions, or when you want to systematically capture project knowledge. The prompt maximizes note creation, relation building, and skill capture.

## Mentoring

**Explain code and architecture to others.**

- **Default role**: Developer | **Style**: Read-only
- **Graphs**: Code, Docs, Files, Knowledge
- **Focus tools**: `docs_explain_symbol`, `docs_cross_references`, `docs_get_toc`, `docs_search`, `code_search`, `code_get_symbol`, `docs_get_node`, `docs_list_files`

Use this when teaching someone about the codebase. The prompt provides exhaustive explanations with deep search but never modifies the graph, keeping the focus on reading and explaining.

## Incident Response

**Investigate production issues, find root cause, track fix.**

- **Default role**: Developer | **Style**: Proactive
- **Graphs**: Code, Knowledge, Tasks, Files, Skills
- **Focus tools**: `code_search`, `code_get_symbol`, `notes_search`, `skills_recall`, `tasks_create`, `notes_create`, `tasks_find_linked`, `files_search`

Use this during production incidents. The prompt enables deep, wide search and aggressive knowledge capture — every finding gets documented, every fix gets tracked. Concise responses keep the focus on speed.

## Dependency Audit

**Analyze project dependencies, imports, and module structure.**

- **Default role**: Architect | **Style**: Balanced
- **Graphs**: Code, Files, Knowledge, Tasks
- **Focus tools**: `files_search`, `files_list`, `files_get_info`, `code_search`, `code_get_file_symbols`, `code_list_files`, `notes_create`

Use this when analyzing your project's dependency structure, auditing packages, or mapping module boundaries. The prompt emphasizes file and code analysis tools.

## Sprint Retrospective

**Review completed work, extract learnings, plan improvements.**

- **Default role**: Team Lead | **Style**: Proactive
- **Graphs**: Tasks, Knowledge, Skills, Code
- **Focus tools**: `tasks_list`, `tasks_search`, `notes_list`, `notes_search`, `skills_recall`, `notes_create`, `tasks_create`, `skills_create`

Use this for sprint reviews and retrospectives. The prompt focuses on reviewing completed tasks, extracting learnings as knowledge notes, and creating improvement tasks for the next sprint.

## Custom

**Build your own prompt from scratch.**

- **Default role**: Developer | **Style**: Reactive
- **Graphs**: All six
- **Focus tools**: None pre-selected

Use this when none of the built-in scenarios fit your workflow. All graphs are enabled and no tools are pre-prioritized, giving you a blank slate to configure through the other builder settings.

## Advanced defaults per scenario

When using the Advanced Builder, each scenario pre-configures settings across the Behavior, Memory, Search, and Collaboration tabs. These defaults are applied when you select a scenario, but you can override any of them.

The `advancedDefaults` for each scenario control:

- **Behavior**: verbosity, code example frequency, explanation depth
- **Memory Strategy**: auto-creation of notes/tasks, relation strategy, skill capture threshold
- **Search Strategy**: default depth, cross-graph expansion, BFS hops
- **Collaboration**: solo/pair/team-lead mode, review strictness
- **Enabled sections**: which prompt sections are turned on beyond the always-on ones

Here are a few examples:

### Onboarding

Optimized for exploration with maximum context:
- **Behavior**: detailed verbosity, always show code examples, deep-dive explanations
- **Memory**: notes created only when asked, conservative relations, no auto task creation
- **Search**: deep default depth, always expand across graphs, 3 BFS hops
- **Collaboration**: solo mode, lenient review
- **Enabled sections**: behavior, search

### Bug Investigation

Optimized for fast debugging with aggressive knowledge capture:
- **Behavior**: detailed verbosity, always show code examples, deep-dive explanations
- **Memory**: always auto-create notes and tasks, aggressive relation linking
- **Search**: deep default depth, always expand across graphs, 3 BFS hops
- **Enabled sections**: memory, search

### Task Planning

Optimized for concise management workflows:
- **Behavior**: concise verbosity, no code examples, brief explanations
- **Memory**: notes on ask, always auto-create tasks
- **Collaboration**: team-lead mode, standard review strictness
- **Enabled sections**: collaboration, memory
