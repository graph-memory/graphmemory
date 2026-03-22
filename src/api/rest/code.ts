import { Router } from 'express';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateQuery, searchQuerySchema, listQuerySchema } from '@/api/rest/validation';

/** Express 5 wildcard params are arrays — join them back into a path string. */
function joinParam(value: unknown): string {
  return Array.isArray(value) ? value.join('/') : String(value);
}

export function createCodeRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any) {
    return req.project as ProjectInstance & { codeManager: NonNullable<ProjectInstance['codeManager']> };
  }

  // List code files
  router.get('/files', validateQuery(listQuerySchema), (req, res, next) => {
    try {
      const p = getProject(req);
      if (!p.codeManager) return res.json({ results: [] });
      const q = (req as any).validatedQuery;
      const files = p.codeManager.listFiles(q.filter, q.limit);
      res.json({ results: files });
    } catch (err) { next(err); }
  });

  // Get symbols for a file
  router.get('/files/*fileId/symbols', (req, res, next) => {
    try {
      const p = getProject(req);
      if (!p.codeManager) return res.status(404).json({ error: 'No code graph' });
      const fileId = joinParam((req.params as any).fileId);
      const symbols = p.codeManager.getFileSymbols(fileId);
      res.json({ results: symbols });
    } catch (err) { next(err); }
  });

  // Get symbol by ID
  router.get('/symbols/*symbolId', (req, res, next) => {
    try {
      const p = getProject(req);
      if (!p.codeManager) return res.status(404).json({ error: 'No code graph' });
      const symbolId = joinParam((req.params as any).symbolId);
      const symbol = p.codeManager.getSymbol(symbolId);
      if (!symbol) return res.status(404).json({ error: 'Symbol not found' });
      const { embedding: _, fileEmbedding: _fe, ...rest } = symbol;
      res.json(rest);
    } catch (err) { next(err); }
  });

  // Search code
  router.get('/search', validateQuery(searchQuerySchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      if (!p.codeManager) return res.json({ results: [] });
      const q = (req as any).validatedQuery;
      const results = await p.codeManager.search(q.q, {
        topK: q.topK,
        minScore: q.minScore,
        searchMode: q.searchMode,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  return router;
}
