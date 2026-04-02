# Store Module

Multi-graph storage layer built on SQLite. Manages 8 graph types with hybrid search
(FTS5 + sqlite-vec), unified cross-graph edges, and optimistic locking.

## Stack

- **better-sqlite3** — synchronous SQLite bindings
- **sqlite-vec v0.1.9** — vector similarity search (per-graph configurable dimensions, default 384)
- **FTS5** — full-text search

## Architecture

```
Store (workspace)
├── projects    — ProjectsStore
├── team        — TeamStore
├── edges       — EdgeHelper (cross-graph)
├── meta        — MetaHelper (key-value)
├── transaction — SQLite BEGIN/COMMIT/ROLLBACK
└── project(id) → ProjectScopedStore
    ├── code        — CodeStore (indexed)
    ├── docs        — DocsStore (indexed)
    ├── files       — FilesStore (indexed)
    ├── knowledge   — KnowledgeStore (user-managed)
    ├── tasks       — TasksStore (user-managed)
    ├── epics       — EpicsStore (user-managed)
    ├── skills      — SkillsStore (user-managed)
    └── attachments — AttachmentsStore
```

**Indexed stores** (code, docs, files) — populated by indexers, bulk upsert by file.
**User-managed stores** (knowledge, tasks, epics, skills) — CRUD with slugs, versions,
tags, attachments, optimistic locking.

## Directory Structure

```
src/store/
├── index.ts                  # Module exports
├── types/
│   ├── index.ts              # Type re-exports
│   ├── store.ts              # Store, ProjectScopedStore interfaces
│   ├── common.ts             # SearchQuery, Edge, GraphName, VersionConflictError
│   ├── code.ts               # CodeStore, CodeNode, CodeFileEntry
│   ├── docs.ts               # DocsStore, DocNode, DocFileEntry
│   ├── files.ts              # FilesStore, FileNode
│   ├── knowledge.ts          # KnowledgeStore, NoteRecord, NoteDetail
│   ├── tasks.ts              # TasksStore, TaskRecord, TaskDetail
│   ├── epics.ts              # EpicsStore, EpicRecord, EpicDetail
│   ├── skills.ts             # SkillsStore, SkillRecord, SkillDetail
│   ├── attachments.ts        # AttachmentsStore, AttachmentMeta
│   ├── projects.ts           # ProjectsStore, ProjectRecord
│   └── team.ts               # TeamStore, TeamMemberRecord
├── sqlite/
│   ├── store.ts              # SqliteStore — main implementation
│   ├── stores/
│   │   ├── project-scoped.ts # SqliteProjectScopedStore
│   │   ├── projects.ts       # SqliteProjectsStore
│   │   ├── team.ts           # SqliteTeamStore
│   │   ├── knowledge.ts      # SqliteKnowledgeStore
│   │   ├── tasks.ts          # SqliteTasksStore
│   │   ├── epics.ts          # SqliteEpicsStore
│   │   ├── skills.ts         # SqliteSkillsStore
│   │   ├── code.ts           # SqliteCodeStore
│   │   ├── docs.ts           # SqliteDocsStore
│   │   ├── files.ts          # SqliteFilesStore
│   │   └── attachments.ts    # SqliteAttachmentsStore
│   ├── lib/
│   │   ├── db.ts             # openDatabase (WAL, sqlite-vec, FK)
│   │   ├── migrate.ts        # runMigrations (PRAGMA user_version)
│   │   ├── bigint.ts         # num(), now(), likeEscape(), chunk(), assertEmbeddingDim()
│   │   ├── search.ts         # hybridSearch (RRF fusion)
│   │   ├── meta.ts           # MetaHelper (namespaced key-value)
│   │   ├── edge-helper.ts    # EdgeHelper (cross-graph CRUD)
│   │   └── entity-helpers.ts # EntityHelpers (tags, attachments, edges batch)
│   └── migrations/
│       └── v001.ts           # Full schema (tables, FTS5, vec0, triggers, indexes)
├── FINDINGS.md               # sqlite-vec/FTS5 caveats, benchmarks
├── README.md                 # This file
├── SCHEMA.md                 # Database schema reference
└── API.md                    # Public API reference
```

## Key Design Decisions

### Transactions are external

Store methods are **not transactional** internally. The caller (orchestrator) wraps
multi-step operations in `store.transaction()`:

```typescript
store.transaction(() => {
  const task = scoped.tasks.create(data, embedding);
  scoped.epics.linkTask(epicId, task.id);
});
```

### Unified edges table

All relationships (same-graph and cross-graph) go through a single `edges` table
with composite PK: `(project_id, from_graph, from_id, to_graph, to_id, kind)`.

### Tags as edges

Tags are separate entities linked via edges (`from_graph='tags'`, `kind='tagged'`).
Orphaned tags are cleaned up when the last edge is removed.

### Hybrid search (RRF)

Search combines FTS5 keyword ranking with sqlite-vec cosine distance using
Reciprocal Rank Fusion (K=60). Three modes: `hybrid`, `keyword`, `vector`.

### Optimistic locking

User-managed entities have `version` field. Pass `expectedVersion` to `update()`
to detect conflicts — throws `VersionConflictError` on mismatch.

### Gap-based ordering

Tasks and epics use REAL `order` field with 1000-gap increments. Allows
drag-and-drop reordering without renumbering all rows.

### Cleanup triggers

SQLite triggers on entity DELETE cascade to edges, attachments, and vec0 tables.
vec0 cleanup must be in triggers because virtual tables don't support CASCADE.

## Usage

```typescript
import { SqliteStore } from './store';

const store = new SqliteStore();
store.open({
  dbPath: './data.db',
  embeddingDims: {        // optional, default 384 for all
    code: 1024,           // use larger model for code
  },
});

// Workspace-level
const project = store.projects.create({ slug: 'my-project', name: 'My Project', directory: '/path' });

// Project-scoped
const scoped = store.project(project.id);

// CRUD with embedding
const note = scoped.knowledge.create(
  { title: 'Hello', content: 'World', tags: ['intro'] },
  embedding384,
);

// Search
const results = scoped.knowledge.search({
  text: 'hello',
  embedding: queryEmbedding,
  searchMode: 'hybrid',
  maxResults: 10,
});

// Transaction (caller-managed)
store.transaction(() => {
  scoped.tasks.create(taskData, taskEmbedding);
  scoped.tasks.create(taskData2, taskEmbedding2);
});

store.close();
```
