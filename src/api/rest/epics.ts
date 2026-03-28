import { Router } from 'express';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateBody, validateQuery, createEpicSchema, updateEpicSchema, epicSearchSchema, epicListSchema, epicLinkSchema } from '@/api/rest/validation';
import { requireWriteAccess } from '@/api/rest/index';
import { VersionConflictError } from '@/graphs/manager-types';
import type { EpicStatus } from '@/graphs/task-types';

export function createEpicsRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any) {
    return req.project as ProjectInstance & { taskManager: NonNullable<ProjectInstance['taskManager']> };
  }

  // List epics
  router.get('/', validateQuery(epicListSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = (req as any).validatedQuery;
      const { results: epics, total } = p.taskManager.listEpics(q);
      res.json({ results: epics, total });
    } catch (err) { next(err); }
  });

  // Search epics
  router.get('/search', validateQuery(epicSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = (req as any).validatedQuery;
      const results = await p.taskManager.searchEpics(q.q, {
        topK: q.topK, minScore: q.minScore, searchMode: q.searchMode,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Get epic
  router.get('/:epicId', (req, res, next) => {
    try {
      const p = getProject(req);
      const epic = p.taskManager.getEpic(req.params.epicId as string);
      if (!epic) return res.status(404).json({ error: 'Epic not found' });
      res.json(epic);
    } catch (err) { next(err); }
  });

  // Get tasks belonging to epic
  router.get('/:epicId/tasks', (req, res, next) => {
    try {
      const p = getProject(req);
      const epic = p.taskManager.getEpic(req.params.epicId as string);
      if (!epic) return res.status(404).json({ error: 'Epic not found' });
      const tasks = p.taskManager.listEpicTasks(req.params.epicId as string);
      res.json({ results: tasks, progress: epic.progress });
    } catch (err) { next(err); }
  });

  // Create epic
  router.post('/', requireWriteAccess, validateBody(createEpicSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { title, description, status, priority, tags } = req.body;
      const created = await p.mutationQueue.enqueue(async () => {
        const epicId = await p.taskManager.createEpic(title, description, status, priority, tags);
        return p.taskManager.getEpic(epicId);
      });
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  // Update epic
  router.put('/:epicId', requireWriteAccess, validateBody(updateEpicSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const epicId = req.params.epicId as string;
      const { version, status, ...patch } = req.body;
      const result = await p.mutationQueue.enqueue(async () => {
        const ok = await p.taskManager.updateEpic(epicId, patch, status as EpicStatus | undefined, version);
        if (!ok) return null;
        return p.taskManager.getEpic(epicId);
      });
      if (!result) return res.status(404).json({ error: 'Epic not found' });
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
      const epicId = req.params.epicId as string;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.taskManager.deleteEpic(epicId);
      });
      if (!ok) return res.status(404).json({ error: 'Epic not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // Link task to epic
  router.post('/:epicId/link', requireWriteAccess, validateBody(epicLinkSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const epicId = req.params.epicId as string;
      const { taskId } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.taskManager.linkTaskToEpic(taskId, epicId);
      });
      if (!ok) return res.status(400).json({ error: 'Failed to link task to epic' });
      res.status(201).json({ taskId, epicId, linked: true });
    } catch (err) { next(err); }
  });

  // Unlink task from epic
  router.delete('/:epicId/link', requireWriteAccess, validateBody(epicLinkSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const epicId = req.params.epicId as string;
      const { taskId } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.taskManager.unlinkTaskFromEpic(taskId, epicId);
      });
      if (!ok) return res.status(404).json({ error: 'Link not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
