# Graph Memory — Web UI

React web interface for browsing and managing graph memory data.

## Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| React | 19 | UI framework |
| Material UI (MUI) | 7 | Component library |
| React Router DOM | 7 | Client-side routing |
| Cytoscape.js | 3.33 | Graph visualization |
| Vite | 8 | Build tool + dev server |

## Architecture

Feature-Sliced Design (FSD):

```
src/
├── app/             # Routes, theme, global styles
├── pages/           # Dashboard, Knowledge, Tasks, Skills, Docs, Files, Prompts, Search, Graph, Tools, Help
├── widgets/         # Layout (sidebar + project selector + theme toggle)
├── features/        # note-crud, task-crud, skill-crud
├── entities/        # project, note, task, skill, file, doc, code, graph
├── shared/          # API client, WebSocket hook, theme context
└── content/         # Help articles + prompt templates (markdown, bundled via ?raw)
```

## Development

```bash
npm install
npm run dev          # Vite dev server on :5173, proxies /api → http://localhost:3000
npm run build        # Production build → dist/
```

The backend (`serve` command) must be running on port 3000 for the API proxy to work.

## Pages

| Route | Description |
|-------|-------------|
| `/:projectId/dashboard` | Stats cards + recent notes/tasks |
| `/:projectId/knowledge` | Notes CRUD, search, relations, cross-graph links |
| `/:projectId/tasks` | Kanban board: configurable columns, drag-drop with highlights, inline creation, filters, due date/estimate badges, quick actions |
| `/:projectId/docs` | Browse indexed documentation, TOC |
| `/:projectId/files` | File browser, directory navigation, metadata |
| `/:projectId/skills` | Skill/recipe management with triggers, steps, usage tracking |
| `/:projectId/prompts` | AI prompt generator: scenarios, role/style/graph selection, live preview, export as skill |
| `/:projectId/search` | Unified search across all 6 graphs |
| `/:projectId/graph` | Interactive force-directed graph (Cytoscape.js) |
| `/:projectId/tools` | MCP tools explorer with live execution |
| `/:projectId/help` | Built-in searchable documentation |
