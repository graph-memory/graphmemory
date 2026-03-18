import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import type { ProjectManager } from '@/lib/project-manager';
import type { ServerConfig, UserConfig, GraphName } from '@/lib/multi-config';
import { GRAPH_NAMES } from '@/lib/multi-config';
import { resolveAccess, resolveUserFromApiKey, canRead, canWrite } from '@/lib/access';
import { createKnowledgeRouter } from '@/api/rest/knowledge';
import { createTasksRouter } from '@/api/rest/tasks';
import { createSkillsRouter } from '@/api/rest/skills';
import { createDocsRouter } from '@/api/rest/docs';
import { createCodeRouter } from '@/api/rest/code';
import { createFilesRouter } from '@/api/rest/files';
import { createGraphRouter } from '@/api/rest/graph';
import { createToolsRouter } from '@/api/rest/tools';
import { createEmbedRouter } from '@/api/rest/embed';
import { scanTeamDir } from '@/lib/team';

export interface RestAppOptions {
  serverConfig?: ServerConfig;
  users?: Record<string, UserConfig>;
  embeddingApiModelName?: string;
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
  app.use(cors(corsOrigins?.length ? { origin: corsOrigins } : undefined));
  app.use(express.json({ limit: '10mb' }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Auth status endpoint (before auth middleware — always accessible)
  app.get('/api/auth/status', (req, res) => {
    if (!hasUsers) return res.json({ required: false, authenticated: false });
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const result = resolveUserFromApiKey(auth.slice(7), users);
      if (result) return res.json({ required: true, authenticated: true, userId: result.userId, name: result.user.name });
    }
    return res.json({ required: true, authenticated: false });
  });

  // Auth middleware: resolve user from Bearer token
  if (hasUsers) {
    app.use('/api/', (req, _res, next) => {
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        const apiKey = auth.slice(7);
        const result = resolveUserFromApiKey(apiKey, users);
        if (result) {
          (req as any).userId = result.userId;
          (req as any).user = result.user;
        } else {
          return _res.status(401).json({ error: 'Invalid API key' });
        }
      }
      // No auth header = anonymous (uses defaultAccess)
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

      // Per-graph info: enabled + access level for current user
      const graphs: Record<string, { enabled: boolean; access: string | null }> = {};
      for (const gn of GRAPH_NAMES) {
        const access = serverConfig
          ? resolveAccess(userId, gn, p.config, serverConfig, ws?.config)
          : 'rw';
        graphs[gn] = { enabled: gc[gn].enabled, access: gc[gn].enabled ? access : null };
      }

      return {
        id,
        projectDir: p.config.projectDir,
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
      if (!serverConfig) return next(); // no config = no auth enforcement
      const p = (req as any).project;
      if (!p) return next();
      const userId = (req as any).userId as string | undefined;
      const ws = p.workspaceId ? projectManager.getWorkspace(p.workspaceId) : undefined;
      const access = resolveAccess(userId, graphName, p.config, serverConfig, ws?.config);
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
  app.use('/api/projects/:projectId/graph', createGraphRouter());
  app.use('/api/projects/:projectId/tools', createToolsRouter(projectManager));

  // Embedding API (optional, gated by server.embeddingApi.enabled)
  if (serverConfig?.embeddingApi?.enabled && options?.embeddingApiModelName) {
    app.use('/api/embed', createEmbedRouter(serverConfig.embeddingApi, options.embeddingApiModelName));
  }

  // Serve UI static files — check dist/ui/ (npm package) then ui/dist/ (dev)
  const uiDistPkg = path.resolve(__dirname, '../../ui');
  const uiDistDev = path.resolve(__dirname, '../../../ui/dist');
  const uiDist = fs.existsSync(uiDistPkg) ? uiDistPkg : uiDistDev;
  app.use(express.static(uiDist));

  // SPA fallback: serve index.html for non-API routes
  app.get('/{*splat}', (_req, res, next) => {
    if (_req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(uiDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  // Error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error' });
    }
    if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    process.stderr.write(`[rest] Error: ${err.stack || err}\n`);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
