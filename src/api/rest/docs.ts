import { Router } from 'express';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateQuery, searchQuerySchema, listQuerySchema } from '@/api/rest/validation';

/** Express 5 wildcard params are arrays — join them back into a path string. */
function joinParam(value: unknown): string {
  return Array.isArray(value) ? value.join('/') : String(value);
}

export function createDocsRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any) {
    return req.project as ProjectInstance & { docManager: NonNullable<ProjectInstance['docManager']> };
  }

  // List topics (files)
  router.get('/topics', validateQuery(listQuerySchema), (req, res, next) => {
    try {
      const p = getProject(req);
      if (!p.docManager) return res.json({ results: [] });
      const q = (req as any).validatedQuery;
      const topics = p.docManager.listFiles(q.filter, q.limit);
      res.json({ results: topics });
    } catch (err) { next(err); }
  });

  // Get TOC for a file
  router.get('/toc/*fileId', (req, res, next) => {
    try {
      const p = getProject(req);
      if (!p.docManager) return res.status(404).json({ error: 'No doc graph' });
      const fileId = joinParam((req.params as any).fileId);
      const chunks = p.docManager.getFileChunks(fileId);
      if (!chunks.length) return res.status(404).json({ error: 'File not found' });
      res.json({ results: chunks });
    } catch (err) { next(err); }
  });

  // Get node by ID
  router.get('/nodes/*nodeId', (req, res, next) => {
    try {
      const p = getProject(req);
      if (!p.docManager) return res.status(404).json({ error: 'No doc graph' });
      const nodeId = joinParam((req.params as any).nodeId);
      const node = p.docManager.getNode(nodeId);
      if (!node) return res.status(404).json({ error: 'Node not found' });
      const { embedding: _, ...rest } = node;
      res.json(rest);
    } catch (err) { next(err); }
  });

  // Search docs
  router.get('/search', validateQuery(searchQuerySchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      if (!p.docManager) return res.json({ results: [] });
      const q = (req as any).validatedQuery;
      const results = await p.docManager.search(q.q, {
        topK: q.topK,
        minScore: q.minScore,
        searchMode: q.searchMode,
        bfsDepth: q.bfsDepth,
        maxResults: q.maxResults,
        bfsDecay: q.bfsDecay,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  return router;
}
