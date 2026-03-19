# Team Management

**File**: `src/lib/team.ts`

## Overview

Team members are stored as markdown files in the `.team/` directory. They are used primarily for task assignment.

## Directory structure

```
{projectDir}/.team/
  alice.md
  bob.md
  charlie.md
```

For workspace projects, the team directory is in the workspace `mirrorDir`:
```
{mirrorDir}/.team/
```

## File format

Each team member is a `{id}.md` file with YAML frontmatter:

```markdown
---
name: Alice
email: alice@example.com
---
# Alice
```

The file name (without `.md`) is the member ID.

## Functions

| Function | Description |
|----------|-------------|
| `scanTeamDir(teamDir)` | Scan `.team/` directory → `TeamMember[]` |
| `ensureAuthorInTeam(teamDir, author)` | Auto-create team member file for configured author if missing |

### TeamMember type

```typescript
interface TeamMember {
  id: string;      // filename without .md
  name: string;    // from frontmatter
  email: string;   // from frontmatter
}
```

## Auto-creation

When an `author` is configured in `graph-memory.yaml`, `ensureAuthorInTeam()` automatically creates a team member file for that author on first mutation (note/task/skill create/update). This ensures the author always appears in the team list.

## Task assignment

Tasks have an `assignee` field (string or null) that references a team member ID:

```yaml
# In task mirror file (.tasks/{id}/task.md):
---
assignee: alice
---
```

The assignee is displayed in:
- **MCP tools**: `create_task`, `update_task`, `list_tasks`, `get_task`
- **REST API**: all task endpoints
- **Web UI**: kanban board cards, task detail, filter bar

## REST API endpoint

```
GET /api/projects/:id/team → [{ id, name, email }]
```

Returns the list of team members from the `.team/` directory. Access-controlled by project-level permissions.

## Relationship to users

Team members (`.team/`) and config users (`users:` in YAML) are **separate concepts**:

| Concept | Purpose | Storage |
|---------|---------|---------|
| **Users** | Authentication + ACL | `graph-memory.yaml` |
| **Team members** | Task assignment + display names | `.team/*.md` files |

A person can be both a user (for login) and a team member (for task assignment), but the two are not automatically linked.
