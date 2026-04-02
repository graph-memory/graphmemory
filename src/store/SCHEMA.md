# Database Schema

SQLite database with FTS5 full-text search and sqlite-vec vector similarity.
Schema defined in `sqlite/migrations/v001.ts`. Embedding dimensions are per-graph
configurable via `StoreOptions.embeddingDims` (default: **384**).

## Tables Overview

| Table | Scope | Purpose |
|-------|-------|---------|
| `meta` | workspace | Key-value store (namespaced by prefix) |
| `projects` | workspace | Project records |
| `team_members` | workspace | Team member records |
| `tags` | project | Tag entities (linked via edges) |
| `attachments` | project | File attachment metadata |
| `edges` | project | Unified cross-graph relationships |
| `knowledge` | project | Notes / knowledge base |
| `tasks` | project | Task management |
| `epics` | project | Epic grouping for tasks |
| `skills` | project | Reusable skill/pattern records |
| `code` | project | Code symbols + file nodes |
| `docs` | project | Doc chunks + file nodes |
| `files` | project | File index + directory tree |

## Workspace Tables

### meta

```sql
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Shared key-value store. Keys are namespaced: `"{projectId}:{graph}:{key}"` for
project-scoped meta, or plain `"{key}"` for workspace-level.

### projects

```sql
CREATE TABLE projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  directory  TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### team_members

```sql
CREATE TABLE team_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  email      TEXT,
  role       TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Shared Tables

### tags

```sql
CREATE TABLE tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  UNIQUE(project_id, name)
);
```

Tags are linked to entities via edges (`from_graph='tags'`, `kind='tagged'`).
Orphaned tags (no remaining edges) are cleaned up by `EntityHelpers.setTags()`.

### attachments

```sql
CREATE TABLE attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  graph      TEXT NOT NULL,          -- target graph name
  entity_id  INTEGER NOT NULL,       -- target entity id
  filename   TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  size       INTEGER NOT NULL,
  url        TEXT,
  added_at   INTEGER NOT NULL,
  UNIQUE(project_id, graph, entity_id, filename)
);
```

### edges

```sql
CREATE TABLE edges (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_graph TEXT NOT NULL,          -- source graph name
  from_id    INTEGER NOT NULL,       -- source entity id
  to_graph   TEXT NOT NULL,          -- target graph name
  to_id      INTEGER NOT NULL,       -- target entity id
  kind       TEXT NOT NULL,          -- relationship type
  PRIMARY KEY (project_id, from_graph, from_id, to_graph, to_id, kind)
);
```

**Edge kinds by graph:**

| from_graph | to_graph | kind | Meaning |
|------------|----------|------|---------|
| `tags` | any | `tagged` | Tag → entity |
| `epics` | `tasks` | `belongs_to` | Epic → task link |
| `code` | `code` | `contains` | File → symbol |
| `code` | `code` | `calls`, `extends`, `implements` | Cross-reference |
| `docs` | `docs` | `contains` | File → chunk |
| `docs` | `docs` | `references` | Doc → doc link |
| any | any | user-defined | Custom cross-graph links |

## Knowledge

```sql
CREATE TABLE knowledge (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  version       INTEGER NOT NULL DEFAULT 1,
  created_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  updated_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(project_id, slug)
);
```

FTS: `knowledge_fts` on (title, content).
Vec: `knowledge_vec` — configurable dim embedding.
Cleanup trigger: cascades to edges, attachments, vec0.

## Tasks

```sql
CREATE TABLE tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'backlog'
                CHECK(status IN ('backlog','todo','in_progress','review','done','cancelled')),
  priority      TEXT NOT NULL DEFAULT 'medium'
                CHECK(priority IN ('critical','high','medium','low')),
  "order"       REAL NOT NULL DEFAULT 0,
  due_date      INTEGER,
  estimate      INTEGER,
  completed_at  INTEGER,
  assignee_id   INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  updated_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(project_id, slug)
);
```

FTS: `tasks_fts` on (title, description).
Vec: `tasks_vec` — configurable dim embedding.

## Epics

```sql
CREATE TABLE epics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK(status IN ('open','in_progress','done','cancelled')),
  priority      TEXT NOT NULL DEFAULT 'medium'
                CHECK(priority IN ('critical','high','medium','low')),
  "order"       REAL NOT NULL DEFAULT 0,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  updated_by_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(project_id, slug)
);
```

FTS: `epics_fts` on (title, description).
Vec: `epics_vec` — configurable dim embedding.
Progress computed on-the-fly from linked tasks (via edges).

## Skills

```sql
CREATE TABLE skills (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug               TEXT NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  steps_json         TEXT NOT NULL DEFAULT '[]',
  triggers_json      TEXT NOT NULL DEFAULT '[]',
  input_hints_json   TEXT NOT NULL DEFAULT '[]',
  file_patterns_json TEXT NOT NULL DEFAULT '[]',
  source             TEXT NOT NULL DEFAULT 'user'
                     CHECK(source IN ('user','learned')),
  confidence         REAL NOT NULL DEFAULT 1.0
                     CHECK(confidence >= 0.0 AND confidence <= 1.0),
  usage_count        INTEGER NOT NULL DEFAULT 0,
  last_used_at       INTEGER,
  version            INTEGER NOT NULL DEFAULT 1,
  created_by_id      INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  updated_by_id      INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE(project_id, slug)
);
```

FTS: `skills_fts` on (title, description).
Vec: `skills_vec` — configurable dim embedding.
JSON arrays stored as TEXT columns, parsed with `safeJson()`.

## Code

```sql
CREATE TABLE code (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,         -- 'file', 'function', 'class', etc.
  file_id       TEXT NOT NULL,         -- relative file path
  language      TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  signature     TEXT NOT NULL DEFAULT '',
  doc_comment   TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  start_line    INTEGER NOT NULL DEFAULT 0,
  end_line      INTEGER NOT NULL DEFAULT 0,
  is_exported   INTEGER NOT NULL DEFAULT 0,
  mtime         INTEGER NOT NULL DEFAULT 0
);
```

FTS: `code_fts` on (name, signature, doc_comment).
Vec: `code_vec` — configurable dim embedding.

Single table for both file nodes (`kind='file'`) and symbol nodes. Linked via
edges: file → symbols (`contains`), symbols → symbols (`calls`, `extends`, etc.).

## Docs

```sql
CREATE TABLE docs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'chunk',  -- 'file' or 'chunk'
  file_id       TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',
  level         INTEGER NOT NULL DEFAULT 0,     -- heading level
  language      TEXT,                            -- code block language
  symbols_json  TEXT NOT NULL DEFAULT '[]',      -- referenced identifiers
  mtime         INTEGER NOT NULL DEFAULT 0
);
```

FTS: `docs_fts` on (title, content).
Vec: `docs_vec` — configurable dim embedding.

Single table for file nodes and content chunks. Linked via edges:
file → chunks (`contains`), file → file (`references`).

## Files

```sql
CREATE TABLE files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'file',  -- 'file' or 'directory'
  file_path   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  directory   TEXT NOT NULL,
  extension   TEXT NOT NULL DEFAULT '',
  language    TEXT,
  mime_type   TEXT,
  size        INTEGER NOT NULL DEFAULT 0,
  mtime       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, file_path)
);
```

Vec: `files_vec` — configurable dim embedding.
No FTS (search uses LIKE on file_path + vector similarity).

Directory nodes auto-created by `ensureDirectory()`, auto-cleaned by
`cleanEmptyDirs()` on file removal.

## Indexes

```sql
-- Tags
idx_tags_project            (project_id)

-- Attachments
idx_attachments_project     (project_id)
idx_attachments_entity      (project_id, graph, entity_id)

-- Edges
idx_edges_target            (project_id, to_graph, to_id)
idx_edges_source            (project_id, from_graph, from_id)

-- Knowledge
idx_knowledge_project       (project_id)
idx_knowledge_updated       (project_id, updated_at)

-- Tasks
idx_tasks_project           (project_id)
idx_tasks_status            (project_id, status, "order")
idx_tasks_assignee          (assignee_id)
idx_tasks_updated           (project_id, updated_at)

-- Epics
idx_epics_project           (project_id)
idx_epics_updated           (project_id, updated_at)

-- Skills
idx_skills_project          (project_id)
idx_skills_updated          (project_id, updated_at)

-- Code
idx_code_project            (project_id)
idx_code_file               (project_id, file_id)
idx_code_name               (name)
idx_code_kind               (project_id, kind)

-- Docs
idx_docs_project            (project_id)
idx_docs_file               (project_id, file_id)
idx_docs_kind               (project_id, kind)

-- Files
idx_files_project           (project_id)
idx_files_dir               (project_id, directory)
idx_files_kind              (project_id, kind)
```

## Triggers

Each graph table has 4 triggers:

| Trigger | Event | Action |
|---------|-------|--------|
| `{table}_ai` | AFTER INSERT | Sync FTS5 |
| `{table}_ad` | AFTER DELETE | Sync FTS5 |
| `{table}_au` | AFTER UPDATE | Sync FTS5 (delete old + insert new) |
| `{table}_cleanup` | AFTER DELETE | Cascade to edges, attachments, vec0 |

Additional: `tags_cleanup` — on tag DELETE, removes associated edges.

## Timestamps

All timestamps are millisecond Unix epoch (`unixepoch('now','subsec') * 1000`),
stored as INTEGER. Generated by `now()` utility in application code.
