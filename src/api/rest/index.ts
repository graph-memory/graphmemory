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
      return {
        id,
        projectDir: p.config.projectDir,
        workspaceId: p.workspaceId ?? null,
        stats: {
          docs:      p.docGraph      ? p.docGraph.order      : 0,
          code:      p.codeGraph     ? p.codeGraph.order      : 0,
          knowledge: p.knowledgeGraph.order,
          files:     p.fileIndexGraph.order,
          tasks:     p.taskGraph.order,
          skills:    p.skillGraph.order,
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
      knowledge: { nodes: p.knowledgeGraph.order, edges: p.knowledgeGraph.size },
      fileIndex: { nodes: p.fileIndexGraph.order, edges: p.fileIndexGraph.size },
      tasks:     { nodes: p.taskGraph.order,      edges: p.taskGraph.size },
      skills:    { nodes: p.skillGraph.order,     edges: p.skillGraph.size },
    });
  });

  // Mount domain routers
  app.use('/api/projects/:projectId/knowledge', createKnowledgeRouter());
  app.use('/api/projects/:projectId/tasks', createTasksRouter());
  app.use('/api/projects/:projectId/skills', createSkillsRouter());
  app.use('/api/projects/:projectId/docs', createDocsRouter());
  app.use('/api/projects/:projectId/code', createCodeRouter());
  app.use('/api/projects/:projectId/files', createFilesRouter());
  app.use('/api/projects/:projectId/graph', createGraphRouter());
  app.use('/api/projects/:projectId/tools', createToolsRouter(projectManager));

  // Serve UI static files (ui/dist)
  const uiDist = path.resolve(__dirname, '../../../ui/dist');
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
