import fs from 'fs';
import mime from 'mime';
import { Router } from 'express';
import multer from 'multer';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateBody, validateQuery, createTaskSchema, updateTaskSchema, moveTaskSchema, createTaskLinkSchema, taskSearchSchema, taskListSchema, linkedQuerySchema, attachmentFilenameSchema } from '@/api/rest/validation';
import { VersionConflictError } from '@/graphs/manager-types';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export function createTasksRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any): ProjectInstance {
    return req.project;
  }

  // List tasks
  router.get('/', validateQuery(taskListSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = (req as any).validatedQuery;
      const tasks = p.taskManager.listTasks(q);
      res.json({ results: tasks });
    } catch (err) { next(err); }
  });

  // Search tasks
  router.get('/search', validateQuery(taskSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = (req as any).validatedQuery;
      const results = await p.taskManager.searchTasks(q.q, {
        topK: q.topK,
        minScore: q.minScore,
        searchMode: q.searchMode,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Find tasks linked to an external entity
  router.get('/linked', validateQuery(linkedQuerySchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const { targetGraph, targetNodeId, kind, projectId } = (req as any).validatedQuery;
      const tasks = p.taskManager.findLinkedTasks(targetGraph, targetNodeId, kind, projectId ?? (req.params as any).projectId);
      res.json({ results: tasks });
    } catch (err) { next(err); }
  });

  // Get task
  router.get('/:taskId', (req, res, next) => {
    try {
      const p = getProject(req);
      const task = p.taskManager.getTask(req.params.taskId as string);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      const relations = p.taskManager.listRelations(req.params.taskId as string);
      res.json({ ...task, relations });
    } catch (err) { next(err); }
  });

  // Create task
  router.post('/', validateBody(createTaskSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { title, description, status, priority, tags, dueDate, estimate } = req.body;
      const taskId = await p.mutationQueue.enqueue(async () => {
        return p.taskManager.createTask(title, description, status, priority, tags, dueDate, estimate);
      });
      const created = p.taskManager.getTask(taskId);
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  // Update task
  router.put('/:taskId', validateBody(updateTaskSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = req.params.taskId as string;
      const { version, ...patch } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.taskManager.updateTask(taskId, patch, version);
      });
      if (!ok) return res.status(404).json({ error: 'Task not found' });
      const updated = p.taskManager.getTask(taskId);
      res.json(updated);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return res.status(409).json({ error: 'version_conflict', current: err.current, expected: err.expected });
      }
      next(err);
    }
  });

  // Move task (change status) — action, so POST
  router.post('/:taskId/move', validateBody(moveTaskSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = req.params.taskId as string;
      const { status, version } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.taskManager.moveTask(taskId, status, version);
      });
      if (!ok) return res.status(404).json({ error: 'Task not found' });
      const updated = p.taskManager.getTask(taskId);
      res.json(updated);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return res.status(409).json({ error: 'version_conflict', current: err.current, expected: err.expected });
      }
      next(err);
    }
  });

  // Delete task
  router.delete('/:taskId', async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = req.params.taskId as string;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.taskManager.deleteTask(taskId);
      });
      if (!ok) return res.status(404).json({ error: 'Task not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // Create task link (task-to-task or cross-graph)
  router.post('/links', validateBody(createTaskLinkSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, kind, targetGraph, projectId } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        if (targetGraph) {
          return p.taskManager.createCrossLink(fromId, toId, targetGraph, kind, projectId);
        } else {
          return p.taskManager.linkTasks(fromId, toId, kind);
        }
      });
      if (!ok) return res.status(400).json({ error: 'Failed to create link' });
      res.status(201).json({ fromId, toId, kind, targetGraph: targetGraph || undefined });
    } catch (err) { next(err); }
  });

  // Delete task link
  router.delete('/links', validateBody(createTaskLinkSchema.pick({ fromId: true, toId: true, targetGraph: true, projectId: true })), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, targetGraph, projectId } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        if (targetGraph) {
          return p.taskManager.deleteCrossLink(fromId, toId, targetGraph, projectId);
        } else {
          return p.taskManager.deleteTaskLink(fromId, toId);
        }
      });
      if (!ok) return res.status(404).json({ error: 'Link not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // List relations for a task
  router.get('/:taskId/relations', (req, res, next) => {
    try {
      const p = getProject(req);
      const relations = p.taskManager.listRelations(req.params.taskId as string);
      res.json({ results: relations });
    } catch (err) { next(err); }
  });

  // -- Attachments --

  // Upload attachment
  router.post('/:taskId/attachments', upload.single('file'), async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = req.params.taskId as string;
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const meta = await p.mutationQueue.enqueue(async () => {
        return p.taskManager.addAttachment(taskId, file.originalname, file.buffer);
      });
      if (!meta) return res.status(404).json({ error: 'Task not found' });
      res.status(201).json(meta);
    } catch (err) { next(err); }
  });

  // List attachments
  router.get('/:taskId/attachments', (req, res, next) => {
    try {
      const p = getProject(req);
      const attachments = p.taskManager.listAttachments(req.params.taskId as string);
      res.json({ results: attachments });
    } catch (err) { next(err); }
  });

  // Download attachment
  router.get('/:taskId/attachments/:filename', (req, res, next) => {
    try {
      const p = getProject(req);
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      const filePath = p.taskManager.getAttachmentPath(req.params.taskId as string, filename);
      if (!filePath) return res.status(404).json({ error: 'Attachment not found' });
      const mimeType = mime.getType(filePath) ?? 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => next(err));
      stream.pipe(res);
    } catch (err) { next(err); }
  });

  // Delete attachment
  router.delete('/:taskId/attachments/:filename', async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = req.params.taskId as string;
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.taskManager.removeAttachment(taskId, filename);
      });
      if (!ok) return res.status(404).json({ error: 'Attachment not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
