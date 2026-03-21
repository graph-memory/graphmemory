---
title: "Skills"
sidebar_label: "Skills"
sidebar_position: 6
description: "Skills are reusable recipes and procedures that persist across conversations — step-by-step runbooks your AI assistant can recall and follow."
keywords: [skills, recipes, procedures, runbooks, triggers, recall, steps]
---

# Skills

Skills are **reusable recipes, procedures, and troubleshooting guides** that persist across conversations. They capture step-by-step processes that would otherwise be lost when a conversation ends.

Think of them as runbooks: instead of re-explaining how to add a new API endpoint every time, you save it as a skill once, and any future conversation can recall and follow it.

## Creating a skill

A skill has a title, description, ordered steps, and optional triggers:

```
create_skill({
  title: "Add REST endpoint",
  description: "Steps to add a new REST endpoint to this project",
  steps: [
    "Create route file in src/api/rest/",
    "Add Zod validation schema in validation.ts",
    "Register route in index.ts",
    "Add tests in src/tests/rest-api.test.ts",
    "Update REST API docs"
  ],
  triggers: ["new endpoint", "new API route", "add route"],
  tags: ["api", "rest"]
})
```

## Steps

Steps are an **ordered list of concrete actions**. They tell an AI (or a human) exactly what to do, in what order. Keep each step actionable and specific — "Create route file in src/api/rest/" is better than "Set up the route."

## Triggers

Triggers are phrases or conditions that should activate a skill. They work as **search aliases** — when someone searches for "add route," a skill with that trigger phrase will surface even if those exact words don't appear in its title or description.

```
triggers: ["new endpoint", "add route", "REST API"]
```

Triggers are included in the keyword search index alongside the title and description.

## Recalling skills

Two tools let you find skills:

| Tool | Best for | Default threshold |
|------|----------|-------------------|
| `search_skills` | "Do we have a skill for X?" | 0.5 (precise) |
| `recall_skills` | "What skills might help with this task?" | 0.3 (broad) |

:::tip
Use `recall_skills` at the start of a complex task. The lower threshold casts a wider net, surfacing loosely related skills that might contain useful context.
:::

## Usage tracking

After successfully applying a skill, bump its usage counter:

```
bump_skill_usage({ skillId: "add-rest-endpoint" })
```

This increments `usageCount` and sets `lastUsedAt`. Over time, usage data helps you identify:

- **Frequently used skills** — these are your most valuable runbooks
- **Stale skills** — high count but old last-used date; may need updating
- **Never-used skills** — consider improving their triggers or retiring them

## User skills vs. learned skills

| Source | Created by | Examples |
|--------|-----------|----------|
| `user` | A human, deliberately | "How to deploy to staging," "How to add a DB migration" |
| `learned` | An AI that discovered a pattern | "When tests fail with 'connection refused,' check Docker" |

Learned skills carry a `confidence` score (0 to 1) indicating how reliable they are. User-created skills default to `confidence: 1.0`.

## Skill relationships

Skills can connect to other skills:

| Relation | Meaning |
|----------|---------|
| `depends_on` | This skill requires another skill first |
| `related_to` | These skills cover similar topics |
| `variant_of` | Alternative approach for the same goal |

## Cross-graph links

Skills can link to nodes in any other graph. For example, connecting a skill to the code it operates on:

```
create_skill_link({
  skillId: "add-rest-endpoint",
  targetId: "src/api/rest/index.ts",
  targetGraph: "code",
  kind: "references"
})
```

An AI can follow that link to read the current code before applying the skill's steps. See [Cross-Graph Links](cross-graph-links.md) for details.

## File mirror

Skills are mirrored as markdown files in your project's `.skills/` directory:

```
.skills/add-rest-endpoint/
  skill.md           # the skill as markdown with YAML frontmatter
  diagram.png        # optional attachment
```

These files are version-controlled with git, editable in your IDE, and changes sync back to the graph automatically. You can also store **attachments** (diagrams, templates, reference files) alongside the skill file.

:::info
The file mirror is a secondary representation — the graph is the primary data store. If file mirroring fails, the graph mutation still succeeds.
:::

## Attachments

Any file placed in a skill's mirror directory (next to `skill.md`) is treated as an attachment. Use this for diagrams, templates, example configs, or any supporting material the skill references.

## Configuration

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    graphs:
      skills:
        enabled: true        # enabled by default
        access:
          intern: r          # read-only access for this role
```
