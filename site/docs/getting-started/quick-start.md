---
title: "Quick Start"
sidebar_label: "Quick Start"
sidebar_position: 3
description: "Get Graph Memory running in under a minute. Index your project and connect an AI assistant."
keywords: [quick start, getting started, tutorial, MCP, Claude]
---

# Quick Start

## 1. Install and serve

```bash
npm install -g @graphmemory/server
cd /path/to/your-project
graphmemory serve
```

That's it. No config file needed — the current directory becomes your project. Graph Memory will:

1. Download the embedding model on first run (~560 MB, cached for future use)
2. Index all markdown docs, TypeScript/JavaScript files, and project files
3. Start the server on `http://localhost:3000`

## 2. Open the Web UI

Navigate to [http://localhost:3000](http://localhost:3000) in your browser. You'll see the dashboard with stats about your indexed project.

## 3. Connect an AI assistant

### Claude Code

```bash
claude mcp add --transport http --scope project graph-memory http://localhost:3000/mcp/your-project
```

The project ID is your directory name (e.g., `my-app` for `/path/to/my-app`).

### Claude Desktop

Go to **Settings > Connectors** and add the URL:

```
http://localhost:3000/mcp/your-project
```

### Cursor / Windsurf

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "graph-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp/your-project"
    }
  }
}
```

## 4. Start asking questions

Once connected, your AI assistant has access to 58 tools. Try asking:

- *"What does this project do?"* — uses `search` and `list_topics` to find docs
- *"Show me all exported functions in auth.ts"* — uses `get_file_symbols`
- *"Create a note about the database schema"* — uses `create_note`
- *"What tasks are in progress?"* — uses `list_tasks`

## What happens during indexing?

Graph Memory creates six interconnected graphs from your project:

| Graph | What it indexes | What you can do |
|-------|----------------|-----------------|
| **Docs** | Markdown files → heading chunks | Search docs, browse topics |
| **Code** | TS/JS files → AST symbols | Search code, get symbols |
| **Files** | All files → metadata | Browse files, search by path |
| **Knowledge** | Your notes and facts | Create, search, link notes |
| **Tasks** | Your tasks | Kanban workflow, track work |
| **Skills** | Reusable recipes | Store and recall procedures |

## Next steps

- [Configuration](./configuration) — customize with `graph-memory.yaml`
- [MCP Tools](/docs/mcp-tools) — explore all 58 tools
- [Web UI](/docs/web-ui) — dashboard, kanban, graph visualization
