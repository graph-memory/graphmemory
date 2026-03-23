import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import type { ProjectManager } from '@/lib/project-manager';
import type { ServerConfig, UserConfig, GraphName } from '@/lib/multi-config';
import { GRAPH_NAMES } from '@/lib/multi-config';
import { resolveAccess, resolveUserFromApiKey, canRead, canWrite } from '@/lib/access';
import {
  verifyPassword, signAccessToken, signRefreshToken,
  verifyToken, setAuthCookies, clearAuthCookies,
  getAccessToken, getRefreshToken, resolveUserByEmail,
} from '@/lib/jwt';
import { createKnowledgeRouter } from '@/api/rest/knowledge';
import { createTasksRouter } from '@/api/rest/tasks';
import { createSkillsRouter } from '@/api/rest/skills';
import { createDocsRouter } from '@/api/rest/docs';
import { createCodeRouter } from '@/api/rest/code';
import { createFilesRouter } from '@/api/rest/files';
import { createToolsRouter } from '@/api/rest/tools';
import { createEmbedRouter } from '@/api/rest/embed';
import { scanTeamDir } from '@/lib/team';
import { RATE_LIMIT_WINDOW_MS } from '@/lib/defaults';

export interface RestAppOptions {
  serverConfig?: ServerConfig;
  users?: Record<string, UserConfig>;
  embeddingApiModelNames?: { default: string; code: string };
}

/**
 * Express middleware: reject if accessLevel (set by requireGraphAccess) is not 'rw'.
 * Use on POST/PUT/DELETE routes inside domain routers.
 */
export function requireWriteAccess(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const level = (req as any).accessLevel;
  if (level && level !== 'rw') {
    res.status(403).json({ error: 'Read-only access' });
    return;
  }
  next();
}

/**
 * Create an Express app with all REST routes mounted.
 * Each route uses the ProjectManager to look up project-specific graphs.
 */
export function createRestApp(projectManager: ProjectManager, options?: RestAppOptions): express.Express {
  const app = express();
  const serverConfig = options?.serverConfig;
  const users = options?.users ?? {};
  const hasUsers = Object.keys(users).length > 0;

  const corsOrigins = serverConfig?.corsOrigins;
  app.use(cors(corsOrigins?.length ? { origin: corsOrigins, credentials: true } : { credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // --- Rate limiting ---
  const rl = serverConfig?.rateLimit;
  const rateLimitMsg = { error: 'Too many requests, please try again later' };

  if (rl && rl.global > 0) {
    app.use('/api/', rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: rl.global, standardHeaders: true, legacyHeaders: false, message: rateLimitMsg }));
  }
  if (rl && rl.search > 0) {
    const searchLimiter = rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: rl.search, standardHeaders: true, legacyHeaders: false, message: rateLimitMsg });
    app.use('/api/projects/:projectId/knowledge/search', searchLimiter);
    app.use('/api/projects/:projectId/tasks/search', searchLimiter);
    app.use('/api/projects/:projectId/skills/search', searchLimiter);
    app.use('/api/projects/:projectId/docs/search', searchLimiter);
    app.use('/api/projects/:projectId/code/search', searchLimiter);
    app.use('/api/projects/:projectId/files/search', searchLimiter);
    app.use('/api/embed', searchLimiter);
  }
  if (rl && rl.auth > 0) {
    app.use('/api/auth/login', rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: rl.auth, standardHeaders: true, legacyHeaders: false, message: rateLimitMsg }));
  }

  const jwtSecret = serverConfig?.jwtSecret;
  const cookieSecure = serverConfig?.cookieSecure;
  const accessTokenTtl = serverConfig?.accessTokenTtl ?? '15m';
  const refreshTokenTtl = serverConfig?.refreshTokenTtl ?? '7d';

  // --- Auth endpoints (before auth middleware — always accessible) ---

  // Auth status: check cookie JWT or Bearer apiKey
  app.get('/api/auth/status', (req, res) => {
    if (!hasUsers) return res.json({ required: false, authenticated: false });

    // 1. Cookie JWT
    if (jwtSecret) {
      const accessToken = getAccessToken(req);
      if (accessToken) {
        const payload = verifyToken(accessToken, jwtSecret);
        if (payload?.type === 'access' && users[payload.userId]) {
          const user = users[payload.userId];
          return res.json({ required: true, authenticated: true, userId: payload.userId, name: user.name });
        }
      }
    }

    // 2. Bearer apiKey
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const result = resolveUserFromApiKey(auth.slice(7), users);
      if (result) return res.json({ required: true, authenticated: true, userId: result.userId, name: result.user.name });
    }

    return res.json({ required: true, authenticated: false });
  });

  // API key retrieval: requires valid JWT cookie (not exposed in /status)
  app.get('/api/auth/apikey', (req, res) => {
    if (!hasUsers || !jwtSecret) {
      return res.status(400).json({ error: 'Authentication not configured' });
    }
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const payload = verifyToken(accessToken, jwtSecret);
    if (!payload || payload.type !== 'access' || !users[payload.userId]) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const user = users[payload.userId];
    res.json({ apiKey: user.apiKey ?? null });
  });

  // Login: email + password → set JWT cookies
  app.post('/api/auth/login', async (req, res) => {
    if (!hasUsers || !jwtSecret) {
      return res.status(400).json({ error: 'Authentication not configured' });
    }
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = resolveUserByEmail(email, users);
    if (!result || !result.user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, result.user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = signAccessToken(result.userId, jwtSecret, accessTokenTtl);
    const refreshToken = signRefreshToken(result.userId, jwtSecret, refreshTokenTtl);
    setAuthCookies(res, accessToken, refreshToken, accessTokenTtl, refreshTokenTtl, cookieSecure);

    res.json({ userId: result.userId, name: result.user.name });
  });

  // Refresh: refresh cookie → new access cookie
  app.post('/api/auth/refresh', (req, res) => {
    if (!hasUsers || !jwtSecret) {
      return res.status(400).json({ error: 'Authentication not configured' });
    }

    const refreshToken = getRefreshToken(req);
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const payload = verifyToken(refreshToken, jwtSecret);
    if (!payload || payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Check user still exists
    if (!users[payload.userId]) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const newAccessToken = signAccessToken(payload.userId, jwtSecret, accessTokenTtl);
    const newRefreshToken = signRefreshToken(payload.userId, jwtSecret, refreshTokenTtl);
    setAuthCookies(res, newAccessToken, newRefreshToken, accessTokenTtl, refreshTokenTtl, cookieSecure);

    res.json({ userId: payload.userId, name: users[payload.userId].name });
  });

  // Logout: clear cookies
  app.post('/api/auth/logout', (_req, res) => {
    clearAuthCookies(res);
    res.json({ ok: true });
  });

  // --- Auth middleware: cookie JWT → Bearer apiKey → anonymous ---
  if (hasUsers) {
    app.use('/api/', (req, _res, next) => {
      // 1. Cookie JWT (from UI login)
      if (jwtSecret) {
        const accessToken = getAccessToken(req);
        if (accessToken) {
          const payload = verifyToken(accessToken, jwtSecret);
          if (payload?.type === 'access' && users[payload.userId]) {
            (req as any).userId = payload.userId;
            (req as any).user = users[payload.userId];
            return next();
          }
          // Invalid/expired JWT cookie — don't reject, fall through to Bearer
        }
      }

      // 2. Bearer apiKey (from MCP/API clients)
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ') && auth.length > 7) {
        const apiKey = auth.slice(7);
        const result = resolveUserFromApiKey(apiKey, users);
        if (result) {
          (req as any).userId = result.userId;
          (req as any).user = result.user;
          return next();
        }
        // Invalid Bearer token — reject (explicit auth attempt should not fall through)
        return _res.status(401).json({ error: 'Invalid API key' });
      }

      // 3. No auth = anonymous (uses defaultAccess)
      next();
    });
  }

  // Project resolution middleware — injects project instance into req
  app.param('projectId', (req, _res, next, projectId: string) => {
    const project = projectManager.getProject(projectId);
    if (!project) {
      return _res.status(404).json({ error: `Project "${projectId}" not found` });
    }
    (req as any).project = project;
    next();
  });

  // List projects
  app.get('/api/projects', (_req, res) => {
    const userId = (_req as any).userId as string | undefined;
    const projects = projectManager.listProjects().map(id => {
      const p = projectManager.getProject(id)!;
      const gc = p.config.graphConfigs;
      const ws = p.workspaceId ? projectManager.getWorkspace(p.workspaceId) : undefined;

      // Per-graph info: enabled, readonly, access level for current user
      const graphs: Record<string, { enabled: boolean; readonly: boolean; access: string | null }> = {};
      for (const gn of GRAPH_NAMES) {
        let access: string | null = serverConfig
          ? resolveAccess(userId, gn, p.config, serverConfig, ws?.config)
          : 'rw';
        // Cap access for readonly graphs
        if (access === 'rw' && gc[gn].readonly) access = 'r';
        graphs[gn] = { enabled: gc[gn].enabled, readonly: gc[gn].readonly, access: gc[gn].enabled ? access : null };
      }

      return {
        id,
        workspaceId: p.workspaceId ?? null,
        graphs,
        stats: {
          docs:      p.docGraph      ? p.docGraph.order      : 0,
          code:      p.codeGraph     ? p.codeGraph.order      : 0,
          knowledge: p.knowledgeGraph ? p.knowledgeGraph.order : 0,
          files:     p.fileIndexGraph ? p.fileIndexGraph.order : 0,
          tasks:     p.taskGraph     ? p.taskGraph.order      : 0,
          skills:    p.skillGraph    ? p.skillGraph.order     : 0,
        },
      };
    });
    res.json({ results: projects });
  });

  // List workspaces
  app.get('/api/workspaces', (_req, res) => {
    const workspaces = projectManager.listWorkspaces().map(id => {
      const ws = projectManager.getWorkspace(id)!;
      return {
        id,
        projects: ws.config.projects,
      };
    });
    res.json({ results: workspaces });
  });

  // Project stats
  app.get('/api/projects/:projectId/stats', (req, res) => {
    const p = (req as any).project;
    res.json({
      docs:      p.docGraph      ? { nodes: p.docGraph.order,      edges: p.docGraph.size }      : null,
      code:      p.codeGraph     ? { nodes: p.codeGraph.order,     edges: p.codeGraph.size }     : null,
      knowledge: p.knowledgeGraph ? { nodes: p.knowledgeGraph.order, edges: p.knowledgeGraph.size } : null,
      fileIndex: p.fileIndexGraph ? { nodes: p.fileIndexGraph.order, edges: p.fileIndexGraph.size } : null,
      tasks:     p.taskGraph     ? { nodes: p.taskGraph.order,      edges: p.taskGraph.size }     : null,
      skills:    p.skillGraph    ? { nodes: p.skillGraph.order,     edges: p.skillGraph.size }    : null,
    });
  });

  // Team members (workspace: shared .team/ in mirrorDir; standalone: .team/ in projectDir)
  // Requires at least read access to any graph in the project
  app.get('/api/projects/:projectId/team', (req, res) => {
    if (serverConfig && hasUsers) {
      const userId = (req as any).userId as string | undefined;
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const p = (req as any).project;
      const ws = p.workspaceId ? projectManager.getWorkspace(p.workspaceId) : undefined;
      const hasAnyAccess = GRAPH_NAMES.some(gn =>
        canRead(resolveAccess(userId, gn, p.config, serverConfig, ws?.config)),
      );
      if (!hasAnyAccess) return res.status(403).json({ error: 'Access denied' });
    }
    const p = (req as any).project;
    const ws = p.workspaceId ? projectManager.getWorkspace(p.workspaceId) : undefined;
    const baseDir = ws ? ws.config.mirrorDir : p.config.projectDir;
    const members = scanTeamDir(path.join(baseDir, '.team'));
    res.json({ results: members });
  });

  // Middleware: require a specific manager to be enabled, or return 404
  function requireManager(managerKey: keyof import('@/lib/project-manager').ProjectInstance) {
    return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      const p = (req as any).project;
      if (!p || !p[managerKey]) {
        return _res.status(404).json({ error: 'This graph is disabled for this project' });
      }
      next();
    };
  }

  // Middleware: check access level for a graph (read or read-write)
  function requireGraphAccess(graphName: GraphName, level: 'r' | 'rw') {
    return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      const p = (req as any).project;

      // Graph-level readonly: enforce even without auth config
      const isReadonly = p?.config.graphConfigs[graphName]?.readonly;
      if (isReadonly) {
        (req as any).accessLevel = 'r';
      }

      if (!serverConfig) return next(); // no config = no auth enforcement
      if (!p) return next();
      const userId = (req as any).userId as string | undefined;
      const ws = p.workspaceId ? projectManager.getWorkspace(p.workspaceId) : undefined;
      let access = resolveAccess(userId, graphName, p.config, serverConfig, ws?.config);
      // Graph-level readonly: cap to 'r' regardless of user permissions
      if (access === 'rw' && p.config.graphConfigs[graphName]?.readonly) {
        access = 'r';
      }
      if (!canRead(access)) {
        return _res.status(403).json({ error: 'Access denied' });
      }
      if (level === 'rw' && !canWrite(access)) {
        return _res.status(403).json({ error: 'Read-only access' });
      }
      (req as any).accessLevel = access;
      next();
    };
  }

  // Helper: combine requireManager + read access check
  function graphMiddleware(managerKey: keyof import('@/lib/project-manager').ProjectInstance, graphName: GraphName) {
    return [requireManager(managerKey), requireGraphAccess(graphName, 'r')];
  }

  // Mount domain routers (gated by manager existence + read access)
  // Mutation endpoints (POST/PUT/DELETE) inside routers check req.accessLevel for write access
  app.use('/api/projects/:projectId/knowledge', ...graphMiddleware('knowledgeManager', 'knowledge'), createKnowledgeRouter());
  app.use('/api/projects/:projectId/tasks', ...graphMiddleware('taskManager', 'tasks'), createTasksRouter());
  app.use('/api/projects/:projectId/skills', ...graphMiddleware('skillManager', 'skills'), createSkillsRouter());
  app.use('/api/projects/:projectId/docs', ...graphMiddleware('docManager', 'docs'), createDocsRouter());
  app.use('/api/projects/:projectId/code', ...graphMiddleware('codeManager', 'code'), createCodeRouter());
  app.use('/api/projects/:projectId/files', ...graphMiddleware('fileIndexManager', 'files'), createFilesRouter());
  app.use('/api/projects/:projectId/tools', createToolsRouter(projectManager, (req, graphName, level) => {
    if (!serverConfig) return true;
    const p = (req as any).project;
    if (!p) return true;
    const userId = (req as any).userId as string | undefined;
    const ws = p.workspaceId ? projectManager.getWorkspace(p.workspaceId) : undefined;
    let access = resolveAccess(userId, graphName, p.config, serverConfig, ws?.config);
    if (access === 'rw' && p.config.graphConfigs[graphName as GraphName]?.readonly) access = 'r';
    if (level === 'rw') return canWrite(access);
    return canRead(access);
  }));

  // Embedding API (optional, gated by server.embeddingApi.enabled)
  if (serverConfig?.embeddingApi?.enabled && options?.embeddingApiModelNames) {
    app.use('/api/embed', createEmbedRouter(serverConfig.embeddingApi, options.embeddingApiModelNames));
  }

  // Serve UI at /ui/ path — check dist/ui/ (npm package) then ui/dist/ (dev)
  const uiDistPkg = path.resolve(__dirname, '../../ui');
  const uiDistDev = path.resolve(__dirname, '../../../ui/dist');
  const uiDist = fs.existsSync(uiDistPkg) ? uiDistPkg : uiDistDev;

  // Redirect root to /ui/
  app.get('/', (_req, res) => { res.redirect('/ui/'); });

  // Static files under /ui/
  app.use('/ui', express.static(uiDist, { redirect: false, index: false }));

  // SPA fallback: serve index.html for all /ui/* routes
  const indexHtml = path.join(uiDist, 'index.html');
  app.use('/ui', (_req, res, next) => {
    // Skip requests for actual files (assets with extensions like .js, .css, .png)
    if (_req.path.includes('.') && !_req.path.endsWith('.html')) return next();
    res.sendFile(indexHtml, { dotfiles: 'allow' }, (err) => {
      if (err) next();
    });
  });

  // Error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.name === 'ZodError') {
      const fields = (err.issues ?? []).map((i: any) => ({
        path: i.path?.join('.'),
        message: i.message,
      }));
      return res.status(400).json({ error: 'Validation error', fields });
    }
    if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    process.stderr.write(`[rest] Error: ${err.stack || err}\n`);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
