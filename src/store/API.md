# Store API Reference

## Store (workspace-level)

```typescript
interface Store {
  open(opts: StoreOptions): void;
  close(): void;
  project(projectId: number): ProjectScopedStore;
  evictProject(projectId: number): void;

  projects: ProjectsStore;
  team: TeamStore;

  createEdge(projectId: number, edge: Edge): void;
  deleteEdge(projectId: number, edge: Edge): void;
  listEdges(filter: EdgeFilter): Edge[];
  findIncomingEdges(graph: GraphName, id: number, projectId?: number): Edge[];
  findOutgoingEdges(graph: GraphName, id: number, projectId?: number): Edge[];

  transaction<T>(fn: () => T): T;

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

### StoreOptions

```typescript
interface StoreOptions {
  dbPath: string;                  // Path to SQLite database file
  embeddingDims?: EmbeddingDims;   // Per-graph embedding dimensions (default 384)
}

type VecGraph = 'code' | 'docs' | 'files' | 'knowledge' | 'tasks' | 'skills' | 'epics';
type EmbeddingDims = Partial<Record<VecGraph, number>>;
```

### Transaction

Wraps `fn` in SQLite `BEGIN/COMMIT`. Rolls back on throw. Store methods
have **no internal transactions** — the caller is responsible for atomicity.

```typescript
store.transaction(() => {
  const task = scoped.tasks.create(data, embedding);
  scoped.epics.linkTask(epicId, task.id);
  // If linkTask throws, task creation is also rolled back
});
```

---

## ProjectScopedStore

Returned by `store.project(projectId)`. All operations scoped to that project.

```typescript
interface ProjectScopedStore {
  code: CodeStore;
  docs: DocsStore;
  files: FilesStore;
  knowledge: KnowledgeStore;
  tasks: TasksStore;
  epics: EpicsStore;
  skills: SkillsStore;
  attachments: AttachmentsStore;

  createEdge(edge: Edge): void;
  deleteEdge(edge: Edge): void;
  listEdges(filter: EdgeFilter): Edge[];
  findIncomingEdges(graph: GraphName, id: number): Edge[];
  findOutgoingEdges(graph: GraphName, id: number): Edge[];
}
```

---

## Common Types

```typescript
type GraphName = 'code' | 'docs' | 'files' | 'knowledge' | 'tasks' | 'skills' | 'epics' | 'tags';

interface Edge {
  fromGraph: GraphName;
  fromId: number;
  toGraph: GraphName;
  toId: number;
  kind: string;
}

interface SearchQuery {
  text?: string;                                    // FTS5 keywords
  embedding?: number[];                             // Vector (dimension per graph config)
  searchMode?: 'hybrid' | 'vector' | 'keyword';    // Default: 'hybrid'
  topK?: number;                                    // Vector candidates (default: 50)
  maxResults?: number;                              // Final results (default: 20)
  minScore?: number;                                // Threshold (default: 0)
}

interface SearchResult {
  id: number;
  score: number;  // RRF score (higher = better)
}

interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
  addedAt: number;
}
```

### VersionConflictError

Thrown by `update()` when `expectedVersion` doesn't match current version.

```typescript
class VersionConflictError extends Error {
  currentVersion: number;
  expectedVersion: number;
}
```

---

## ProjectsStore

```typescript
interface ProjectsStore {
  create(data: ProjectCreate): ProjectRecord;
  update(id: number, patch: ProjectPatch): ProjectRecord;
  delete(id: number): void;
  get(id: number): ProjectRecord | null;
  getBySlug(slug: string): ProjectRecord | null;
  list(pagination?: PaginationOptions): { results: ProjectRecord[]; total: number };

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

```typescript
interface ProjectCreate {
  slug: string;        // Caller-provided slug
  name: string;
  directory: string;
}

interface ProjectPatch {
  name?: string;
  directory?: string;
}

interface ProjectRecord {
  id: number;
  slug: string;
  name: string;
  directory: string;
  createdAt: number;
  updatedAt: number;
}
```

---

## TeamStore

```typescript
interface TeamStore {
  create(data: TeamMemberCreate): TeamMemberRecord;
  update(id: number, patch: TeamMemberPatch): TeamMemberRecord;
  delete(id: number): void;
  get(id: number): TeamMemberRecord | null;
  getBySlug(slug: string): TeamMemberRecord | null;
  list(pagination?: PaginationOptions): { results: TeamMemberRecord[]; total: number };

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

```typescript
interface TeamMemberCreate {
  slug: string;        // Caller-provided slug
  name: string;
  email?: string;
  role?: string;
}

interface TeamMemberPatch {
  name?: string;
  email?: string;
  role?: string;
}
```

---

## KnowledgeStore

CRUD for notes/knowledge entries.

```typescript
interface KnowledgeStore {
  create(data: NoteCreate, embedding: number[]): NoteRecord;
  update(noteId: number, patch: NotePatch, embedding: number[] | null,
         authorId?: number, expectedVersion?: number): NoteRecord;
  delete(noteId: number): void;
  get(noteId: number): NoteDetail | null;
  getBySlug(slug: string): NoteDetail | null;
  list(opts?: NoteListOptions): { results: NoteRecord[]; total: number };
  search(query: SearchQuery): SearchResult[];
  getUpdatedAt(noteId: number): number | null;

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

```typescript
interface NoteCreate {
  title: string;
  content: string;
  tags?: string[];
  authorId?: number;
}

interface NotePatch {
  title?: string;
  content?: string;
  tags?: string[];
}

interface NoteRecord {
  id: number;
  slug: string;
  title: string;
  content: string;
  tags: string[];
  attachments: AttachmentMeta[];
  createdAt: number;
  updatedAt: number;
  version: number;
  createdById: number | null;
  updatedById: number | null;
}

interface NoteDetail extends NoteRecord {
  edges: Edge[];
}

interface NoteListOptions {
  limit?: number;     // Default: 50
  offset?: number;    // Default: 0
  filter?: string;    // LIKE on title/content
  tag?: string;       // Filter by tag name
}
```

---

## TasksStore

Task management with statuses, priorities, ordering, and bulk operations.

```typescript
interface TasksStore {
  create(data: TaskCreate, embedding: number[]): TaskRecord;
  update(taskId: number, patch: TaskPatch, embedding: number[] | null,
         authorId?: number, expectedVersion?: number): TaskRecord;
  delete(taskId: number): void;
  get(taskId: number): TaskDetail | null;
  getBySlug(slug: string): TaskDetail | null;
  list(opts?: TaskListOptions): { results: TaskRecord[]; total: number };
  search(query: SearchQuery): SearchResult[];

  move(taskId: number, status: TaskStatus, targetOrder?: number,
       authorId?: number, expectedVersion?: number): TaskRecord;
  reorder(taskId: number, order: number, status?: TaskStatus, authorId?: number): TaskRecord;
  nextOrderForStatus(status: TaskStatus): number;
  getUpdatedAt(taskId: number): number | null;

  bulkDelete(taskIds: number[]): number;
  bulkMove(taskIds: number[], status: TaskStatus, authorId?: number): number;
  bulkPriority(taskIds: number[], priority: TaskPriority, authorId?: number): number;

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

```typescript
type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

interface TaskCreate {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  order?: number;
  dueDate?: number;
  estimate?: number;
  assigneeId?: number;
  tags?: string[];
  authorId?: number;
}

interface TaskRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  order: number;
  dueDate: number | null;
  estimate: number | null;
  completedAt: number | null;
  assigneeId: number | null;
  attachments: AttachmentMeta[];
  createdAt: number;
  updatedAt: number;
  version: number;
  createdById: number | null;
  updatedById: number | null;
}

interface TaskDetail extends TaskRecord {
  edges: Edge[];
}
```

---

## EpicsStore

Epics group tasks. Progress computed from linked tasks.

```typescript
interface EpicsStore {
  create(data: EpicCreate, embedding: number[]): EpicRecord;
  update(epicId: number, patch: EpicPatch, embedding: number[] | null,
         authorId?: number, expectedVersion?: number): EpicRecord;
  delete(epicId: number): void;
  get(epicId: number): EpicDetail | null;
  getBySlug(slug: string): EpicDetail | null;
  list(opts?: EpicListOptions): { results: EpicRecord[]; total: number };
  search(query: SearchQuery): SearchResult[];
  reorder(epicId: number, order: number, authorId?: number): EpicRecord;

  linkTask(epicId: number, taskId: number): void;
  unlinkTask(epicId: number, taskId: number): void;

  getUpdatedAt(epicId: number): number | null;

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

```typescript
type EpicStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

interface EpicRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: EpicStatus;
  priority: TaskPriority;
  tags: string[];
  order: number;
  progress: { total: number; done: number };  // Computed from linked tasks
  attachments: AttachmentMeta[];
  createdAt: number;
  updatedAt: number;
  version: number;
  createdById: number | null;
  updatedById: number | null;
}
```

---

## SkillsStore

Reusable patterns/skills with usage tracking.

```typescript
interface SkillsStore {
  create(data: SkillCreate, embedding: number[]): SkillRecord;
  update(skillId: number, patch: SkillPatch, embedding: number[] | null,
         authorId?: number, expectedVersion?: number): SkillRecord;
  delete(skillId: number): void;
  get(skillId: number): SkillDetail | null;
  getBySlug(slug: string): SkillDetail | null;
  list(opts?: SkillListOptions): { results: SkillRecord[]; total: number };
  search(query: SearchQuery): SearchResult[];
  bumpUsage(skillId: number): void;
  getUpdatedAt(skillId: number): number | null;

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

```typescript
type SkillSource = 'user' | 'learned';

interface SkillRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  steps: string[];
  triggers: string[];
  inputHints: string[];
  filePatterns: string[];
  tags: string[];
  source: SkillSource;
  confidence: number;      // 0.0 - 1.0
  usageCount: number;
  lastUsedAt: number | null;
  attachments: AttachmentMeta[];
  createdAt: number;
  updatedAt: number;
  version: number;
  createdById: number | null;
  updatedById: number | null;
}
```

---

## CodeStore

Indexed by file. Stores file nodes and symbol nodes (functions, classes, etc.).

```typescript
interface CodeStore {
  updateFile(fileId: string, nodes: Omit<CodeNode, 'id'>[],
             edges: Array<{ fromName: string; toName: string; kind: string }>,
             mtime: number, embeddings: Map<string, number[]>): void;
  removeFile(fileId: string): void;
  resolveEdges(edges: Array<{ fromName: string; toName: string; kind: string }>): void;

  getFileMtime(fileId: string): number | null;
  listFiles(filter?: string, pagination?: PaginationOptions): { results: CodeFileEntry[]; total: number };
  getFileSymbols(fileId: string): CodeNode[];
  getNode(nodeId: number): CodeNode | null;
  search(query: SearchQuery): SearchResult[];
  searchFiles(query: SearchQuery): SearchResult[];
  findByName(name: string): CodeNode[];

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

```typescript
interface CodeNode {
  id: number;
  kind: string;       // 'file', 'function', 'class', 'method', 'interface', etc.
  fileId: string;     // Relative file path
  language: string;
  name: string;
  signature: string;
  docComment: string;
  body: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  mtime: number;
}

interface CodeFileEntry {
  id: number;
  fileId: string;
  language: string;
  symbolCount: number;
  mtime: number;
}
```

---

## DocsStore

Indexed by file. Stores file nodes and content chunks (headings, paragraphs, code blocks).

```typescript
interface DocsStore {
  updateFile(fileId: string, chunks: Omit<DocNode, 'id' | 'kind'>[],
             mtime: number, embeddings: Map<string, number[]>): void;
  removeFile(fileId: string): void;
  resolveLinks(edges: Array<{ fromFileId: string; toFileId: string }>): void;

  getFileMtime(fileId: string): number | null;
  listFiles(filter?: string, pagination?: PaginationOptions): { results: DocFileEntry[]; total: number };
  getFileChunks(fileId: string): DocNode[];
  getNode(nodeId: number): DocNode | null;
  search(query: SearchQuery): SearchResult[];
  searchFiles(query: SearchQuery): SearchResult[];
  listSnippets(language?: string, pagination?: PaginationOptions): { results: DocNode[]; total: number };
  searchSnippets(query: SearchQuery, language?: string): SearchResult[];
  findBySymbol(symbol: string): DocNode[];

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

```typescript
interface DocNode {
  id: number;
  kind: 'file' | 'chunk';
  fileId: string;
  title: string;
  content: string;
  level: number;         // Heading level (0 = file)
  language?: string;     // Code block language
  symbols: string[];     // Referenced identifiers
  mtime: number;
}
```

---

## FilesStore

File index with directory tree management.

```typescript
interface FilesStore {
  updateFile(filePath: string, size: number, mtime: number,
             embedding: number[], opts?: FileUpdateOptions): void;
  removeFile(filePath: string): void;

  getFileMtime(filePath: string): number | null;
  listFiles(opts?: FileListOptions): { results: FileNode[]; total: number };
  getFileInfo(filePath: string): FileNode | null;
  search(query: SearchQuery): SearchResult[];

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}
```

```typescript
interface FileNode {
  id: number;
  kind: 'file' | 'directory';
  filePath: string;
  fileName: string;
  directory: string;
  extension: string;
  language: string | null;
  mimeType: string | null;
  size: number;
  mtime: number;
}

interface FileListOptions {
  limit?: number;
  offset?: number;
  filter?: string;       // LIKE on file_path
  directory?: string;    // Browse specific directory
  extension?: string;    // Filter by extension
}
```

---

## AttachmentsStore

Metadata-only attachment storage (no blob storage).

```typescript
interface AttachmentsStore {
  add(graph: GraphName, entityId: number, meta: AttachmentMeta): void;
  remove(graph: GraphName, entityId: number, filename: string): void;
  removeAll(graph: GraphName, entityId: number): void;
  list(graph: GraphName, entityId: number): AttachmentMeta[];
}
```

---

## Utilities

### Hybrid Search

```typescript
function hybridSearch(
  db: Database.Database,
  config: SearchConfig,
  query: SearchQuery,
  projectId: number,
): SearchResult[];
```

Three modes:
- **keyword** — FTS5 MATCH with token quoting
- **vector** — sqlite-vec cosine distance, overfetches 3x
- **hybrid** — RRF fusion of both (K=60)

### Helper Functions

```typescript
num(v: bigint | number): number          // BigInt → number conversion
now(): bigint                            // Current timestamp (ms epoch)
likeEscape(text: string): string         // Escape %, _, \ for LIKE
assertEmbeddingDim(embedding: number[], expectedDim: number): void  // Validate dimension
chunk<T>(arr: T[], size?: number): T[][] // Split array (default 900)
safeJson<T>(raw: string, fallback: T): T // Parse JSON with fallback
```
