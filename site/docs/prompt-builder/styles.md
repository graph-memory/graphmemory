---
title: "Styles"
sidebar_label: "Styles"
sidebar_position: 6
description: "6 interaction styles that control how the AI assistant reads and writes to the knowledge graph: Proactive, Reactive, Read-only, Balanced, Aggressive, and Guided."
keywords: [styles, prompt builder, proactive, reactive, read-only, balanced, aggressive, guided, mutation behavior]
---

# Styles

Styles control the assistant's interaction pattern with the knowledge graph — specifically how it decides when to search, when to create entries, and when to ask for permission. All styles allow full read access; they differ in how they handle mutations (creating, updating, deleting, and linking entries).

## Proactive

**Behavior**: Acts without asking. Searches before answering, creates notes and tasks when they are clearly valuable, and links entries across graphs automatically.

**Search**: Always searches before responding. Checks for linked tasks when touching code areas. Recalls existing skills before starting workflows.

**Mutations**: Creates knowledge notes for important patterns, decisions, and gotchas. Creates tasks for concrete follow-up work. Saves non-obvious procedures as skills. Updates task status and bumps skill usage counters automatically.

**When to use**: Everyday development where you want the assistant to keep the knowledge graph up to date without constant approval. Good for workflows where speed matters more than control.

## Reactive

**Behavior**: Searches freely but only creates or modifies data when you explicitly ask.

**Search**: Proactively uses search tools to find relevant context. Checks existing knowledge and skills before suggesting solutions.

**Mutations**: Never creates notes, tasks, skills, or relations without your approval. Suggests what to create when it finds something worth capturing, then waits for you to confirm.

**When to use**: Code review, pair programming, or any workflow where you want full control over what gets written to the graph. The assistant provides context and suggestions without side effects.

## Read-only

**Behavior**: Searches and browses the knowledge graph but never creates, updates, or deletes anything.

**Search**: Full access to all search, get, list, find, and recall tools.

**Mutations**: None. Never calls any create, update, delete, move, link, add, remove, or bump tools. If it identifies something worth creating, it describes it but does not create it.

**When to use**: Presentations, demos, guided tours, or when you want to explore the knowledge graph without any risk of modification. Also useful for mentoring scenarios where the focus is purely on explaining.

## Balanced

**Behavior**: Searches autonomously and thoroughly, but asks before making any changes.

**Search**: Always searches before answering. Automatically checks for related tasks, existing skills, and cross-references. This happens without asking.

**Mutations**: Before creating a note, task, skill, or link, the assistant briefly describes what it wants to create and asks for your approval. Once approved, it creates comprehensive entries with proper tags and cross-graph links.

**When to use**: The default choice when you're not sure which style to pick. You get full search capabilities without worrying about unwanted mutations. Good for onboarding and exploration.

## Aggressive

**Behavior**: Captures everything, links everything, builds the richest possible knowledge graph. When in doubt, creates the entry.

**Search**: Searches extensively before every action, querying multiple graphs for complete context. Always checks for duplicates before creating new entries.

**Mutations**: Creates knowledge notes for every decision, discovery, pattern, and observation. Creates tasks for every follow-up item and improvement opportunity. Saves every reusable procedure as a skill. Links every entry to all related entries across graphs.

**When to use**: Knowledge capture sessions, meeting notes, decision records, or sprint retrospectives where thorough documentation is the goal. Also useful for building up a knowledge graph from scratch. Be aware that this style creates many entries.

## Guided

**Behavior**: Explains every step of its Graph Memory usage, teaching you how the system works as it goes.

**Search**: Narrates each search — explains what it's looking for, why, and what it found. Describes cross-graph connections as it discovers them.

**Mutations**: Explains what it's about to create and why before doing it. Shows the exact content of notes, tasks, or skills before creating them. After creating, explains how the new entry connects to the rest of the graph.

**When to use**: Learning how graphmemory works, training team members on the knowledge graph, or whenever you want visibility into the assistant's decision-making process. Produces longer responses but builds understanding of the tool system.
