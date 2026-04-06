# Connecting MCP Clients

Graph Memory uses HTTP transport for MCP clients. Start the server, then connect your client to the MCP endpoint.

## Setup

Start the server first:

```bash
graphmemory serve --config graph-memory.yaml
```

Each project gets its own MCP endpoint at `http://localhost:3000/mcp/{projectId}`.

### Claude Desktop

Add via **Settings > Connectors** in the Claude Desktop app, enter the URL:

```
http://localhost:3000/mcp/my-app
```

### Claude Code

Run in your project directory:

```bash
claude mcp add --transport http --scope project graph-memory http://localhost:3000/mcp/my-app
```

Or add to `.mcp.json` manually:

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

### Cursor / Windsurf / Other clients

Enter the MCP URL directly in your client's server configuration:

```
http://localhost:3000/mcp/{projectId}
```

## Docker

```bash
docker run -d \
  --name graph-memory \
  -p 3000:3000 \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server
```

Then connect your MCP client to `http://localhost:3000/mcp/my-app`.

To index once and exit without starting the server:

```bash
# Docker
docker run --rm \
  -v $(pwd)/graph-memory.yaml:/data/config/graph-memory.yaml:ro \
  -v /path/to/my-app:/data/projects/my-app \
  -v graph-memory-models:/data/models \
  ghcr.io/graph-memory/graphmemory-server index --config /data/config/graph-memory.yaml

# Docker Compose (uses volumes defined in your compose file)
docker compose run --rm graph-memory index --config /data/config/graph-memory.yaml
```

## Troubleshooting

**Model loading is slow on first start**: The embedding model (`Xenova/jina-embeddings-v2-small-en`, ~33MB) is downloaded on first use. Subsequent starts use the cached model from `~/.graph-memory/models/` (or the configured `modelsDir`).

**Port already in use**: Change the port in `graph-memory.yaml` under `server.port`, or stop the existing process.

**Tools not showing up**: Make sure `graphs.docs.include` and/or `graphs.code.include` are set in your config (defaults: `**/*.md` and `**/*.{js,ts,jsx,tsx}`). If a graph is `enabled: false`, its tools won't be registered.

**Config changes not taking effect**: Restart the server process to apply changes to `graph-memory.yaml`.
