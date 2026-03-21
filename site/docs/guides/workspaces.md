---
title: "Workspaces"
sidebar_label: "Workspaces"
sidebar_position: 3
description: "Group projects into workspaces to share knowledge, tasks, and skills across related codebases."
keywords: [workspaces, shared knowledge, microservices, multi-project, team, cross-project]
---

# Workspaces

Workspaces let you group related projects so they share a single KnowledgeGraph, TaskGraph, and SkillGraph — while each project keeps its own DocGraph, CodeGraph, and FileIndexGraph.

## What Workspaces Solve

When you have related projects (a set of microservices, a frontend and backend, or a monorepo split into packages), knowledge and tasks often span boundaries. A decision about API design affects both the backend and the frontend. A bug fix might require changes across services.

Without workspaces, each project has isolated knowledge and tasks. With workspaces, team notes, tasks, and skills are visible from any project in the group.

## What Is Shared vs. What Stays Separate

| Graph | Shared? | Why |
|-------|---------|-----|
| **DocGraph** | No | Each project has its own markdown docs |
| **CodeGraph** | No | Each project has its own source code |
| **FileIndexGraph** | No | Each project has its own file tree |
| **KnowledgeGraph** | Yes | Decisions and notes apply across projects |
| **TaskGraph** | Yes | Tasks often span multiple services |
| **SkillGraph** | Yes | Procedures work across the group |

## Configuration

Define a workspace in `graph-memory.yaml`:

```yaml
projects:
  api-gateway:
    projectDir: "/home/dev/services/api-gateway"

  catalog-service:
    projectDir: "/home/dev/services/catalog-service"

  order-service:
    projectDir: "/home/dev/services/order-service"

workspaces:
  backend:
    projects: [api-gateway, catalog-service, order-service]
    graphMemory: "/home/dev/data/backend-workspace"
    mirrorDir: "/home/dev/data/backend-workspace"
    author:
      name: "Backend Team"
      email: "backend@company.com"
```

### Required Fields

| Field | Description |
|-------|-------------|
| `projects` | List of project IDs that belong to this workspace |

### Optional Fields

| Field | Default | Description |
|-------|---------|-------------|
| `graphMemory` | `<firstProject>/.graph-memory/workspace` | Directory where shared graph JSON files are stored |
| `mirrorDir` | Same as `graphMemory` | Directory where shared `.notes/`, `.tasks/`, `.skills/` files are written |
| `author` | — | Author metadata for shared notes/tasks/skills |
| `access` | — | Per-user access overrides for workspace graphs |
| `model` | — | Embedding model config for shared graphs |
| `embedding` | — | Embedding config for shared graphs |

## How It Works

When you connect an MCP client to any project in the workspace (e.g., `http://localhost:3000/mcp/api-gateway`), you get:

- **Docs, Code, Files** tools that search only the `api-gateway` project
- **Knowledge, Tasks, Skills** tools that search the shared workspace graphs

Creating a note from the `api-gateway` MCP endpoint puts it in the shared workspace KnowledgeGraph. That same note is visible when connected to `catalog-service` or `order-service`.

## File Mirror

Shared notes, tasks, and skills are mirrored to the `mirrorDir`:

```
/home/dev/data/backend-workspace/
  .notes/
    api-design-decisions/
      note.md
  .tasks/
    implement-rate-limiting/
      task.md
  .skills/
    add-new-service/
      skill.md
  .team/
    alice.md
```

Team members can edit these markdown files directly in their IDE, and changes are imported back into the graph.

## Use Case: Microservices Sharing Team Knowledge

A team running five microservices uses one workspace:

```yaml
workspaces:
  platform:
    projects: [auth, billing, notifications, search, admin]
    graphMemory: "/data/platform"
    mirrorDir: "/data/platform"
```

- Architecture decisions (notes) are shared — "why we use event sourcing" is visible from any service
- Sprint tasks are shared — "implement rate limiting" can reference code in `auth` and docs in `admin`
- Deployment skills are shared — "how to roll back a service" applies to all projects

## Access Control

Workspace-level access can be set independently from project-level access:

```yaml
workspaces:
  backend:
    projects: [api-gateway, catalog-service]
    access:
      alice: rw
      bob: r       # Bob can read shared knowledge but not modify it
```
