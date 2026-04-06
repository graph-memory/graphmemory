import { Router } from 'express';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateQuery, searchQuerySchema, listQuerySchema } from '@/api/rest/validation';
import type { SearchQuery } from '@/store/types';

export function createDocsRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: Express.Request) {
    return req.project as ProjectInstance;
  }

  // List topics (files)
  router.get('/topics', validateQuery(listQuerySchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const { results, total } = p.scopedStore.docs.listFiles(q.filter, { limit: q.limit, offset: q.offset });
      res.json({ results, total });
    } catch (err) { next(err); }
  });

  // Get TOC for a file
  router.get('/toc/*fileId', (req, res, next) => {
    try {
      const p = getProject(req);
      const fileId = joinParam((req.params as Record<string, unknown>).fileId);
      const chunks = p.scopedStore.docs.getFileChunks(fileId);
      if (!chunks.length) return res.status(404).json({ error: 'File not found' });
      res.json({ results: chunks });
    } catch (err) { next(err); }
  });

  // Get node by ID
  router.get('/nodes/:nodeId', (req, res, next) => {
    try {
      const p = getProject(req);
      const nodeId = Number(req.params.nodeId);
      if (!Number.isFinite(nodeId)) return res.status(404).json({ error: 'Node not found' });
      const node = p.scopedStore.docs.getNode(nodeId);
      if (!node) return res.status(404).json({ error: 'Node not found' });
      res.json(node);
    } catch (err) { next(err); }
  });

  // Search docs
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
        sq.embedding = await p.embedFns.docs.query(q.q);
      }
      const results = p.scopedStore.docs.search(sq);
      res.json({ results });
    } catch (err) { next(err); }
  });

  return router;
}

/** Express 5 wildcard params are arrays — join them back into a path string. */
function joinParam(value: unknown): string {
  return Array.isArray(value) ? value.join('/') : String(value);
}
