# npm Package

## Package info

| Field | Value |
|-------|-------|
| **Name** | `@graphmemory/server` |
| **Registry** | https://www.npmjs.com/package/@graphmemory/server |
| **License** | Elastic License 2.0 (ELv2) |
| **Node.js** | >= 22 |

## Installation

```bash
npm install -g @graphmemory/server
```

Or use `npx` without installing:

```bash
cd /path/to/my-project
npx @graphmemory/server serve
```

## CLI binary

After global installation, the `graphmemory` command is available:

```bash
# Zero-config: use current directory as project
cd /path/to/my-project
graphmemory serve

# With config file
graphmemory serve --config graph-memory.yaml
graphmemory index --config graph-memory.yaml --project my-app
graphmemory users add --config graph-memory.yaml
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
    "graphmemory": "dist/cli/index.js"
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
git clone https://github.com/graph-memory/graphmemory.git
cd graphmemory
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

Start the server:
```bash
npx @graphmemory/server serve --config graph-memory.yaml
```

Connect MCP client to `http://localhost:3000/mcp/{projectId}`.

## Version management

Version is in `package.json`. To release:

```bash
npm version patch   # or minor, major
git push --tags     # Triggers CI: npm publish + Docker build
```
