import fs from 'fs';
import mime from 'mime';
import { Router } from 'express';
import multer from 'multer';
import type { ProjectInstance } from '@/lib/project-manager';
import type { StoreManager } from '@/lib/store-manager';
import { validateBody, validateQuery, createTaskSchema, updateTaskSchema, moveTaskSchema, reorderTaskSchema, bulkMoveSchema, bulkPrioritySchema, bulkDeleteSchema, createTaskLinkSchema, taskSearchSchema, taskListSchema, linkedQuerySchema, attachmentFilenameSchema } from '@/api/rest/validation';
import { requireWriteAccess } from '@/api/rest/index';
import { VersionConflictError } from '@/store/types';
import { MAX_UPLOAD_SIZE } from '@/lib/defaults';
import type { Edge, GraphName } from '@/store/types';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_SIZE } });

export function createTasksRouter(_users?: Record<string, unknown>): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: Express.Request) {
    return req.project as ProjectInstance & { storeManager: StoreManager };
  }

  // List tasks
  router.get('/', validateQuery(taskListSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const { results, total } = p.storeManager.listTasks(q);
      res.json({ results, total });
    } catch (err) { next(err); }
  });

  // Search tasks
  router.get('/search', validateQuery(taskSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const results = await p.storeManager.searchTasks({
        text: q.q,
        searchMode: q.searchMode,
        maxResults: q.maxResults,
        minScore: q.minScore,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Find tasks linked to an external entity (via edges)
  router.get('/linked', validateQuery(linkedQuerySchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const { targetGraph, targetNodeId, kind } = req.validatedQuery;
      const edges = p.storeManager.listEdges({
        fromGraph: 'tasks' as GraphName,
        toGraph: targetGraph as GraphName,
        toId: targetNodeId,
        kind: kind || undefined,
      });
      res.json({ results: edges });
    } catch (err) { next(err); }
  });

  // Get task
  router.get('/:taskId', (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      const task = p.storeManager.getTask(taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      // TaskDetail already includes edges
      res.json(task);
    } catch (err) { next(err); }
  });

  // Create task
  router.post('/', requireWriteAccess, validateBody(createTaskSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { title, description, status, priority, tags, dueDate, estimate, assigneeId, order } = req.body;
      const created = await p.mutationQueue.enqueue(async () => {
        return p.storeManager.createTask({
          title,
          description: description ?? '',
          status,
          priority,
          tags,
          dueDate,
          estimate,
          assigneeId: assigneeId != null ? Number(assigneeId) : undefined,
          order,
        });
      });
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  // Bulk routes — must be registered before /:taskId parameterized routes
  router.post('/bulk/move', requireWriteAccess, validateBody(bulkMoveSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { taskIds, status } = req.body;
      const moved = await p.mutationQueue.enqueue(async () => {
        return p.storeManager.bulkMoveTasks(taskIds, status);
      });
      res.json({ moved });
    } catch (err) { next(err); }
  });

  // Bulk update priority
  router.post('/bulk/priority', requireWriteAccess, validateBody(bulkPrioritySchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { taskIds, priority } = req.body;
      const updated = await p.mutationQueue.enqueue(async () => {
        return p.storeManager.bulkPriorityTasks(taskIds, priority);
      });
      res.json({ updated });
    } catch (err) { next(err); }
  });

  // Bulk delete tasks
  router.post('/bulk/delete', requireWriteAccess, validateBody(bulkDeleteSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { taskIds } = req.body;
      const deleted = await p.mutationQueue.enqueue(async () => {
        return p.storeManager.bulkDeleteTasks(taskIds);
      });
      res.json({ deleted });
    } catch (err) { next(err); }
  });

  // Update task
  router.put('/:taskId', requireWriteAccess, validateBody(updateTaskSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      const { version, ...patch } = req.body;
      const result = await p.mutationQueue.enqueue(async () => {
        return p.storeManager.updateTask(taskId, patch, undefined, version);
      });
      res.json(result);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return res.status(409).json({ error: 'version_conflict', current: err.current, expected: err.expected });
      }
      next(err);
    }
  });

  // Move task (change status) — action, so POST
  router.post('/:taskId/move', requireWriteAccess, validateBody(moveTaskSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      const { status, version, order } = req.body;
      const result = await p.mutationQueue.enqueue(async () => {
        return p.storeManager.moveTask(taskId, status, order, undefined, version);
      });
      res.json(result);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return res.status(409).json({ error: 'version_conflict', current: err.current, expected: err.expected });
      }
      next(err);
    }
  });

  // Reorder task (change position, optionally status)
  router.post('/:taskId/reorder', requireWriteAccess, validateBody(reorderTaskSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      const { order, status } = req.body;
      const result = await p.mutationQueue.enqueue(async () => {
        return p.storeManager.reorderTask(taskId, order, status);
      });
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) return res.status(404).json({ error: err.message });
      next(err);
    }
  });

  // Create edge (task-to-task or cross-graph)
  // Must be registered before DELETE /:taskId to avoid 'links' being parsed as a taskId
  router.post('/links', requireWriteAccess, validateBody(createTaskLinkSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, kind, targetGraph } = req.body;
      const edge: Edge = {
        fromGraph: 'tasks' as GraphName,
        fromId,
        toGraph: (targetGraph ?? 'tasks') as GraphName,
        toId,
        kind,
      };
      await p.mutationQueue.enqueue(async () => {
        p.storeManager.createEdge(edge);
      });
      res.status(201).json(edge);
    } catch (err) { next(err); }
  });

  // Delete edge
  // Must be registered before DELETE /:taskId to avoid 'links' being parsed as a taskId
  router.delete('/links', requireWriteAccess, validateBody(createTaskLinkSchema.pick({ fromId: true, toId: true, targetGraph: true, projectId: true })), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, targetGraph } = req.body;
      const edge: Edge = {
        fromGraph: 'tasks' as GraphName,
        fromId,
        toGraph: (targetGraph ?? 'tasks') as GraphName,
        toId,
        kind: '',  // kind not required for delete lookup
      };
      await p.mutationQueue.enqueue(async () => {
        p.storeManager.deleteEdge(edge);
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // Delete task
  router.delete('/:taskId', requireWriteAccess, async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      await p.mutationQueue.enqueue(async () => {
        const existing = p.storeManager.getTask(taskId);
        if (!existing) throw Object.assign(new Error('Task not found'), { status: 404 });
        p.storeManager.deleteTask(taskId);
      });
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && (err as Error & { status?: number }).status === 404) return res.status(404).json({ error: err.message });
      next(err);
    }
  });

  // List edges for a task
  router.get('/:taskId/relations', (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      const outgoing = p.storeManager.findOutgoingEdges('tasks' as GraphName, taskId);
      const incoming = p.storeManager.findIncomingEdges('tasks' as GraphName, taskId);
      res.json({ results: [...outgoing, ...incoming] });
    } catch (err) { next(err); }
  });

  // -- Attachments --

  // Upload attachment
  router.post('/:taskId/attachments', requireWriteAccess, upload.single('file'), async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
      const filename = attachmentFilenameSchema.parse(file.originalname);

      const meta = await p.mutationQueue.enqueue(async () => {
        const task = p.storeManager.getTask(taskId);
        if (!task) return null;
        return p.storeManager.addAttachment('tasks' as GraphName, taskId, task.slug, filename, file.buffer);
      });
      if (!meta) return res.status(404).json({ error: 'Task not found' });
      res.status(201).json(meta);
    } catch (err) { next(err); }
  });

  // List attachments
  router.get('/:taskId/attachments', (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      const attachments = p.storeManager.listAttachments('tasks' as GraphName, taskId);
      res.json({ results: attachments });
    } catch (err) { next(err); }
  });

  // Download attachment
  router.get('/:taskId/attachments/:filename', (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      const task = p.storeManager.getTask(taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      const filePath = p.storeManager.getAttachmentPath('tasks' as GraphName, task.slug, filename);
      if (!filePath) return res.status(404).json({ error: 'Attachment not found' });
      const mimeType = mime.getType(filePath) ?? 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => next(err));
      stream.pipe(res);
    } catch (err) { next(err); }
  });

  // Delete attachment
  router.delete('/:taskId/attachments/:filename', requireWriteAccess, async (req, res, next) => {
    try {
      const p = getProject(req);
      const taskId = Number(req.params.taskId);
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      await p.mutationQueue.enqueue(async () => {
        const task = p.storeManager.getTask(taskId);
        if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
        p.storeManager.removeAttachment('tasks' as GraphName, taskId, task.slug, filename);
      });
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && (err as Error & { status?: number }).status === 404) return res.status(404).json({ error: err.message });
      next(err);
    }
  });

  return router;
}
