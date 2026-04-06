import { Router } from 'express';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateBody, validateQuery, createEpicSchema, updateEpicSchema, epicSearchSchema, epicListSchema, epicLinkSchema } from '@/api/rest/validation';
import { requireWriteAccess } from '@/api/rest/index';
import { VersionConflictError } from '@/store/types';
import type { UserConfig } from '@/lib/multi-config';

export function createEpicsRouter(_users?: Record<string, UserConfig>): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: Express.Request) {
    return req.project as ProjectInstance & { storeManager: NonNullable<ProjectInstance['storeManager']> };
  }

  // List epics
  router.get('/', validateQuery(epicListSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const { results, total } = p.storeManager.listEpics(q);
      res.json({ results, total });
    } catch (err) { next(err); }
  });

  // Search epics
  router.get('/search', validateQuery(epicSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const results = await p.storeManager.searchEpics({
        text: q.q,
        searchMode: q.searchMode,
        maxResults: q.maxResults,
        minScore: q.minScore,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Get epic
  router.get('/:epicId', (req, res, next) => {
    try {
      const p = getProject(req);
      const epicId = Number(req.params.epicId);
      const epic = p.storeManager.getEpic(epicId);
      if (!epic) return res.status(404).json({ error: 'Epic not found' });
      // Include linked task IDs for convenience
      const tasks = epic.edges
        .filter(e => e.kind === 'belongs_to')
        .map(e => e.toId);
      const { edges: _edges, ...rest } = epic;
      res.json({ ...rest, tasks });
    } catch (err) { next(err); }
  });

  // Get tasks belonging to epic
  router.get('/:epicId/tasks', (req, res, next) => {
    try {
      const p = getProject(req);
      const epicId = Number(req.params.epicId);
      const epic = p.storeManager.getEpic(epicId);
      if (!epic) return res.status(404).json({ error: 'Epic not found' });
      const tasks = p.storeManager.listEpicTasks(epicId);
      res.json({ results: tasks, progress: epic.progress });
    } catch (err) { next(err); }
  });

  // Create epic
  router.post('/', requireWriteAccess, validateBody(createEpicSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { title, description, status, priority, tags } = req.body;
      const created = await p.mutationQueue.enqueue(async () => {
        const epic = await p.storeManager.createEpic({
          title, description: description ?? '', status, priority, tags,
        });
        return p.storeManager.getEpic(epic.id);
      });
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  // Update epic
  router.put('/:epicId', requireWriteAccess, validateBody(updateEpicSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const epicId = Number(req.params.epicId);
      const { version, ...patch } = req.body;
      const result = await p.mutationQueue.enqueue(async () => {
        const updated = await p.storeManager.updateEpic(epicId, patch, undefined, version);
        return p.storeManager.getEpic(updated.id);
      });
      res.json(result);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return res.status(409).json({ error: 'version_conflict', current: err.current, expected: err.expected });
      }
      next(err);
    }
  });

  // Delete epic
  router.delete('/:epicId', requireWriteAccess, async (req, res, next) => {
    try {
      const p = getProject(req);
      const epicId = Number(req.params.epicId);
      const existing = p.storeManager.getEpic(epicId);
      if (!existing) return res.status(404).json({ error: 'Epic not found' });
      await p.mutationQueue.enqueue(async () => {
        p.storeManager.deleteEpic(epicId);
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // Link task to epic
  router.post('/:epicId/link', requireWriteAccess, validateBody(epicLinkSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const epicId = Number(req.params.epicId);
      const taskId = req.body.taskId;
      await p.mutationQueue.enqueue(async () => {
        p.storeManager.linkTaskToEpic(epicId, taskId);
      });
      res.status(201).json({ taskId, epicId, linked: true });
    } catch (err) { next(err); }
  });

  // Unlink task from epic
  router.delete('/:epicId/link', requireWriteAccess, validateBody(epicLinkSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const epicId = Number(req.params.epicId);
      const taskId = req.body.taskId;
      await p.mutationQueue.enqueue(async () => {
        p.storeManager.unlinkTaskFromEpic(epicId, taskId);
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
