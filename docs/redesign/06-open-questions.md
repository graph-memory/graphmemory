# Open questions

This document collects what is **not** yet decided. Some items are
true unknowns; others are decisions that depend on questions only the
project owner can answer. Each entry says what the question is, why
it matters, and what depends on the answer.

All blocking questions have been answered. Q1 is recorded in
`00-overview.md` (Pace and scope). Q2 is recorded in `00-overview.md`
(Process and contributors). Q3 is recorded in `07-roadmap.md`
(Implementation order). Q4 (LLM provider) and Q5 (agent runtime) are
recorded in `03-bot-runtime.md` (LLM provider and agent runtime).
Q6 (workspaces, projects, ACL model) is recorded in
`04-multi-tenancy.md` (Workspaces, projects, three-layer ACL).

## Important — should be answered soon

### Q7. How is the Git integration in SaaS mode?

**Status: paused mid-discussion 2026-04-08.** The shape is mostly
agreed but several sub-points still need a decision before this can
move into the design docs. When resuming, do not restart from
scratch — pick up from the unresolved items below.

In local mode, git is the user's responsibility — they `git commit`
their `.graphmemory/` directory. In SaaS mode, the server holds the
canonical state, and git is a real integration.

#### Decided so far

- **Two clones, asymmetric.** The server keeps a read-only mirror of
  the project's tracked branch (for human/UI code search and for
  cross-project context). Each runner clones the repo into its own
  workdir to execute jobs on feature branches. The two clones are
  independent and both pull from upstream.
- **Runner-local graphmemory subset.** When a runner picks up a job,
  it spins up a small embedded graphmemory instance (an "agent host")
  on the workdir. That instance has its own ephemeral SQLite, its own
  indexer, and its own MCP server. The agent (Claude Code) sees the
  feature branch through this local MCP — including its own
  uncommitted edits — instead of seeing only the server's
  tracked-branch index.
- **MCP topology for the agent (variant C, tentative).** The agent
  connects to two MCP servers in parallel:
  - **Local MCP (runner-side):** project-scoped tools — `code.*`,
    `files.*`, `docs.*`, backed by the workdir.
  - **Remote MCP (server-side):** workspace/org-scoped tools —
    `tasks.*`, `epics.*`, `notes.*`, `skills.*`, `knowledge.*`,
    `comments.*`, etc.
  Operation-scope (project vs workspace) decides which side hosts a
  tool. This tentatively settles the "split", but needs final
  confirmation when the question resumes.
- **Snapshot transfer at job start.** The server publishes a
  baseline index snapshot of the tracked branch (SQLite + vectors,
  compressed, in blob storage). When a runner starts a job, it
  downloads the snapshot, applies a diff against the feature branch,
  and reindexes only changed files. This avoids cold-start
  reindexing on large repos. Snapshot is invalidated and regenerated
  on tracked-branch updates and on schema version bumps.
- **Server git operations: read-only fetch.** Server only ever does
  `git fetch` + `git checkout origin/<tracked_branch>` on its mirror.
  Branches, commits, push, PR creation — runner only.
- **Credentials: OAuth + SSH; no PAT in the first build.** OAuth for
  GitHub.com and GitLab.com (registered OAuth apps), SSH keys as the
  alternative for runner push. PAT (and self-hosted Gitea/Bitbucket
  support) is deferred entirely.
- **PR creation via host APIs: GitHub + GitLab.** Runner pushes the
  feature branch and then calls the host API to open the PR. PR
  title/body/policy is driven by `AgentRole.prPolicy`. For unknown
  hosts the runner falls back to push-only with a warning in the
  session log.
- **Webhooks in the first build.** GitHub and GitLab webhooks are
  registered through the OAuth installation. Use cases: re-index
  server mirror on push, "PR merged → task done", "review comment →
  resume bot", "PR closed → task action", "branch deleted → workdir
  cleanup". Polling (default 5 minutes, configurable per connection)
  is the fallback when webhooks are missing or lost.

#### Unresolved sub-points

These need answers before Q7 can move into the docs:

1. **Server-side mirror — mandatory or optional per project?**
   Default-on is the simple choice. Optional (`project.server_side_index
   = true | false`) lets security-conscious orgs keep code off the
   server entirely, at the cost of UI code search and snapshot
   transfer for that project. Adds a capability axis. Not decided.
2. **Tracked branch model — single configurable branch (Variant II)
   or something richer?** Variant II is the simple choice: one branch
   per connection, default = repo's `default_branch`, configurable.
   Multi-branch indexing was raised but not committed.
3. **Local DB lifecycle on the runner.** Per-job ephemeral
   (`/var/lib/graphmemory-runner/jobs/<job_id>/index.db`, GC after
   24h) was the leading proposal. Per-(runner × project) persistent
   was raised as an alternative. Snapshot transfer reduces the
   incentive for persistent caches, but the choice is not made.
4. **`apps/agent-host` as a separate composition root**, or fold the
   subset into `apps/runner` directly. Tentatively a separate app,
   but not finalized.
5. **MCP split confirmation (Variant C above).** Tentatively agreed,
   needs final yes.
6. **Tracked branch — change after connection.** Should it be
   editable post-connection (one-row update + full reindex), or
   immutable? Not decided.
7. **Force-reindex API for users** (`POST /projects/:id/reindex`) —
   confirm in scope.

#### What depends on this

- New packages: `git-mirror`, `git-workdir`, `git-host-api`,
  `git-host-github`, `git-host-gitlab`, `index-snapshot`, possibly
  `apps/agent-host`.
- New tables: `project_repo_connections`, `git_credentials`,
  `project_index_snapshots`, webhook secrets table.
- A new capability axis if mirror becomes optional.
- Phase 4 / Phase 5 / Phase 7 in `07-roadmap.md` need updates once
  the unresolved sub-points are settled.

### Q8. What is the scheduler rule format on day one?

The tree planner uses declarative rules. The format of those rules
needs to be decided:

- YAML in a config file?
- TypeScript code that registers rules at startup?
- Stored in the database and edited via UI?

For the MVP, code-based registration is simplest. UI editing is a
later product layer. YAML is somewhere in between.

## Smaller questions that can be deferred

These are real questions, but they are not blocking architecture
work and can be answered when the relevant package is being built.

- How to handle invitation expiration and resend.
- Default password complexity policy.
- Email templates: where to store, how to localize (later).
- API key rotation flow.
- Bot API key rotation flow (separate, because bots cannot click
  email links).
- Default rate limits and how to override them per route.
- Soft delete vs hard delete policy per entity type.
- Pagination strategy for list endpoints (cursor vs offset).
- Backup retention policy in production.
- Sentry sampling rate.
- How to handle clock skew between server and runner.
- What "cancel job" means in flight (graceful vs immediate kill of
  the agent process).
- What happens to in-flight agent sessions when a deploy restarts
  the server.

These are all real and will need answers, but none of them block
the package layout, the capability axes, the multi-tenancy model,
or the bot runtime concept.

## Decisions that have been made (and why they might still come up)

For completeness, a list of things that **have** been decided in the
other documents but might be relisted as questions later if context
shifts. If any of these get reopened, the corresponding document
should be updated and not just the chat:

- Capability-based architecture, not named modes.
- Multi-tenancy via row-level isolation only.
- Postgres in production, SQLite for local and dev.
- One generic runner, capabilities as plugins.
- One bot, one fixed `AgentRole`; AgentRole snapshot in each session.
- Tree-based planner with LLM as an option behind the same
  interface.
- Bot identity is a first-class user with `type=bot`.
- Single MCP server, tool filtering via ACL operation registry.
- Same binary for all deployment scenarios; flags select startup
  composition.
- File mirror is an optional plugin.
- Blob store is a separate package from file mirror.
- `OrgContext` is a mandatory parameter on every store and service
  call.

If you find yourself debating any of these again, check the relevant
document first. If the decision still needs to change, change the
document explicitly so the design history stays coherent.

## What this document is not

- It is not a backlog. Items here are decisions, not tasks.
- It is not a wish list. It captures real ambiguity, not desired
  features.
- It is not exhaustive. New questions will appear as the work
  proceeds; add them here as they come up.

When an item is answered, move it from "Open" to a brief note in the
relevant other document, then delete it from this file. Open
questions should shrink over time, not grow.
