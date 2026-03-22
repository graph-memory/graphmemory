import fs from 'fs';
import mime from 'mime';
import { Router } from 'express';
import multer from 'multer';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateBody, validateQuery, createNoteSchema, updateNoteSchema, createRelationSchema, noteSearchSchema, noteListSchema, linkedQuerySchema, attachmentFilenameSchema } from '@/api/rest/validation';
import { requireWriteAccess } from '@/api/rest/index';
import { VersionConflictError } from '@/graphs/manager-types';
import { MAX_UPLOAD_SIZE } from '@/lib/defaults';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_SIZE } });

export function createKnowledgeRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any) {
    return req.project as ProjectInstance & { knowledgeManager: NonNullable<ProjectInstance['knowledgeManager']> };
  }

  // List notes
  router.get('/notes', validateQuery(noteListSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = (req as any).validatedQuery;
      const notes = p.knowledgeManager.listNotes(q.filter, q.tag, q.limit);
      res.json({ results: notes });
    } catch (err) { next(err); }
  });

  // Search notes
  router.get('/search', validateQuery(noteSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = (req as any).validatedQuery;
      const results = await p.knowledgeManager.searchNotes(q.q, {
        topK: q.topK,
        minScore: q.minScore,
        searchMode: q.searchMode,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Get note
  router.get('/notes/:noteId', (req, res, next) => {
    try {
      const p = getProject(req);
      const note = p.knowledgeManager.getNote(req.params.noteId as string);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      const { embedding: _, ...rest } = note;
      res.json(rest);
    } catch (err) { next(err); }
  });

  // Create note
  router.post('/notes', requireWriteAccess, validateBody(createNoteSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { title, content, tags } = req.body;
      const created = await p.mutationQueue.enqueue(async () => {
        const noteId = await p.knowledgeManager.createNote(title, content, tags);
        return p.knowledgeManager.getNote(noteId);
      });
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  // Update note
  router.put('/notes/:noteId', requireWriteAccess, validateBody(updateNoteSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const noteId = req.params.noteId as string;
      const { version, ...patch } = req.body;
      const result = await p.mutationQueue.enqueue(async () => {
        const ok = await p.knowledgeManager.updateNote(noteId, patch, version);
        if (!ok) return null;
        return p.knowledgeManager.getNote(noteId);
      });
      if (!result) return res.status(404).json({ error: 'Note not found' });
      res.json(result);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return res.status(409).json({ error: 'version_conflict', current: err.current, expected: err.expected });
      }
      next(err);
    }
  });

  // Delete note
  router.delete('/notes/:noteId', requireWriteAccess, async (req, res, next) => {
    try {
      const p = getProject(req);
      const noteId = req.params.noteId as string;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.knowledgeManager.deleteNote(noteId);
      });
      if (!ok) return res.status(404).json({ error: 'Note not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // Create relation
  router.post('/relations', requireWriteAccess, validateBody(createRelationSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, kind, targetGraph, projectId } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.knowledgeManager.createRelation(fromId, toId, kind, targetGraph, projectId);
      });
      if (!ok) return res.status(400).json({ error: 'Failed to create relation' });
      res.status(201).json({ fromId, toId, kind, targetGraph: targetGraph || undefined });
    } catch (err) { next(err); }
  });

  // Delete relation
  router.delete('/relations', requireWriteAccess, validateBody(createRelationSchema.pick({ fromId: true, toId: true, targetGraph: true, projectId: true })), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, targetGraph, projectId } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.knowledgeManager.deleteRelation(fromId, toId, targetGraph, projectId);
      });
      if (!ok) return res.status(404).json({ error: 'Relation not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // List relations for a note
  router.get('/notes/:noteId/relations', (req, res, next) => {
    try {
      const p = getProject(req);
      const relations = p.knowledgeManager.listRelations(req.params.noteId as string);
      res.json({ results: relations });
    } catch (err) { next(err); }
  });

  // Find notes linked to an external entity
  router.get('/linked', validateQuery(linkedQuerySchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const { targetGraph, targetNodeId, kind, projectId } = (req as any).validatedQuery;
      const notes = p.knowledgeManager.findLinkedNotes(targetGraph, targetNodeId, kind, projectId ?? (req.params as any).projectId);
      res.json({ results: notes });
    } catch (err) { next(err); }
  });

  // -- Attachments --

  // Upload attachment
  router.post('/notes/:noteId/attachments', requireWriteAccess, upload.single('file'), async (req, res, next) => {
    try {
      const p = getProject(req);
      const noteId = req.params.noteId as string;
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const meta = await p.mutationQueue.enqueue(async () => {
        return p.knowledgeManager.addAttachment(noteId, file.originalname, file.buffer);
      });
      if (!meta) return res.status(404).json({ error: 'Note not found' });
      res.status(201).json(meta);
    } catch (err) { next(err); }
  });

  // List attachments
  router.get('/notes/:noteId/attachments', (req, res, next) => {
    try {
      const p = getProject(req);
      const attachments = p.knowledgeManager.listAttachments(req.params.noteId as string);
      res.json({ results: attachments });
    } catch (err) { next(err); }
  });

  // Download attachment
  router.get('/notes/:noteId/attachments/:filename', (req, res, next) => {
    try {
      const p = getProject(req);
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      const filePath = p.knowledgeManager.getAttachmentPath(req.params.noteId as string, filename);
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
  router.delete('/notes/:noteId/attachments/:filename', requireWriteAccess, async (req, res, next) => {
    try {
      const p = getProject(req);
      const noteId = req.params.noteId as string;
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.knowledgeManager.removeAttachment(noteId, filename);
      });
      if (!ok) return res.status(404).json({ error: 'Attachment not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
