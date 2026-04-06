# Getting Started

Welcome to the test sandbox project.

## Installation

Run the following command to install dependencies:

```bash
npm install test-sandbox
```

## Quick Start

```typescript
import { Sandbox } from 'test-sandbox';

const sb = new Sandbox({ name: 'demo' });
sb.run();
```

## Configuration

You can configure the sandbox with these options:

- `name` — project name
- `verbose` — enable debug logging
- `timeout` — max execution time in ms

## API Reference

See the [API docs](api.md) for full reference.
