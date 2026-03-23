# UI Architecture

**Directory**: `ui/`

## Tech stack

| Library | Version | Purpose |
|---------|---------|---------|
| React | 19 | UI framework |
| Material UI (MUI) | 7 | Component library |
| React Router DOM | 7 | Client-side routing |
| Vite | 8 | Build tool + dev server |
| react-markdown + remark-gfm | — | Markdown rendering |
| @uiw/react-md-editor | — | Markdown editor |

## Architecture: Feature-Sliced Design (FSD)

```
ui/src/
├── main.tsx                      # ReactDOM.createRoot + Router + Theme
├── app/
│   ├── App.tsx                   # Route definitions
│   ├── theme.ts                  # MUI light/dark themes + custom tokens
│   └── styles.css                # Global styles
├── pages/
│   ├── dashboard/                # Stats cards + recent activity
│   ├── knowledge/                # Notes CRUD + search + detail/edit/new
│   ├── tasks/                    # Kanban board + drag-drop + detail/edit/new
│   ├── skills/                   # Skill management + triggers + usage
│   ├── docs/                     # Browse documentation + detail view
│   ├── code/                     # Code browser + symbol detail
│   ├── files/                    # File browser + search + detail
│   ├── prompts/                  # AI prompt generator
│   ├── search/                   # Cross-graph unified search
│   ├── tools/                    # MCP tools explorer
│   ├── help/                     # Searchable documentation
│   └── login/                    # Email + password login
├── widgets/
│   └── layout/                   # Sidebar + project selector + theme toggle + logout
├── features/
│   ├── note-crud/                # useNotes hook, NoteDialog, RelationsDialog
│   ├── task-crud/                # TaskDialog
│   └── skill-crud/               # SkillDialog
├── entities/
│   ├── project/                  # listProjects API, useProjects hook
│   ├── note/                     # Note type, API, NoteCard
│   ├── task/                     # Task type, statuses, priorities, API
│   ├── skill/                    # Skill type, API
│   ├── file/                     # FileInfo type, API
│   ├── doc/                      # searchDocs API
│   ├── code/                     # searchCode API
├── content/
│   ├── help/                     # Help articles (markdown, bundled via ?raw)
│   └── prompts/                  # Prompt templates (roles, styles, scenarios, graphs)
└── shared/
    ├── api/client.ts             # Base HTTP: get(), post(), put(), del() with cookie auth
    ├── lib/useWebSocket.ts       # WebSocket hook with auto-reconnect
    ├── lib/ThemeModeContext.tsx   # Light/dark theme toggle context
    ├── lib/AuthGate.tsx          # Auth gate (checks status, shows login if needed)
    └── lib/AccessContext.tsx     # Per-graph access level context
```

## FSD layers

| Layer | Purpose | Example |
|-------|---------|---------|
| **app** | Routes, theme, global config | `App.tsx`, `theme.ts` |
| **pages** | Full page components | `DashboardPage`, `TasksPage` |
| **widgets** | Composed UI blocks | `Layout` (sidebar + toolbar) |
| **features** | User interactions | `NoteDialog`, `TaskDialog` |
| **entities** | Domain models + API | `Note`, `Task`, `Skill` types |
| **shared** | Reusable utilities | HTTP client, hooks, contexts |
| **content** | Static content | Help articles, prompt templates |

## Routing

All routes are scoped to a project: `/:projectId/...`

| Route | Page |
|-------|------|
| `/:projectId/dashboard` | DashboardPage |
| `/:projectId/knowledge` | KnowledgePage |
| `/:projectId/knowledge/new` | Create note |
| `/:projectId/knowledge/:noteId` | Note detail |
| `/:projectId/knowledge/:noteId/edit` | Edit note |
| `/:projectId/tasks` | TasksPage (kanban) |
| `/:projectId/tasks/:taskId` | Task detail |
| `/:projectId/skills` | SkillsPage |
| `/:projectId/skills/:skillId` | Skill detail |
| `/:projectId/docs` | DocsPage |
| `/:projectId/code` | CodePage |
| `/:projectId/code/:symbolId` | CodeDetailPage |
| `/:projectId/files` | FilesPage |
| `/:projectId/prompts` | PromptsPage |
| `/:projectId/search` | SearchPage |
| `/:projectId/tools` | ToolsPage |
| `/:projectId/help` | HelpPage |

Default route redirects to `/:projectId/dashboard`.

## HTTP client

`ui/src/shared/api/client.ts` — base HTTP functions:

- All requests use `credentials: 'include'` (cookies sent automatically)
- On 401: attempts `POST /api/auth/refresh`, retries original request
- On refresh failure: calls `onAuthFailure` callback → redirect to login
- No localStorage usage for auth — everything via httpOnly cookies

## Authentication flow

1. `AuthGate` checks `GET /api/auth/status` on app load
2. If auth required and not authenticated → show `LoginPage`
3. User submits email + password → `POST /api/auth/login`
4. Server sets JWT cookies → `AuthGate` renders the app
5. On 401 during session → auto-refresh → if fails → back to login

## Theme

MUI 7 with light/dark mode toggle. Custom tokens for active sidebar colors. Stored in `ThemeModeContext` with localStorage persistence.

## WebSocket

`WsProvider` wraps page content with an auto-reconnecting WebSocket connection. Components subscribe to specific event types via the `useWebSocket` hook.

## Access control in UI

`AccessProvider` provides per-graph access levels to all pages. Components use `useAccess(graphName)` to check permissions:
- Read-only graphs: hide create/edit/delete buttons
- Disabled graphs: hidden from sidebar navigation

## Development

```bash
cd ui
npm install
npm run dev      # Vite on :5173, proxies /api → http://localhost:3000
npm run build    # Production build → ui/dist/
```

The backend must be running on port 3000 for the API proxy to work.

## Production build

Built output is served as static files from the HTTP server (`dist/ui/`). Non-API routes return `index.html` for SPA client-side routing.
