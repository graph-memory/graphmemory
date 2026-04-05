import { Router } from 'express';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateQuery, searchQuerySchema, listQuerySchema } from '@/api/rest/validation';
import type { SearchQuery } from '@/store/types';

/** Express 5 wildcard params are arrays — join them back into a path string. */
function joinParam(value: unknown): string {
  return Array.isArray(value) ? value.join('/') : String(value);
}

export function createCodeRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: Express.Request) {
    return req.project as ProjectInstance;
  }

  // List code files
  router.get('/files', validateQuery(listQuerySchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const { results, total } = p.scopedStore.code.listFiles(q.filter, { limit: q.limit, offset: q.offset });
      res.json({ results, total });
    } catch (err) { next(err); }
  });

  // Get symbols for a file
  router.get('/files/*fileId/symbols', (req, res, next) => {
    try {
      const p = getProject(req);
      const fileId = joinParam((req.params as any).fileId);
      const symbols = p.scopedStore.code.getFileSymbols(fileId);
      res.json({ results: symbols });
    } catch (err) { next(err); }
  });

  // Get symbol by ID
  router.get('/symbols/:symbolId', (req, res, next) => {
    try {
      const p = getProject(req);
      const symbolId = Number(req.params.symbolId);
      if (!Number.isFinite(symbolId)) return res.status(400).json({ error: 'Invalid symbolId' });
      const symbol = p.scopedStore.code.getNode(symbolId);
      if (!symbol) return res.status(404).json({ error: 'Symbol not found' });
      res.json(symbol);
    } catch (err) { next(err); }
  });

  // Search code
  router.get('/search', validateQuery(searchQuerySchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const sq: SearchQuery = {
        text: q.q,
        topK: q.topK,
        minScore: q.minScore,
        searchMode: q.searchMode,
        maxResults: q.maxResults,
      };
      if (q.searchMode !== 'keyword') {
        sq.embedding = await p.embedFns.code.query(q.q);
      }
      const results = p.scopedStore.code.search(sq);
      res.json({ results });
    } catch (err) { next(err); }
  });

  return router;
}
