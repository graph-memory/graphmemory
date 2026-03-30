# REST API Patterns

Design patterns and conventions used in the Express REST API.

## Architecture

```
Express app
  ├── cookie-parser middleware
  ├── CORS middleware (credentials: true)
  ├── JSON body parser
  ├── Security headers (nosniff, DENY frame)
  ├── Auth endpoints (login, refresh, logout, status, apikey) — no auth required (apikey verifies JWT internally)
  ├── Auth middleware (cookie JWT → Bearer apiKey → anonymous)
  ├── app.param('projectId') — project resolver
  ├── Domain routers (knowledge, tasks, skills, docs, code, files, graph, tools)
  ├── Embed endpoint (optional, separate apiKey)
  ├── Static UI files + SPA fallback
  └── Error handler (Zod, JSON parse, 500)
```

## Route file structure

Each domain has a router factory function:

```typescript
export function createTasksRouter(): Router {
  const router = Router({ mergeParams: true });

  // Helper to get typed project instance
  const getProject = (req: Request) => (req as any).project as ProjectInstance;

  router.get('/', validateQuery(taskListSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { status, priority, tag, filter, assignee, limit } = (req as any).validatedQuery;
      const results = await p.taskManager.listTasks({ status, priority, tag, filter, assignee, limit });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // ... more routes

  return router;
}
```

## Middleware chain

For each domain router, middleware is composed:

```typescript
app.use('/api/projects/:projectId/tasks',
  requireManager('taskManager'),      // 404 if graph disabled
  requireGraphAccess('tasks', 'r'),   // 403 if denied
  createTasksRouter()
);
```

### `requireManager(key)`

Checks that the graph manager exists on the project instance. Returns 404 if the graph is disabled.

### `requireGraphAccess(graphName, level)`

Resolves ACL for the current user:
```
graph.access[userId] → project.access[userId] → workspace.access[userId]
  → server.access[userId] → server.defaultAccess
```

Sets `req.accessLevel` for downstream use.

### `requireWriteAccess`

Used on individual mutation routes (POST, PUT, DELETE):
```typescript
router.post('/', requireWriteAccess, validateBody(createTaskSchema), async (req, res, next) => {
```

Returns 403 if `accessLevel !== 'rw'`.

## Validation pattern

### Zod schemas

All request validation uses Zod schemas in `validation.ts`:

```typescript
export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(50000).optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  estimate: z.number().min(0).optional().nullable(),
  assignee: z.string().max(100).optional().nullable(),
});
```

### Validation middleware factories

```typescript
export function validateBody(schema: ZodSchema) {
  return (req, res, next) => {
    req.body = schema.parse(req.body);  // Throws ZodError if invalid
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req, res, next) => {
    (req as any).validatedQuery = schema.parse(req.query);
    next();
  };
}
```

Zod transforms coerce query string types (e.g. `z.coerce.number()` for `topK`).

## Mutation serialization

All write operations are wrapped in the project's `mutationQueue`:

```typescript
router.post('/', requireWriteAccess, validateBody(createTaskSchema), async (req, res, next) => {
  try {
    const p = getProject(req);
    const result = await p.mutationQueue.enqueue(async () => {
      return p.taskManager.createTask(req.body);
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
});
```

This ensures serial execution of all mutations within a project, even from concurrent REST + MCP requests.

## Version conflict handling

Update endpoints support optimistic concurrency via `version` field:

```typescript
router.put('/:taskId', requireWriteAccess, validateBody(updateTaskSchema), async (req, res, next) => {
  try {
    const result = await p.mutationQueue.enqueue(async () => {
      return p.taskManager.updateTask(taskId, req.body);
    });
    res.json(result);
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return res.status(409).json({
        error: 'version_conflict',
        current: err.current,
        expected: err.expected
      });
    }
    next(err);
  }
});
```

## Response conventions

| Operation | Status | Body |
|-----------|--------|------|
| List | 200 | `{ results: [...] }` |
| Get | 200 | `{ ...entity }` |
| Create | 201 | `{ ...created entity }` |
| Update | 200 | `{ ...updated entity }` |
| Delete | 204 | (empty) |
| Not found | 404 | `{ error: "message" }` |
| Validation | 400 | `{ error: "Validation error" }` |
| Auth required | 401 | `{ error: "message" }` |
| Forbidden | 403 | `{ error: "Read-only access" }` |
| Conflict | 409 | `{ error: "version_conflict", current, expected }` |
| Server error | 500 | `{ error: "Internal server error" }` |

## Auth middleware chain

Three-step authentication (in order):

```typescript
// 1. Cookie JWT (from UI login)
const accessToken = getAccessToken(req);  // req.cookies.mgm_access
if (accessToken) {
  const payload = verifyToken(accessToken, jwtSecret);
  if (payload?.type === 'access' && users[payload.userId]) {
    req.userId = payload.userId;
    req.user = users[payload.userId];
    return next();
  }
}

// 2. Bearer apiKey (from API clients)
const authHeader = req.headers.authorization;
if (authHeader?.startsWith('Bearer ')) {
  const key = authHeader.slice(7);
  const resolved = resolveUserFromApiKey(key, users);  // timing-safe
  if (resolved) {
    req.userId = resolved.userId;
    req.user = resolved.user;
    return next();
  }
  return res.status(401).json({ error: 'Invalid API key' });
}

// 3. No auth = anonymous (uses defaultAccess)
next();
```

## Attachment handling

### Upload (multipart)

```typescript
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/:taskId/attachments',
  requireWriteAccess,
  upload.single('file'),
  async (req, res, next) => {
    const file = req.file;
    const result = await p.mutationQueue.enqueue(() =>
      p.taskManager.addAttachment(taskId, file.originalname, file.buffer)
    );
    res.status(201).json(result);
  }
);
```

### Download (streaming)

```typescript
router.get('/:taskId/attachments/:filename', (req, res) => {
  const filename = attachmentFilenameSchema.parse(req.params.filename);
  const filePath = p.taskManager.getAttachmentPath(taskId, filename);
  res.setHeader('Content-Type', mime.getType(filePath) ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(filePath).pipe(res);
});
```

### Filename validation

Zod schema rejects: path separators (`/`, `\`), parent traversal (`..`), null bytes. Max 255 bytes.

## Error handling

Centralized error handler at the end of the middleware chain:

```typescript
app.use((err, req, res, next) => {
  if (err.name === 'ZodError') return res.status(400).json({ error: 'Validation error' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});
```

Every route handler wraps logic in `try { ... } catch (err) { next(err); }` to delegate to this handler.

## Tools explorer

The tools router (`tools.ts`) creates a **lazy in-memory MCP client** per project:

1. On first call, creates an `InMemoryTransport` pair
2. Connects a full MCP server with all graphs + managers
3. Caches the client on the project instance
4. `GET /tools` → `client.listTools()` with category mapping
5. `POST /tools/:name/call` → `client.callTool()` with duration measurement

This means the tools explorer uses the exact same tool implementations as real MCP clients.

## SPA fallback

```typescript
app.use(express.static(path.join(__dirname, '..', 'ui')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/mcp/')) return next();
  res.sendFile(path.join(__dirname, '..', 'ui', 'index.html'));
});
```

Non-API, non-MCP routes return `index.html` for React Router's client-side routing.
