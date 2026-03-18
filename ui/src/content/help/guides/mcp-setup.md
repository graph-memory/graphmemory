# Connecting MCP Clients

Graph Memory supports two transport modes for MCP clients: **stdio** (single project) and **Streamable HTTP** (multi-project). Choose the right one for your setup.

## Stdio transport

Best for: single-project setups, IDE integrations where each project gets its own MCP server process.

The MCP client launches the server as a subprocess. Communication happens over stdin/stdout.

### Claude Desktop (stdio)

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": [
        "/path/to/mcp-graph-memory/dist/cli/index.js",
        "mcp",
        "--config", "/path/to/graph-memory.yaml",
        "--project", "my-app"
      ]
    }
  }
}
```

Replace `/path/to/mcp-graph-memory` with the actual install path, and `my-app` with the project ID from your `graph-memory.yaml`.

### Claude Code (stdio)

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": [
        "/path/to/mcp-graph-memory/dist/cli/index.js",
        "mcp",
        "--config", "/path/to/graph-memory.yaml",
        "--project", "my-app"
      ]
    }
  }
}
```

## HTTP transport (Streamable HTTP)

Best for: multi-project setups, shared team servers, or when multiple clients need to access the same graphs simultaneously.

Start the server first:

```bash
node /path/to/mcp-graph-memory/dist/cli/index.js serve --config graph-memory.yaml
```

Each project gets its own MCP endpoint at `http://localhost:3000/mcp/{projectId}`.

### Claude Desktop (HTTP)

```json
{
  "mcpServers": {
    "project-memory": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp/my-app"
    }
  }
}
```

### Cursor / Windsurf / Other clients

Use the Streamable HTTP URL directly:

```
http://localhost:3000/mcp/{projectId}
```

Most MCP clients support Streamable HTTP transport. Enter the URL in your client's MCP server configuration.

## Docker

When running via Docker, the HTTP transport is the only option (stdio requires a local process).

```bash
docker run -d \
  --name graph-memory \
  -p 3000:3000 \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app \
  -v graph-memory-models:/data/models \
  ghcr.io/prih/mcp-graph-memory
```

Then connect your MCP client to `http://localhost:3000/mcp/my-app`.

To index once and exit without starting the server:

```bash
# Docker
docker run --rm \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app \
  -v graph-memory-models:/data/models \
  ghcr.io/prih/mcp-graph-memory index --config /data/config/graph-memory.yaml

# Docker Compose (uses volumes defined in your compose file)
docker compose run --rm graph-memory index --config /data/config/graph-memory.yaml
```

## Which transport to choose?

| | Stdio | HTTP |
|---|---|---|
| **Projects** | One per process | Multiple from one server |
| **Clients** | One client per server | Many clients share one server |
| **Web UI** | Not available | Available at `http://localhost:3000` |
| **REST API** | Not available | Available at `/api/*` |
| **WebSocket** | Not available | Real-time updates via `/api/ws` |
| **Setup** | Client manages process | You start the server separately |
| **Best for** | IDE integration | Teams, multi-project, Docker |

## Troubleshooting

**Model loading is slow on first start**: The embedding model (~90MB) is downloaded on first use. Subsequent starts use the cached model from `~/.graph-memory/models/` (or the configured `modelsDir`).

**Port already in use**: Change the port in `graph-memory.yaml` under `server.port`, or stop the existing process.

**Tools not showing up**: Make sure `docsPattern` and/or `codePattern` are set in your config. Without patterns, only file index, knowledge, task, and skill tools are registered.

**Config changes not taking effect**: The `serve` command watches `graph-memory.yaml` for changes automatically. For `mcp` (stdio), you need to restart the process.
