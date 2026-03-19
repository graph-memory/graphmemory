# UI Features

## Pages overview

| Page | Description |
|------|-------------|
| **Dashboard** | Project stats + recent activity |
| **Knowledge** | Notes CRUD with semantic search |
| **Tasks** | Kanban board with drag-drop |
| **Skills** | Recipe/procedure management |
| **Docs** | Browse indexed documentation |
| **Files** | File browser with search |
| **Prompts** | AI prompt generator |
| **Search** | Cross-graph unified search |
| **Graph** | Interactive graph visualization |
| **Tools** | MCP tools explorer |
| **Help** | Built-in documentation |
| **Login** | Email + password authentication |

## Dashboard

Stats cards showing counts for each graph (notes, tasks, skills, docs, code, files). Recent activity feed showing latest created/updated notes and tasks.

## Knowledge

- **Note list** with search and tag filtering
- **Note detail** view with full content, relations, cross-graph links
- **Create/edit** forms with markdown editor
- **Relations dialog** — manage note-to-note and cross-graph relations
- **Semantic search** — hybrid BM25 + vector search
- **Attachment management** — upload, list, download, delete files

## Tasks (Kanban board)

- **Configurable columns** — show/hide status columns (persisted in localStorage)
- **Drag-drop** with drop-zone highlights for moving tasks between columns
- **Inline task creation** — create tasks directly in a column
- **Filter bar** — search text, priority, tags, assignee
- **Task cards** showing:
  - Title, priority badge (color-coded)
  - Due date badge (red when overdue)
  - Estimate badge
  - Assignee display (resolved from team member name)
  - Tag chips
- **Quick actions** on hover — move to next/previous status
- **Scrollable columns** — independent scrolling per column
- **Task detail** — full view with subtasks, blocked-by, blocks, related tasks
- **Task edit** — form with all fields (status, priority, dueDate, estimate, assignee, tags)

## Skills

- **Skill list** with source and tag filtering
- **Skill detail** — steps, triggers, usage count, last used, cross-graph links
- **Create/edit** forms for recipes and procedures
- **Usage tracking** — view how often skills are used
- **Trigger display** — shows what activates the skill

## Docs

- **File list** — browse all indexed markdown files
- **Table of contents** — heading hierarchy for each file
- **Detail view** — rendered markdown content with syntax highlighting
- **Search** — semantic search across documentation

## Files

- **Directory navigation** — breadcrumb path, click to navigate
- **File list** — with language, size, extension columns
- **Detail view** — file metadata (language, MIME type, size, mtime)
- **Search** — semantic search by file path

## Prompts

AI prompt generator for creating customized system prompts:

- **Scenario presets** — architecture review, bug investigation, code review, development, documentation, knowledge capture, mentoring, onboarding, refactoring, task planning
- **Role selection** — developer, architect, reviewer, team lead, tech writer
- **Style selection** — proactive, reactive, read-only
- **Graph selection** — choose which graphs to include in the prompt
- **Live preview** — see the generated prompt in real time
- **Copy to clipboard** — one-click copy
- **Export as skill** — save the generated prompt as a skill

## Search

Unified semantic search across all 6 graphs:
- Single search box queries all graphs simultaneously
- Results grouped by graph type (docs, code, knowledge, tasks, files, skills)
- Score-based ranking within each group
- Click results to navigate to detail views

## Graph

Interactive force-directed graph visualization using Cytoscape.js:

- **Scope filter** — view knowledge, tasks, skills, docs, code, files, or all
- **Force-directed layout** — nodes automatically position based on connections
- **Node inspector** — click a node to see its details
- **Zoom/pan** — mouse wheel zoom, drag to pan
- **Color coding** — different colors per graph type

## Tools

MCP tools explorer for testing and debugging:

- **Tool list** — all 58 MCP tools grouped by category
- **Tool details** — input schema, description
- **Live execution** — fill in parameters and call tools from the browser
- **Result display** — shows tool output + execution duration

## Help

Built-in searchable documentation:

- **Getting started** guide
- **Concepts** — graph structure, how search works, cross-graph links
- **Guides** — per-tool-group documentation (docs, code, knowledge, tasks, skills, files, cross-references)
- **Search** — filter help articles by keyword

Content is bundled as markdown files via Vite's `?raw` import.

## Login

Email + password login page:
- Shown when `GET /api/auth/status` returns `required: true, authenticated: false`
- Posts to `/api/auth/login` with `credentials: 'include'`
- On success → server sets JWT cookies → app renders

## Layout

Persistent sidebar with:
- **Graph Memory logo** and title
- **Project selector** — dropdown grouped by workspace
- **Navigation items** — icon + label for each page
- **Active page highlighting** — primary color background
- **Theme toggle** — light/dark mode
- **Logout button** — clears JWT cookies and reloads

The sidebar hides navigation items for disabled graphs (e.g. if `code.enabled: false`, the code page is hidden).

## Real-time updates

All data pages react to WebSocket events:
- **Knowledge** — note list refreshes on create/update/delete
- **Tasks** — kanban board updates on create/update/delete/move
- **Skills** — skill list updates on create/update/delete
- **Dashboard** — stats and recent activity refresh
- **Graph** — visualization updates when indexer processes files

## Responsive design

- **Desktop**: full sidebar (240px) + content area
- **Mobile**: collapsible sidebar (hamburger menu)
- Material UI responsive breakpoints (`xs`, `md`)
