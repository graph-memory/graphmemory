---
title: "Web UI Overview"
sidebar_label: "Overview"
sidebar_position: 1
description: "Graph Memory includes a full-featured web UI for browsing graphs, managing knowledge, tasks, and skills, searching across all data, and visualizing connections."
keywords: [web UI, dashboard, graph visualization, search, knowledge management]
---

# Web UI Overview

Graph Memory ships with a built-in web interface that gives you full access to all six graphs without needing an AI assistant or API client. Once the server is running, open your browser and navigate to:

```
http://localhost:3000
```

The port depends on your configuration. If you changed `server.port` in `graph-memory.yaml`, use that port instead.

## Pages

The UI is organized into dedicated pages, each accessible from the sidebar:

| Page | What it does |
|------|-------------|
| **Dashboard** | Project stats at a glance plus recent activity feed |
| **Knowledge** | Create, edit, and search notes with rich markdown and cross-graph relations |
| **Tasks** | Kanban board with drag-and-drop, priorities, assignees, and due dates |
| **Skills** | Manage reusable recipes and procedures with steps and triggers |
| **Docs** | Browse all indexed markdown documentation with rendered content |
| **Files** | Navigate the file index with metadata and directory hierarchy |
| **Search** | Unified semantic search across all six graphs in one query |
| **Graph** | Interactive force-directed visualization of nodes and connections |
| **Prompts** | Generate AI system prompts with scenario presets, roles, and graph selection |
| **Tools** | Browse and live-test all 58 MCP tools from your browser |
| **Help** | Built-in searchable documentation with getting-started guides and concept explanations |

When authentication is configured, a **Login** page is shown before any other content. See [Authentication](/docs/security/authentication) for setup details.

## Themes

The UI supports both **light** and **dark** themes. Toggle between them using the theme switch at the bottom of the sidebar. Your preference is saved in the browser.

## Real-time updates

All data pages update automatically via WebSocket:

- **Dashboard** stats and recent activity refresh as data changes
- **Knowledge** note list updates on create, edit, or delete
- **Tasks** kanban board reflects moves, new tasks, and status changes instantly
- **Skills** list updates on any modification
- **Graph** visualization refreshes as the indexer processes files

You never need to manually refresh the page to see the latest data.

## Responsive layout

- **Desktop**: persistent sidebar (240px) with full navigation alongside the content area
- **Mobile**: collapsible sidebar accessible via a hamburger menu

## Disabled graphs

If a graph is disabled in your configuration (for example, `code.enabled: false`), its navigation item is automatically hidden from the sidebar. This keeps the UI clean and focused on the graphs you actually use.

## Next steps

- [Dashboard and Navigation](dashboard-navigation) -- project selector, stats, and sidebar
- [Knowledge, Tasks, and Skills](knowledge-tasks-skills) -- managing your persistent data
- [Search and Graph Visualization](search-graph) -- finding and exploring connections
