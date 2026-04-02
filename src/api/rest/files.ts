import path from 'path';
import { Router } from 'express';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateQuery, fileListSchema, fileSearchSchema } from '@/api/rest/validation';
import type { SearchQuery } from '@/store/types';

export function createFilesRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any) {
    return req.project as ProjectInstance;
  }

  // List all files
  router.get('/', validateQuery(fileListSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const { results, total } = p.scopedStore.files.listFiles(q);
      res.json({ results, total });
    } catch (err) { next(err); }
  });

  // Search files
  router.get('/search', validateQuery(fileSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const sq: SearchQuery = {
        text: q.q,
        embedding: await p.embedFns.files.query(q.q),
        maxResults: q.topK,
        minScore: q.minScore,
      };
      const results = p.scopedStore.files.search(sq);
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Get file info
  router.get('/info', (req, res, next) => {
    try {
      const p = getProject(req);
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'path query parameter required' });
      // Prevent path traversal
      const normalized = path.normalize(filePath);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        return res.status(400).json({ error: 'Invalid path' });
      }
      const info = p.scopedStore.files.getFileInfo(normalized);
      if (!info) return res.status(404).json({ error: 'File not found' });
      res.json(info);
    } catch (err) { next(err); }
  });

  return router;
}
