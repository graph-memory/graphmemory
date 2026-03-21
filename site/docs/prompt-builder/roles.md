---
title: "Roles"
sidebar_label: "Roles"
sidebar_position: 5
description: "8 assistant roles that shape personality, focus, and tool usage: Developer, Architect, Reviewer, Tech Writer, Team Lead, DevOps, Data Analyst, and Onboarding Buddy."
keywords: [roles, prompt builder, developer, architect, reviewer, tech writer, team lead, devops, data analyst, onboarding buddy]
---

# Roles

Roles define the assistant's personality, focus areas, and tool usage patterns. Each role includes specific instructions about which tools to use at each stage of a workflow — before starting work, while working, and after completing work.

## Developer

**Personality**: A software developer focused on writing, debugging, and understanding code.

**Focus areas**:
- Searches code and documentation before writing to avoid duplicating logic
- Checks for linked tasks and existing skills before starting work
- Captures decisions, workarounds, and gotchas as knowledge notes after changes
- Saves reusable patterns as skills

**When to use**: Day-to-day coding, implementing features, fixing bugs, understanding existing code.

## Architect

**Personality**: A software architect focused on system-level concerns — module boundaries, dependency flow, pattern consistency, and maintainability.

**Focus areas**:
- Maps out module structure and dependency chains across files
- Reviews prior architectural decisions and their rationale
- Records architectural decisions (ADRs) as knowledge notes with full context
- Creates tasks for architectural improvements and saves patterns as skills

**When to use**: Designing new features, evaluating system structure, planning large-scale changes, reviewing module organization.

## Reviewer

**Personality**: A code reviewer focused on correctness, consistency, and completeness of changes against project standards.

**Focus areas**:
- Reads full implementations of functions being modified
- Finds similar patterns elsewhere for consistency checks
- Verifies documentation examples still match after code changes
- Creates notes for non-trivial findings and tasks for follow-up work

**When to use**: Pull request reviews, code audits, verifying changes meet standards.

## Tech Writer

**Personality**: A technical writer focused on accuracy, completeness, and discoverability of documentation.

**Focus areas**:
- Discovers code that lacks documentation
- Audits code examples in docs for correctness
- Understands existing doc structure to avoid duplication
- Tracks documentation gaps as tasks and saves writing guidelines as skills

**When to use**: Writing new documentation, updating existing docs, auditing documentation coverage, standardizing doc formats.

## Team Lead

**Personality**: A team lead focused on work organization, progress tracking, and priority management.

**Focus areas**:
- Reviews work items by status, priority, and assignee
- Breaks down work into trackable tasks with estimates
- Establishes dependencies and blockers between tasks
- Captures planning decisions and saves team processes as skills

**When to use**: Sprint planning, backlog grooming, tracking progress, coordinating work across team members.

## DevOps

**Personality**: A DevOps engineer focused on infrastructure, CI/CD, deployment, and operational reliability.

**Focus areas**:
- Finds configuration files — Dockerfiles, CI configs, environment files
- Maps project infrastructure layout and deployment artifacts
- Checks for existing deployment procedures and incident response playbooks
- Documents infrastructure decisions and deployment procedures

**When to use**: Setting up CI/CD, debugging deployment issues, managing infrastructure, documenting operational procedures.

## Data Analyst

**Personality**: A data analyst focused on mining patterns, finding connections, and extracting insights from project knowledge.

**Focus areas**:
- Surveys accumulated knowledge — decisions, issues, learnings
- Traces relationship networks between concepts across graphs
- Analyzes work patterns — common blockers, completion rates, priority distributions
- Captures analytical findings with supporting evidence

**When to use**: Identifying trends in project history, analyzing which code areas generate the most issues, finding knowledge gaps, creating project health reports.

## Onboarding Buddy

**Personality**: A friendly guide helping someone understand the project for the first time, explaining concepts clearly and building a mental model step by step.

**Focus areas**:
- Walks through documentation in a logical order
- Shows code examples alongside their documentation context
- Surfaces established procedures that newcomers should learn
- Captures new discoveries to help future newcomers

**When to use**: Onboarding new team members, guided codebase tours, teaching project conventions, answering "how does this work?" questions.
