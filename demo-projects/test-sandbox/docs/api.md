# API Reference

## Sandbox class

### Constructor

```typescript
new Sandbox(options: SandboxOptions)
```

### Methods

#### `run()`

Starts the sandbox execution.

```typescript
sb.run(): Promise<void>
```

#### `stop()`

Stops the sandbox gracefully.

```typescript
sb.stop(): void
```

#### `getStatus()`

Returns current sandbox status.

```typescript
sb.getStatus(): 'idle' | 'running' | 'stopped'
```

## Types

### SandboxOptions

```typescript
interface SandboxOptions {
  name: string;
  verbose?: boolean;
  timeout?: number;
}
```
