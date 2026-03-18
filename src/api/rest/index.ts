import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import type { ProjectManager } from '@/lib/project-manager';
import { createKnowledgeRouter } from '@/api/rest/knowledge';
import { createTasksRouter } from '@/api/rest/tasks';
import { createSkillsRouter } from '@/api/rest/skills';
import { createDocsRouter } from '@/api/rest/docs';
import { createCodeRouter } from '@/api/rest/code';
import { createFilesRouter } from '@/api/rest/files';
import { createGraphRouter } from '@/api/rest/graph';
import { createToolsRouter } from '@/api/rest/tools';

/**
 * Create an Express app with all REST routes mounted.
 * Each route uses the ProjectManager to look up project-specific graphs.
 */
export function createRestApp(projectManager: ProjectManager): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

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
    const projects = projectManager.listProjects().map(id => {
      const p = projectManager.getProject(id)!;
      const gc = p.config.graphConfigs;
      return {
        id,
        projectDir: p.config.projectDir,
        workspaceId: p.workspaceId ?? null,
        graphs: {
          docs:      { enabled: gc.docs.enabled },
          code:      { enabled: gc.code.enabled },
          knowledge: { enabled: gc.knowledge.enabled },
          files:     { enabled: gc.files.enabled },
          tasks:     { enabled: gc.tasks.enabled },
          skills:    { enabled: gc.skills.enabled },
        },
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

  // Mount domain routers (gated by manager existence)
  app.use('/api/projects/:projectId/knowledge', requireManager('knowledgeManager'), createKnowledgeRouter());
  app.use('/api/projects/:projectId/tasks', requireManager('taskManager'), createTasksRouter());
  app.use('/api/projects/:projectId/skills', requireManager('skillManager'), createSkillsRouter());
  app.use('/api/projects/:projectId/docs', requireManager('docManager'), createDocsRouter());
  app.use('/api/projects/:projectId/code', requireManager('codeManager'), createCodeRouter());
  app.use('/api/projects/:projectId/files', requireManager('fileIndexManager'), createFilesRouter());
  app.use('/api/projects/:projectId/graph', createGraphRouter());
  app.use('/api/projects/:projectId/tools', createToolsRouter(projectManager));

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
      return res.status(400).json({ error: 'Validation error', details: err.issues });
    }
    if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    process.stderr.write(`[rest] Error: ${err.stack || err}\n`);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
