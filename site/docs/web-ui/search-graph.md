---
title: "Search & Graph Visualization"
sidebar_label: "Search & Graph"
sidebar_position: 4
description: "Search across all six graphs from one search box, visualize connections with an interactive force-directed graph, and test MCP tools live from the browser."
keywords: [search, graph visualization, Cytoscape.js, MCP tools, semantic search]
---

# Search & Graph Visualization

## Unified search

The Search page provides a single search box that queries all six graphs simultaneously. This is the fastest way to find anything in your project.

### How it works

Type your query and press Enter. Graph Memory runs a hybrid search combining:

- **BM25 keyword matching** -- finds exact and partial term matches
- **Vector cosine similarity** -- finds semantically related content even when different words are used

Results are fused using Reciprocal Rank Fusion (RRF) and expanded via graph traversal to surface connected nodes.

### Scope toggles

Above the results, toggle buttons let you enable or disable individual graphs in the search. For example, you can search only across documentation and code, or only within the knowledge graph.

### Grouped results

Results are organized by graph type:

- **Docs** -- matching documentation chunks with file path and heading
- **Code** -- matching functions, classes, and interfaces with file location
- **Knowledge** -- matching notes with title and excerpt
- **Tasks** -- matching tasks with status and priority
- **Files** -- matching files with path and metadata
- **Skills** -- matching skills with name and description

Each result shows a relevance score. Click any result to navigate to its detail view.

## Graph visualization

The Graph page renders an interactive force-directed graph using [Cytoscape.js](https://js.cytoscape.org/).

### Layout

Nodes automatically position themselves based on their connections using a force-directed algorithm. Connected nodes cluster together, while unrelated nodes drift apart. You can drag individual nodes to rearrange them.

### Color coding

Each graph type has a distinct color, making it easy to identify nodes at a glance:

- Documentation nodes, code nodes, knowledge nodes, tasks, files, and skills each have their own color
- Cross-graph proxy nodes are visually distinguished from regular nodes

### Interaction

- **Click** a node to select it and highlight its immediate neighbors
- **Hover** over a node to see a tooltip with its name and type
- **Drag** nodes to manually reposition them
- **Mouse wheel** to zoom in and out
- **Click and drag** the background to pan

### Node inspector

When you click a node, the inspector panel opens on the side showing:

- Node type and graph
- Title or name
- Key metadata fields
- List of connections to other nodes

### Scope filter

A dropdown at the top lets you filter which graph types are visible:

- View all graphs at once for a complete picture
- Focus on a single graph type (e.g., only knowledge nodes)
- Combine specific graphs (e.g., docs + code to see how documentation relates to source files)

### Search within graph

A search box on the graph page lets you find and highlight specific nodes. Matching nodes are visually emphasized while non-matching nodes fade, helping you locate items in large graphs.

### Controls

- **Zoom to fit** -- resets the viewport to show all visible nodes
- **Zoom in / out** -- buttons for precise zoom control
- **Reset layout** -- re-runs the force-directed algorithm to reposition all nodes

## Tools explorer

The Tools page lets you browse and test all 58 MCP tools directly from your browser, without needing an AI assistant.

### Tool list

Tools are organized by category (docs, code, knowledge, tasks, skills, files, cross-references, search). Each tool shows its name and a short description.

### Live execution

Select a tool to see its full description and input schema. Fill in the parameter fields and click execute. The tool runs against your live data, and the result appears below along with the execution duration.

This is useful for:

- **Testing** -- verify a tool works as expected before using it from your AI assistant
- **Debugging** -- inspect tool output when troubleshooting MCP integration
- **Exploration** -- discover what each tool does and what data it returns

Tools that require write access are only shown if your user account has the appropriate permissions. See [Access Control](/docs/security/access-control) for details.
