# Bot runtime

This document captures the design of the bot subsystem: how bots are
modeled, how they relate to runners and agent roles, how the planner
and orchestrator drive work through Kanban-style task transitions, and
how agent sessions are persisted and resumed.

> **Naming.** This document uses **`AgentRole`** for the bot-behavior
> configuration (system prompt, tool allowlist, git policy, limits).
> The word "role" alone always means `AgentRole` in this document.
> ACL roles — `OrgRole`, `WorkspaceRole`, `ProjectRole` — are a
> different concept and are described in
> [04-multi-tenancy.md](04-multi-tenancy.md).

The runtime is built around one central insight: **a bot is a user with
a special identity type, not a background job**. Everything else falls
out of that.

## Core concepts

### Bot

A **bot** is a user record with `type = bot`. It has:

- A stable identity (`user_id`, with `type = bot`).
- A name and avatar.
- API keys.
- An `org_membership` in its home organization, plus
  `workspace_grants` and `project_grants` for the workspaces and
  projects it is allowed to act in (see
  [04-multi-tenancy.md](04-multi-tenancy.md)).
- An assigned **`AgentRole`** (one per bot, fixed at creation).

Bots are first-class participants. They can be assignees on tasks. They
can write comments. They can change task status. They appear in audit
logs and timelines indistinguishably from humans (except for a visual
type marker in the UI).

Bots are created **explicitly** by an administrator:

- In local mode: declared in the YAML config at startup.
- In SaaS mode: created through the admin UI by an org owner.

Bots are not created automatically by the planner.

### AgentRole

An **`AgentRole`** is a configuration of behavior, decoupled from
identity. AgentRoles describe **how** work is performed, not **who**
performs it. They are not ACL roles.

An AgentRole contains:

- Identity metadata (`name`, `description`, `version`).
- LLM settings (`provider`, `model`, `temperature`, `maxTokens`).
- Prompt configuration (`systemPrompt`, `contextStrategy`).
- Tool access (`allowed`, `denied` — references to operations in the
  ACL operation registry).
- Git policy (`branchPattern`, `pushPolicy`, `prPolicy`).
- Limits (`maxDuration`, `maxCost`, `maxToolCalls`).
- Required capabilities (`git`, `shell`, `claude-code`, ...).

AgentRoles are stored as entities in the system. They can be created
and edited (in SaaS mode) through the UI; in local mode they live in
YAML files.

An AgentRole can be reused by many bots, but each bot is bound to
exactly one AgentRole. Changing the AgentRole on a bot is not
supported. Create a new bot if you need different behavior.

#### AgentRole versioning via session snapshots

AgentRoles are mutable. When an AgentRole is edited, future sessions
of bots that reference it use the new configuration. This is
convenient and avoids a version graph.

To preserve reproducibility, **every agent session captures a snapshot
of the AgentRole at the moment it was launched**: the system prompt,
allowed tools, git policy, limits. The session knows exactly which
AgentRole configuration it ran under, even if the AgentRole changes
afterward.

This gives us mutability without losing the ability to inspect and
reproduce past runs.

### Runner

A **runner** is an executor process. It registers itself against the
server with a scope (`global`, `workspace`, or `project`) and a set of
declared capabilities. It claims jobs from the queue, executes them,
and reports results back.

A runner is **generic**. There is one type of runner binary. All
behavior differences come from the AgentRole attached to the job, not
from runner specialization. Capabilities are extensions: a runner declares
`["git", "shell", "claude-code"]`, and the orchestrator only assigns
jobs that require capabilities the runner has.

A runner has **no identity of its own** in the application sense. It
authenticates as a service to the server, but when it acts on behalf
of a bot, it uses that bot's credentials. All side effects on data —
comments, status changes, file writes via tools — are recorded as the
bot, never as the runner.

In local mode, the runner is in-process: the server hosts a single
runner inside its own process. In SaaS mode, runners are external
processes (the `apps/runner` binary) that connect over the network.

### AgentRole + bot + runner: three orthogonal axes

This is the central design choice. Most agentic systems collapse two
or three of these into one concept and pay for it later.

- **Bot** answers "**who** is acting" — identity, ACL, audit, comment
  authorship.
- **AgentRole** answers "**how** they act" — prompts, allowed tools,
  git policy, limits.
- **Runner** answers "**where** the action happens" — process,
  capabilities, machine.

A single bot is bound to a single AgentRole. An AgentRole can be
applied by any runner that has the required capabilities. A runner can
serve many bots over its lifetime. The matrix is genuinely 3D, not a
flat "one bot = one function".

### Job

A **job** is the unit of work for a runner. It contains:

- The task ID it operates on.
- The bot that owns the work.
- The AgentRole snapshot to apply.
- A description of the operation (e.g., "execute task" / "resume after
  comment").
- Required capabilities.
- State machine: `queued`, `claimed`, `running`, `succeeded`, `failed`,
  `cancelled`.
- A lease/heartbeat field so dead runners release their jobs.

Jobs are persisted in the storage layer (one table). The queue is
backed by SQL — no separate broker (Redis, NATS) on the MVP.

### Agent session

An **agent session** is the record of one LLM run for one job. It
contains:

- The bot, AgentRole snapshot, job, task it relates to.
- Status (`running`, `completed`, `aborted`, `failed`).
- A list of `agent_messages` (system, user, assistant, tool_call,
  tool_result), each with timing and token counts.
- Optional `parent_session_id` for resume chains.
- An optional `summary` of prior history if compaction was applied.

Sessions are append-only after creation. They live in `log-store`,
not `store`, because of their volume and access pattern.

## The Kanban flow

The bot runtime treats the existing task Kanban states (`todo`,
`in_progress`, `review`, `done`) as the **driver of automation**. The
planner watches state changes and decides what should happen next.

A typical happy path:

1. A human creates a task in `todo`.
2. The **planner** notices the new task. Based on rules (tags, project,
   defaults), it decides which bot should be the assignee. It moves the
   task to `in_progress` with the bot as assignee.
3. The **orchestrator** sees the new state and creates a job for the
   appropriate runner: "execute task X under AgentRole Y on behalf of
   bot B".
4. A matching **runner** claims the job.
5. The runner builds the **initial context** for the agent: task ID,
   AgentRole snapshot, MCP credentials minted for the bot, working
   branch.
6. The runner launches the **agent** (Claude Code or another LLM
   driver). The agent uses MCP to fetch what it needs (comments,
   relevant code, related tasks, skills). Its actions on system data
   are authorized as the bot via the same MCP server that external
   clients use.
7. As the agent works, the runner streams session events (messages,
   tool calls) into the system as part of the task's unified timeline.
8. When the agent finishes, the runner — **not** the agent — performs
   any AgentRole-mandated git operations (branch, push, open PR). The
   decision of whether to push is fixed by the AgentRole, not by the
   LLM.
9. The runner moves the task to `review` (if the AgentRole says so)
   and reports the job as succeeded.
10. A human reviewer comments. If they approve, they move to `done`.
11. If they leave change-request comments, the planner sees the new
    activity and creates a follow-up job: "resume work on task X with
    new comments". The runner resumes the agent with prior session
    history (compacted if necessary).

The flow is fully driven by task state and event reactions. There is
no special "bot orchestration language" the user has to learn — they
work with their tasks normally, and the planner reacts.

## AgentRoles in the data flow

```
task state changes
        |
        v
  store emits event
        |
        v
   scheduler decides
        |
   intent: "create job"
        |
        v
   orchestrator
        |
        v
   jobs-queue (DB)
        |
        v
   runner claims (lease)
        |
        v
   runner-host: prepare context
        |
        v
   agent-runtime: launch LLM
        |
        v
   agent acts via MCP as bot
        |
        v
   session events flow back
        |
        v
   store + log-store updated
        |
        v
   UI updates via realtime
```

Every step is observable. Every action is attributed to either the
bot or the runner identity. There is no hidden side channel.

## Resolved design forks

Eight design questions came up while working through this. All have
been decided.

### Fork 1 — Tree-based or LLM-based planner?

**Decision:** both implementations are built behind the same interface.
Tree-based is the predictable default; LLM-based is available for
decisions that rules cannot express cleanly.

- The planner has a stable contract: `PlannerInput → PlannerIntent[]`.
- Tree-based implementation reads declarative rules (when state X and
  tag Y, produce intent Z). It is the foundation: predictable,
  debuggable, cheap, easy to test.
- LLM-based implementation is a second implementation of the same
  interface. The orchestrator and downstream do not know which one
  produced an intent.
- Both modes coexist in a running system. Configuration decides per
  rule (or per project) which implementation handles which decisions.
  Tree rules dominate; LLM is invoked where rules are insufficient.
- Building both from day one means the interface is validated by two
  real implementations, not designed against one and bent for the
  second later.

Rationale: tree rules are the load-bearing baseline; LLM expands what
the planner can express. Having both forces the contract to be
genuinely implementation-neutral.

### Fork 2 — One bot, one AgentRole, or many?

**Decision:** one bot is bound to one AgentRole, fixed at creation. To
behave differently, create a new bot.

- Every comment, every action, every audit entry has a clear "who
  did it and in what mode".
- AgentRoles are mutable, but each session captures a snapshot of the
  AgentRole for reproducibility.
- Different "personalities" are different bots: `bot-fixer`,
  `bot-reviewer`, `bot-architect`, etc.

Rationale: a bot whose AgentRole can change in flight has fuzzy
identity. Audit and UI become confusing. Cost of "more bots" is
negligible.

### Fork 3 — Generic runner or specialized runners?

**Decision:** one generic runner. All differences come from AgentRoles
and declared capabilities.

- Runners declare which capabilities they have (`git`, `shell`,
  `claude-code`, ...). The orchestrator matches jobs to runners by
  capability set.
- Capabilities are a plugin architecture: add a new capability →
  runners that declare it can run more job types.
- One binary, one ops surface, one set of logs.

Rationale: a zoo of runner types becomes unmanageable. One binary
with capability declarations covers the same flexibility with much
less complexity.

### Fork 4 — Who builds the agent's context?

**Decision:** the runner builds a minimal initial context. The agent
fetches everything else through MCP.

- Runner provides: task ID, system prompt from AgentRole, MCP
  credentials bound to the bot, working branch.
- Agent uses MCP tools to fetch comments, related tasks, code search
  results, skills, file contents, documentation — on demand.
- The agent acts as a first-class MCP client of its own host system.

Rationale: this turns the agent into an active participant in the
system rather than a passive recipient of a pre-built brief.
Improvements to MCP tooling automatically make agents smarter. The
"what to include in context" question moves out of the runner and into
the system prompt.

### Fork 5 — Sessions as a separate entity or part of task?

**Decision:** separate tables under the hood, unified timeline in the
API and UI.

- Tables: `task_comments`, `agent_sessions`, `agent_messages`,
  `task_events`. Each has its own access pattern and indexes.
- API: `GET /tasks/:id/timeline` returns a single time-ordered feed
  with typed entries (comment, agent_message, status_change,
  attachment, ...).
- UI: renders the feed as a single conversation, with tool calls
  collapsed by default and expandable on click.

Rationale: humans see "one stream of activity" on a task. The system
gets efficient storage and queries. Agent messages can grow huge
without slowing down comment lookups.

### Fork 6 — Resume large sessions: copy or compact?

**Decision:** compact when the prior session exceeds a threshold;
always retain the original history.

- Compaction is a separate, cheap LLM call before the main session
  starts. It produces a structured summary: what was done, what
  remains, open questions, recent human comments.
- The new session receives the summary plus the most recent N
  messages in full.
- The original messages stay in `log-store` for inspection and
  manual review. They are never deleted by compaction.
- The threshold is per-AgentRole configurable, with a sensible global
  default.

Rationale: this matches how long-context LLMs are actually used in
production. It avoids the "infinite history" trap and the "lost
context" trap simultaneously.

### Fork 7 — Where does the planner run?

**Decision:** in the same binary as the server, with a startup flag
that selects which subsystems to enable.

- The codebase is one binary. Modes of execution are flags:
  `--mode all`, `--mode api`, `--mode planner`, etc.
- In local mode, everything runs in one process.
- In SaaS mode, planner can run as a dedicated process on a separate
  machine, while API serves requests.
- The planner talks to the rest of the system through the same
  `services` layer (or via API if remote), not through direct store
  access.

Rationale: composition flexibility without code duplication. Same
artifact runs everywhere; only the launch flags differ.

### Fork 8 — Agent MCP and external MCP: same or different?

**Decision:** same MCP server, same set of tools. The AgentRole
configures which tools each bot can call.

- There is one MCP server, exposed by `api-mcp`.
- Bots connect to it as users with the bot's API key.
- Tool filtering happens through the **operation registry** in `acl`:
  every use case is a registered operation, the AgentRole specifies
  which operations the bot may call, and the MCP server filters its
  advertised tool list per connection.
- A bot only sees the tools it has permission to use.

Rationale: this makes MCP first-class infrastructure, not a side
channel. Improvements to MCP benefit both external clients and
internal agents. Filtering is just ACL, not a separate mechanism.

## Tools, the operation registry, and ACL

This deserves its own emphasis because it is the cleanest part of the
design.

Every use case in `services` is registered under a stable name in an
**operation registry**:

```
tasks.create
tasks.update
tasks.delete
tasks.addComment
tasks.updateStatus
search.code
search.docs
skills.recall
files.read
...
```

ACL grants users (humans and bots alike) permission to specific
operations. REST routes, MCP tools, and chat tool exports are all
generated by enumerating the registry and filtering by the caller's
permissions.

This means:

- One source of truth for "what operations exist".
- Adding a new operation is one new function in `services` plus a
  registration call. It automatically becomes available in REST, MCP,
  and chat (subject to ACL).
- Tool filtering for bots is **not a separate feature** — it's the
  same ACL mechanism that controls all access to the system.
- Audit logs reference operation names, so "who did what" is
  consistent across all surfaces.

## LLM provider and agent runtime

These are the two concrete choices behind the abstract `llm-client`
and `agent-runtime` packages. Both are decisions for the **first**
implementation; the abstractions allow more later without rewriting
consumers.

### LLM provider — Anthropic only

The `llm-client` package has exactly one implementation in the first
build: **Anthropic Claude** (via the official `@anthropic-ai/sdk`).

- One provider keeps prompt formats, tool-use conventions, and cost
  modeling consistent.
- The interface in `llm-client` is provider-neutral so a second
  implementation (OpenAI, Google, others) can be added later as a
  new package without touching `chat`, `agent-runtime`, or any use
  case.
- Multi-provider support is in Non-goals for now (see
  `00-overview.md`). Adding a second provider is a deliberate future
  decision, not a default expectation.

### Agent runtime — Claude Code as a subprocess

The `agent-runtime` package launches an LLM agent for each job. The
first (and only) implementation in the first build is
**Claude Code as a subprocess**, configured per-AgentRole.

- Claude Code already includes a mature tool loop, MCP client,
  permission system, and session capture. Reusing it avoids
  re-implementing all of that.
- The runner launches `claude-code` with the AgentRole's system
  prompt, the bot's MCP credentials (so all tool calls flow through
  `api-mcp` as the bot identity), the working directory, and the
  AgentRole-derived permission profile.
- Session events (messages, tool calls, tool results) are streamed
  from the subprocess and persisted via `services` into `log-store`,
  forming the unified task timeline.
- A custom agent loop on top of `llm-client` remains a possible
  future second implementation behind the same `agent-runtime`
  interface — but it is not built now. The interface is shaped so
  that swap is possible without touching the runner-host or
  scheduler.

This pairing (Anthropic provider + Claude Code subprocess) is
internally consistent: Claude Code already speaks to Anthropic. There
is no impedance mismatch on the first build.

## Local-mode declarations

In local mode, bots and AgentRoles are declared in YAML at startup:

```yaml
bots:
  - name: claude-fixer
    agent_role: bug-fixer
    api_key_env: BOT_FIXER_KEY
    scope: { workspace: my-workspace, project: my-project }

  - name: claude-reviewer
    agent_role: code-reviewer
    api_key_env: BOT_REVIEWER_KEY
    scope: { workspace: my-workspace, project: my-project }
```

AgentRoles are loaded from files in `.graphmemory/agent-roles/`:

```
.graphmemory/
  agent-roles/
    bug-fixer.yaml
    code-reviewer.yaml
```

On startup, the server upserts bots and AgentRoles from this
configuration into the store. The configuration is the source of truth
in local mode; the database is a cache.

In SaaS mode, the database is the source of truth. Bots and AgentRoles
are created and edited via the UI. The YAML config does not declare
them.

## What is deferred for the MVP

These are sensible extensions that are explicitly out of scope for the
first version of the bot runtime, even though the architecture
supports them:

- **Multi-runner job dispatch policies.** First-claim-wins is enough.
  Load-balancing, specialization-matching, cost-aware dispatch — later.
- **Session branching.** Resume creates a new session linked to its
  parent. Tree-of-versions is not supported initially.
- **Cross-bot collaboration on a single task.** A task has one
  assignee at a time. Hand-offs happen via planner-driven
  reassignment, not via concurrent collaboration.
- **Bot-to-bot scheduling.** Bots cannot delegate to other bots
  directly. The planner is the only entity that creates work.
- **Workflow editor / automation builder UI.** Rules live in YAML or
  in code on the MVP. A visual editor is a later product layer.

## Risks and mitigations

A few risks are worth spelling out so future work treats them as
real:

### Prompt injection and bot privilege escalation

LLMs reading task content, code, and comments are exposed to prompt
injection. If bots have broad ACL, an injected prompt could cause real
damage.

Mitigations:

- **Minimal permissions per AgentRole.** A `bot-fixer` cannot delete
  tasks. A `bot-reviewer` cannot push to main. AgentRoles are tight by
  default.
- **Operation allowlist.** AgentRoles list operations they can call.
  Any attempt to call an unlisted operation is rejected by ACL.
- **Mandatory audit log.** Every bot action is logged with the
  operation name, the bot identity, and the input payload.
- **Rate limiting on bot actions.** A loop spamming comments is
  stopped automatically.

### Long-running sessions and lost work

A runner crash mid-job leaves the job in `claimed` state. Without a
recovery mechanism, jobs hang.

Mitigations:

- **Lease + heartbeat.** Runners send periodic heartbeats. If a
  heartbeat is missed beyond a TTL, the job returns to `queued` and
  is reclaimed by another runner.
- **Idempotent execution.** Jobs are designed to be safely retried.
  Side effects produced before the crash are visible in the session
  log; the new run can decide whether to redo or continue.

### Diverging system state during long resumes

The agent's view of the system from before a pause may not match the
current state when it resumes. Files have changed; comments have been
added.

Mitigations:

- **Resume always re-fetches state via MCP.** The compacted summary
  describes what *was*, but the agent must use MCP to learn what
  *is* before acting.
- **Resume system prompt explicitly tells the agent** to verify
  assumptions before continuing.

### Identifying who broke what after the fact

If a bot makes changes that turn out to be wrong, the human needs to
trace the changes back to the session and the AgentRole.

Mitigations:

- **Commit messages reference the task ID and session ID.** The
  AgentRole enforces this format.
- **Audit log links session → task → operations performed.** A single
  query reveals the full chain.
- **Sessions are immutable after completion.** Tampering with history
  would itself be an auditable event.

## Summary

The bot runtime is a Kanban execution engine where humans and bots
share the same task model, the same identity model, and the same
authorization model. The differences are surface — bots have a marker,
they are created differently, they execute through runners — but the
substance is identical to how humans interact with the system.

This is what makes the design coherent. There is no second machine
hiding behind the first. The same store, the same services, the same
ACL, the same MCP. Bots are just users that happen to be processes.
