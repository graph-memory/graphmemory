# Contributing to Graph Memory

Contributions are welcome! By submitting a pull request you agree that your contributions will be licensed under the [Elastic License 2.0](LICENSE).

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Getting started

```bash
git clone https://github.com/graphmemory/graphmemory.git
cd graphmemory
npm install
npm run dev          # tsc --watch
npm test             # run all tests
npm run build        # production build
```

### Running locally

```bash
# Zero-config: indexes current directory
npm run cli:dev -- serve

# With config file
npm run cli:dev -- serve --config graph-memory.yaml
```

Open http://localhost:3000 for the web UI.

## Project structure

```
src/
├── api/              # MCP tools + REST API + WebSocket
│   ├── tools/        # MCP tool handlers (one file per tool)
│   └── rest/         # Express routers
├── cli/              # CLI entry point (commander)
├── graphs/           # Six graph managers (docs, code, knowledge, files, tasks, skills)
├── lib/              # Core libraries (parsers, embedder, config, access control)
└── tests/            # Jest test suites
ui/src/               # React + MUI web interface
docs/                 # Documentation (markdown)
```

## Development workflow

1. Create a branch from `main`
2. Make your changes
3. Add or update tests
4. Run `npm test` — all tests must pass
5. Run `npm run build` — must compile without errors
6. Submit a pull request

## Writing tests

- Tests use **Jest** with **ts-jest**
- Test files go in `src/tests/` with `.test.ts` extension
- MCP tool tests use `InMemoryTransport.createLinkedPair()` + `Client` from the MCP SDK
- REST tests use **supertest** with `createRestApp()`
- Use `unitVec()` and `embedFnPair()` from `src/tests/helpers.ts` for fake embeddings

```typescript
// Example: MCP tool test
import { setupMcpClient, type McpTestContext } from '@/tests/helpers';

let ctx: McpTestContext;
beforeAll(async () => { ctx = await setupMcpClient(); });
afterAll(async () => { await ctx.cleanup(); });

it('should list tools', async () => {
  const { tools } = await ctx.client.listTools();
  expect(tools.length).toBeGreaterThan(0);
});
```

## Guidelines

- TypeScript strict mode — no implicit `any`, no unused variables
- Follow existing code patterns and naming conventions
- Keep PRs focused — one feature or fix per PR
- Add tests for new features and bug fixes
- Update docs if you change public APIs or behavior
- Don't add unnecessary dependencies

## Reporting issues

Open an issue on GitHub with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS

## Security issues

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities privately.
