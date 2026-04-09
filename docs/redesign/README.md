# Redesign

Conceptual design for the next iteration of the system. No code has
been written yet — this directory captures decisions made during
planning so they survive outside chat history.

## Read order

1. [00-overview.md](00-overview.md) — why we are doing this, goals,
   non-goals, deployment scenarios.
2. [01-capabilities.md](01-capabilities.md) — capability axes, why
   not named modes, valid combinations, example configs.
3. [02-packages.md](02-packages.md) — monorepo layout, package
   responsibilities, dependency direction, build order.
4. [03-bot-runtime.md](03-bot-runtime.md) — bots, `AgentRole`s,
   runners, scheduler, orchestrator, agent sessions, resolved design
   forks.
5. [04-multi-tenancy.md](04-multi-tenancy.md) — `OrgContext`,
   workspaces, projects, three-layer ACL
   (`OrgRole`/`WorkspaceRole`/`ProjectRole`), row-level isolation,
   MVP scope and explicit deferrals.
6. [05-storage.md](05-storage.md) — storage abstraction, SQLite vs
   Postgres, blob store, file mirror as an optional plugin.
7. [06-open-questions.md](06-open-questions.md) — what is not yet
   decided.
8. [07-roadmap.md](07-roadmap.md) — implementation phases and the
   cross-phase rules they all obey.

## Status

- All structural decisions are agreed at the conceptual level.
- The current `src/` is unchanged.
- All blocking questions (Q1–Q3) have been answered. Q4–Q8 in
  [06-open-questions.md](06-open-questions.md) are non-blocking and
  can be answered as the relevant phases approach.
- The implementation order is in [07-roadmap.md](07-roadmap.md).

## How to update these docs

- When a decision changes, edit the relevant document. Do not leave
  contradictions in place expecting the chat to remember.
- When an open question is answered, move the answer into the
  relevant document and remove it from
  [06-open-questions.md](06-open-questions.md).
- New questions go into [06-open-questions.md](06-open-questions.md)
  as they come up.
- These documents are design notes, not specifications. Code does
  not exist yet, and exact API shapes are intentionally absent.
