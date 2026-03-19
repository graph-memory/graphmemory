# UI Patterns

Architecture patterns and conventions used in the React web UI.

## FSD layer conventions

| Layer | What goes here | Import rules |
|-------|----------------|-------------|
| **app** | Routes, theme, global config | Can import everything |
| **pages** | Full page components (1 per route) | Imports features, entities, shared |
| **widgets** | Composed UI blocks (Layout) | Imports entities, shared |
| **features** | User interactions (CRUD hooks, forms) | Imports entities, shared |
| **entities** | Domain models (API, types, cards) | Imports shared only |
| **shared** | Utilities, base components, contexts | No cross-imports |
| **content** | Static markdown (help, prompts) | Bundled via `?raw` import |

## State management

No Redux/Zustand — local component state + custom hooks:

- **`useXxx()` hooks** — data fetching + CRUD with optimistic updates
- **`useState`** — local UI state (modals, search results, filters)
- **`useCallback`** — memoized callbacks
- **`useEffect`** — data loading, WebSocket subscriptions
- **`useRef`** — stale handler prevention, input focus

## Page patterns

### List page

Example: Knowledge page, Skills page

```
PageTopBar (breadcrumbs + "New" button)
FilterBar (search input + tag/priority/assignee filters)
Content (Stack of Cards or Kanban columns)
EmptyState (when no items)
```

Data flow:
```typescript
const { projectId } = useParams();
const canWrite = useCanWrite('knowledge');
const { notes, loading, refresh } = useNotes(projectId);
const [searchResults, setSearchResults] = useState(null);

useWebSocket(projectId, (event) => {
  if (event.type.startsWith('note:')) refresh();
});

const doSearch = async (q) => {
  setSearchResults(await searchNotes(projectId, q));
};

const displayNotes = searchResults ?? notes;
```

Key patterns:
- `useCanWrite(graphName)` checks ACL — hides "New" button if read-only
- `useWebSocket` refreshes data on real-time events
- Search results **replace** the default list (not filter it) — null means show all
- WebSocket triggers `refresh()` for server-authoritative state

### Detail page

Example: Note detail, Task detail, Skill detail

```
PageTopBar (breadcrumbs + Edit/Delete buttons)
Section "Properties" (FieldRow pairs)
Section "Description" (MarkdownRenderer)
AttachmentSection (image gallery + file list)
RelationManager (cross-graph links)
```

Data flow:
```typescript
const load = useCallback(async () => {
  const [entity, relations, attachments] = await Promise.all([
    getEntity(projectId, entityId),
    listRelations(projectId, entityId),
    listAttachments(projectId, entityId),
  ]);
  setEntity(entity);
  setRelations(relations);
  setAttachments(attachments);
}, [projectId, entityId]);

useWebSocket(projectId, (event) => {
  if (event.type.startsWith('entity:')) load();
});
```

Key patterns:
- `Promise.all()` for parallel data loading
- Edit/Delete buttons hidden when `!canWrite`
- Delete shows `ConfirmDialog` before proceeding
- WebSocket reloads entire entity on any change

### Create/Edit form page

Example: Note new/edit, Task new/edit, Skill new/edit

```
PageTopBar (breadcrumbs + Submit/Cancel buttons)
FormComponent (NoteForm / TaskForm / SkillForm)
```

Data flow:
```typescript
// Create page
const handleSubmit = async (data) => {
  const result = await createEntity(projectId, data);
  navigate(`/${projectId}/entity/${result.id}`);
};

// Edit page
useEffect(() => { loadEntity(); }, [entityId]);

const handleSubmit = async (data) => {
  await updateEntity(projectId, entityId, data);
  navigate(`/${projectId}/entity/${entityId}`);
};
```

Key patterns:
- Shared form component for both create and edit (receives optional entity for pre-fill)
- Read-only warning via `Alert` when `!canWrite`
- Submit navigates to detail page on success
- Cancel navigates back to list or detail

## Entity API pattern

Every entity module (`entities/note/`, `entities/task/`, etc.) exports:

```typescript
// Types
export interface Note { id: string; title: string; content: string; tags: string[]; ... }

// CRUD
export function listNotes(projectId, params?) → request<ListResponse<Note>>().then(unwrapList)
export function getNote(projectId, noteId) → request<Note>()
export function createNote(projectId, data) → request<Note>(POST)
export function updateNote(projectId, noteId, data) → request<Note>(PUT)
export function deleteNote(projectId, noteId) → request<void>(DELETE)

// Search
export function searchNotes(projectId, query, params?) → request<ListResponse>().then(unwrapList)

// Relations
export function listRelations(projectId, noteId) → ...
export function createRelation(projectId, data) → ...

// Attachments
export function uploadAttachment(projectId, noteId, file: File) → fetch(FormData)
export function listAttachments(projectId, noteId) → ...
export function deleteAttachment(projectId, noteId, filename) → ...
export function attachmentUrl(projectId, noteId, filename): string → URL
```

All functions use the shared `request<T>()` from `shared/api/client.ts`:
- `credentials: 'include'` on every request (cookie auth)
- Automatic 401 → refresh → retry flow
- `unwrapList()` for `{ results: [...] }` responses
- Query string builder `qs()` that filters null/undefined

## Feature hook pattern

```typescript
export function useNotes(projectId: string | null) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setNotes(await listNotes(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { notes, loading, error, refresh };
}
```

Returns `{ items, loading, error, refresh }` — pages call `refresh()` on WebSocket events.

## Shared UI components

| Component | Purpose |
|-----------|---------|
| `PageTopBar` | Breadcrumbs + action buttons at top of page |
| `Section` | Bordered box with title header |
| `FieldRow` | Label (200px) + value with divider |
| `FilterBar` | Horizontal filter row with background |
| `Tags` | Display/edit tags with chips |
| `StatusBadge` | Colored label badge |
| `MarkdownEditor` | Markdown editing with preview |
| `MarkdownRenderer` | Markdown → HTML rendering |
| `ConfirmDialog` | Delete confirmation modal |
| `DateDisplay` | Human-readable timestamps |
| `EmptyState` | Icon + message + action button |
| `CopyButton` | Click to copy value |
| `FormGrid` / `FormField` / `FieldLabel` | Form layout helpers |

## WebSocket integration

```typescript
// Provider (in Layout)
<WsProvider projectId={projectId}>
  <Outlet />
</WsProvider>

// Consumer (in any page)
useWebSocket(projectId, (event) => {
  if (event.type.startsWith('note:')) refresh();
});
```

Key implementation details:
- **Singleton manager** — one WebSocket connection per project
- **Auto-reconnect** — 3-second timeout on close
- **Project filtering** — events filtered client-side by `projectId`
- **`useRef` for handler** — prevents stale closures without re-subscribing

## Access control

```typescript
// Provider (in Layout)
<AccessProvider graphs={currentProject?.graphs ?? {}} loading={loading}>

// Consumer (in any page/component)
const canWrite = useCanWrite('knowledge');

// Usage
{canWrite && <Button>Edit</Button>}
{!canWrite && <Alert>Read-only access</Alert>}
```

Also used in Layout sidebar — disabled graphs (`enabled: false`) are hidden from navigation.

## Kanban-specific patterns (Tasks page)

The tasks page has unique patterns:

- **Drag-drop** — HTML5 drag API with drop-zone highlights
- **Column visibility** — persisted in localStorage, configurable per user
- **Inline creation** — "+" button in column header to create task directly in that status
- **Quick actions** — hover to show move-to-next/previous buttons
- **Scrollable columns** — each column independently scrollable
- **Card enrichment** — priority badge, due date (red when overdue), estimate, assignee name, tags

## Auth flow

```
App loads → AuthGate checks GET /api/auth/status
  → required: false → render app (no auth needed)
  → required: true, authenticated: false → show LoginPage
  → required: true, authenticated: true → render app

LoginPage → POST /api/auth/login { email, password }
  → server sets httpOnly JWT cookies
  → AuthGate re-renders app

During session → any 401 response
  → client.ts tries POST /api/auth/refresh
  → success → retry original request (transparent)
  → failure → onAuthFailure() → AuthGate shows login
```

## Theme

- **MUI 7** with custom `palette.custom` tokens
- **Dark/light toggle** — `ThemeModeContext` + localStorage
- **Active nav item** — primary color background with custom text color
- **Responsive** — MUI breakpoints, collapsible sidebar on mobile
