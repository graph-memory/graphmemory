# Testing Guide

## Test Strategy

TaskFlow uses a layered testing approach:

1. **Unit tests** — individual functions, models, and utilities
2. **Service tests** — business logic with mocked stores
3. **Integration tests** — full API request/response cycle
4. **E2E tests** — complete user flows

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Specific file
npm test -- --testPathPatterns=task-service

# Coverage report
npm run test:coverage
```

## Writing Tests

### Model Tests

```typescript
import { TaskModel } from '../models/task'

describe('TaskModel', () => {
  it('should create task with defaults', () => {
    const task = new TaskModel({
      title: 'Test task',
      projectId: 'proj-1',
      reporterId: 'user-1',
    })

    expect(task.title).toBe('Test task')
    expect(task.status).toBe('backlog')
    expect(task.priority).toBe('medium')
    expect(task.type).toBe('feature')
  })

  it('should track overdue status', () => {
    const task = new TaskModel({
      title: 'Overdue task',
      projectId: 'proj-1',
      reporterId: 'user-1',
      dueDate: Date.now() - 86400000, // yesterday
    })

    expect(task.isOverdue).toBe(true)
  })

  it('should manage completedAt on status change', () => {
    const task = new TaskModel({
      title: 'Task',
      projectId: 'proj-1',
      reporterId: 'user-1',
    })

    task.moveTo('done')
    expect(task.completedAt).toBeDefined()

    task.moveTo('in_progress')
    expect(task.completedAt).toBeUndefined()
  })
})
```

### Service Tests

```typescript
import { TaskService } from '../services/task-service'
import { EventBus } from '../utils/event-bus'

describe('TaskService', () => {
  let service: TaskService
  let mockStore: jest.Mocked<any>
  let events: EventBus

  beforeEach(() => {
    events = new EventBus()
    mockStore = {
      findById: jest.fn(),
      findByProject: jest.fn().mockResolvedValue([]),
      countByProject: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
      delete: jest.fn(),
      saveActivity: jest.fn(),
      getActivities: jest.fn().mockResolvedValue([]),
      findSubtasks: jest.fn().mockResolvedValue([]),
      getMaxPosition: jest.fn().mockResolvedValue(0),
      search: jest.fn().mockResolvedValue([]),
    }
    service = new TaskService(mockStore, events)
  })

  it('should create task and emit event', async () => {
    const emitSpy = jest.spyOn(events, 'emit')

    const task = await service.create('proj-1', 'user-1', {
      title: 'New task',
      priority: 'high',
    })

    expect(task.title).toBe('New task')
    expect(task.priority).toBe('high')
    expect(mockStore.save).toHaveBeenCalled()
    expect(emitSpy).toHaveBeenCalledWith('task.created', expect.any(Object))
  })
})
```

## Test Utilities

### Factory Functions

Create test data consistently:

```typescript
function createTestUser(overrides: Partial<User> = {}) {
  return new UserModel({
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    passwordHash: 'hashed:password:0',
    ...overrides,
  })
}

function createTestTask(overrides: Partial<Task> = {}) {
  return new TaskModel({
    title: 'Test Task',
    projectId: 'proj-test',
    reporterId: 'user-test',
    ...overrides,
  })
}
```

### Mock Event Bus

Capture emitted events for assertions:

```typescript
function captureEvents(bus: EventBus) {
  const captured: Array<{ event: string; args: any[] }> = []
  const originalEmit = bus.emit.bind(bus)
  bus.emit = (event: string, ...args: any[]) => {
    captured.push({ event, args })
    originalEmit(event, ...args)
  }
  return captured
}
```

## Coverage Requirements

| Area | Target |
|------|--------|
| Models | 95% |
| Services | 90% |
| Controllers | 85% |
| Utilities | 90% |
| Overall | 85% |

## CI Integration

Tests run on every pull request via GitHub Actions:

```yaml
- name: Run tests
  run: npm test -- --coverage --ci
  env:
    DB_HOST: localhost
    DB_NAME: taskflow_test
    JWT_SECRET: test-secret
```
