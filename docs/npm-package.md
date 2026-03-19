# npm Package

## Package info

| Field | Value |
|-------|-------|
| **Name** | `@prih/mcp-graph-memory` |
| **Registry** | https://www.npmjs.com/package/@prih/mcp-graph-memory |
| **License** | ISC |
| **Node.js** | >= 22 |

## Installation

```bash
npm install -g @prih/mcp-graph-memory
```

Or use `npx`:

```bash
npx @prih/mcp-graph-memory serve --config graph-memory.yaml
```

## CLI binary

After global installation, the `mcp-graph-memory` command is available:

```bash
mcp-graph-memory serve --config graph-memory.yaml
mcp-graph-memory mcp --config graph-memory.yaml --project my-app
mcp-graph-memory index --config graph-memory.yaml --project my-app
mcp-graph-memory users add --config graph-memory.yaml
```

See [CLI](cli.md) for full command reference.

## What's included

The npm package includes:
- `dist/` — compiled server + UI
- `README.md`

Published files are defined in `package.json`:
```json
{
  "files": ["dist/", "README.md"],
  "bin": {
    "mcp-graph-memory": "dist/cli/index.js"
  }
}
```

## Publishing

Published automatically via GitHub Actions on version tags (`v*`):

```yaml
# .github/workflows/npm.yml
on:
  push:
    tags: ['v*']
```

Workflow:
1. Checkout code
2. Setup Node.js 24
3. `npm ci` (server + UI deps)
4. `npm run build` (server + UI)
5. `npm publish` (to npmjs.org)

### Manual publish

```bash
npm run build           # Build server + UI
npm publish             # Publish to npm
```

## Build from source

```bash
git clone https://github.com/prih/mcp-graph-memory.git
cd mcp-graph-memory
npm install
cd ui && npm install && cd ..
npm run build
```

### Development

```bash
npm run dev             # tsc --watch (server)
npm run cli:dev         # Run CLI without build (tsx)
cd ui && npm run dev    # Vite dev server on :5173
```

## Using as MCP server

### With Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "project-memory": {
      "command": "npx",
      "args": [
        "@prih/mcp-graph-memory",
        "mcp",
        "--config", "/path/to/graph-memory.yaml",
        "--project", "my-app"
      ]
    }
  }
}
```

### With HTTP transport

Start the server:
```bash
npx @prih/mcp-graph-memory serve --config graph-memory.yaml
```

Connect MCP client to `http://localhost:3000/mcp/{projectId}`.

## Version management

Version is in `package.json`. To release:

```bash
npm version patch   # or minor, major
git push --tags     # Triggers CI: npm publish + Docker build
```
