---
title: "Connect MCP Clients"
sidebar_label: "Connect MCP Clients"
sidebar_position: 1
description: "Connect Claude.ai, Claude Code, Claude Desktop, Cursor, Windsurf, or any MCP client to Graph Memory via Streamable HTTP."
keywords: [MCP, Claude.ai, Claude Code, Claude Desktop, Cursor, Windsurf, connect, client, HTTP, transport, OAuth]
---

# Connect MCP Clients

Graph Memory exposes an MCP endpoint for each project at:

```
http://localhost:3000/mcp/{projectId}
```

Any MCP-compatible client can connect to this URL using the Streamable HTTP transport. Multiple clients can connect to the same server simultaneously — each session gets its own MCP instance but shares graph data.

## Claude.ai

Claude.ai connects via its "Add custom connector" dialog, which uses OAuth 2.0. This requires the server to be reachable at a public HTTPS URL and `jwtSecret` to be configured in `graph-memory.yaml`.

1. In Claude.ai, open **Settings > Connectors** and click **Add custom connector**
2. Fill in the fields:

   | Field | Value |
   |-------|-------|
   | Name | Any label, e.g., `Graph Memory` |
   | Remote MCP server URL | `https://yourserver.com/mcp/your-project` |
   | OAuth Client ID | your `userId` from `graph-memory.yaml` (e.g., `alice`) |
   | OAuth Client Secret | your `apiKey` from `graph-memory.yaml` (e.g., `mgm-abc123...`) |

3. Save the connector. Claude.ai performs the OAuth exchange automatically and connects.

See [Authentication → Connecting Claude.ai](../security/authentication.md#connecting-claudeai) for configuration details.

## Claude Code

Run this command in your project directory:

```bash
claude mcp add --transport http --scope project graph-memory http://localhost:3000/mcp/my-app
```

Or add a `.mcp.json` file to your project root:

```json
{
  "mcpServers": {
    "graph-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp/my-app"
    }
  }
}
```

The `--scope project` flag ensures the connection is only active when working in this project directory.

## Claude Desktop

1. Open **Claude Desktop**
2. Go to **Settings > Connectors**
3. Enter the MCP URL:

```
http://localhost:3000/mcp/my-app
```

Claude Desktop will discover all available tools automatically.

## Cursor

Create a `.cursor/mcp.json` file in your project root (or `.mcp.json` at the workspace level):

```json
{
  "mcpServers": {
    "graph-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp/my-app"
    }
  }
}
```

Restart Cursor or reload the window for the connection to take effect.

## Windsurf

Open Windsurf settings and add the MCP server URL:

```
http://localhost:3000/mcp/my-app
```

Windsurf will pick up the tools and make them available to the AI assistant.

## Generic MCP Client

Any client that supports the Streamable HTTP transport can connect by pointing to:

```
http://localhost:3000/mcp/{projectId}
```

Replace `{projectId}` with the project ID from your `graph-memory.yaml` config, or the directory name if running in zero-config mode.

## Using the Connect Dialog

The Graph Memory Web UI includes a **Connect** dialog that shows the MCP URL for the currently selected project and provides copy-paste snippets for each client. Open the Web UI at `http://localhost:3000` and click the **Connect** button in the header.

## With Authentication

If your server has users configured, MCP clients need credentials to connect. Two methods are supported.

**OAuth 2.0** (recommended for Claude.ai and other chat clients that support the OAuth connector flow) -- see the [Claude.ai section](#claudeai) above and [Authentication → MCP authentication](../security/authentication.md#mcp-authentication) for details.

**API key header** (for Claude Code, Cursor, Windsurf, and any client that supports custom headers) -- add the key as a header:

```json
{
  "mcpServers": {
    "graph-memory": {
      "type": "http",
      "url": "http://localhost:3000/mcp/my-app",
      "headers": {
        "Authorization": "Bearer mgm-your-api-key-here"
      }
    }
  }
}
```

For Claude Code, pass the header via the CLI:

```bash
claude mcp add --transport http --scope project \
  --header "Authorization: Bearer mgm-your-api-key-here" \
  graph-memory http://localhost:3000/mcp/my-app
```

API keys are generated when you add a user with the CLI:

```bash
graphmemory users add --config graph-memory.yaml
```
