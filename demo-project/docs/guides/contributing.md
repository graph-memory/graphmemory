# Contributing Guide

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure
4. Set up the database: `npm run migrate`
5. Run tests to verify: `npm test`
6. Start development server: `npm run dev`

## Branch Strategy

- `main` — production-ready code
- `develop` — integration branch for next release
- `feature/*` — new features
- `fix/*` — bug fixes
- `chore/*` — maintenance, deps, config

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add task time tracking
fix: correct overdue calculation for cancelled tasks
docs: update API reference for webhooks
chore: upgrade TypeScript to 5.4
refactor: extract validation utilities
test: add service tests for notification delivery
```

## Pull Request Process

1. Create a feature branch from `develop`
2. Implement changes with tests
3. Ensure `npm test` passes
4. Ensure `npm run build` succeeds
5. Update documentation if needed
6. Open PR against `develop`
7. Request review from at least one team member
8. Squash merge when approved

## Code Style

- **TypeScript strict mode** — no implicit `any`, no unused vars
- **Functional style** — prefer immutable data, pure functions
- **Explicit types** — avoid relying on inference for public APIs
- **Error handling** — use typed error classes, not string throws
- **Naming** — camelCase for variables/functions, PascalCase for classes/types

## Project Structure

```
src/
  models/         # Domain entities with business methods
  services/       # Business logic and orchestration
  controllers/    # HTTP request/response handling
  middleware/     # Cross-cutting concerns
  utils/          # Reusable utilities
  config/         # Configuration management
  types/          # TypeScript type definitions
docs/
  architecture/   # Design documents
  api/            # API reference
  guides/         # How-to guides
```

## Adding a New Feature

1. **Types first** — add types to `src/types/index.ts`
2. **Model** — create domain model in `src/models/`
3. **Service** — implement business logic in `src/services/`
4. **Controller** — add HTTP handler in `src/controllers/`
5. **Tests** — write unit + integration tests
6. **Docs** — update API reference and guides

## Reporting Issues

Use GitHub Issues with one of these templates:
- **Bug Report** — steps to reproduce, expected vs actual behavior
- **Feature Request** — description, motivation, proposed solution
- **Performance** — benchmark data, profiling results

## Code Review Checklist

- [ ] Tests pass and cover new code
- [ ] No security vulnerabilities introduced
- [ ] Error cases handled appropriately
- [ ] Documentation updated
- [ ] No breaking API changes without version bump
- [ ] Performance impact considered
