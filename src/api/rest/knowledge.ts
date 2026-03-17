import fs from 'fs';
import mime from 'mime';
import { Router } from 'express';
import multer from 'multer';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateBody, validateQuery, createNoteSchema, updateNoteSchema, createRelationSchema, noteSearchSchema, noteListSchema, attachmentFilenameSchema } from '@/api/rest/validation';
import { VersionConflictError } from '@/graphs/manager-types';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export function createKnowledgeRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any): ProjectInstance {
    return req.project;
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
      res.json(note);
    } catch (err) { next(err); }
  });

  // Create note
  router.post('/notes', validateBody(createNoteSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { title, content, tags } = req.body;
      const noteId = await p.mutationQueue.enqueue(async () => {
        return p.knowledgeManager.createNote(title, content, tags);
      });
      const created = p.knowledgeManager.getNote(noteId);
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  // Update note
  router.put('/notes/:noteId', validateBody(updateNoteSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const noteId = req.params.noteId as string;
      const { version, ...patch } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.knowledgeManager.updateNote(noteId, patch, version);
      });
      if (!ok) return res.status(404).json({ error: 'Note not found' });
      const updated = p.knowledgeManager.getNote(noteId);
      res.json(updated);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return res.status(409).json({ error: 'version_conflict', current: err.current, expected: err.expected });
      }
      next(err);
    }
  });

  // Delete note
  router.delete('/notes/:noteId', async (req, res, next) => {
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
  router.post('/relations', validateBody(createRelationSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, kind, targetGraph } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.knowledgeManager.createRelation(fromId, toId, kind, targetGraph);
      });
      if (!ok) return res.status(400).json({ error: 'Failed to create relation' });
      res.status(201).json({ fromId, toId, kind, targetGraph: targetGraph || undefined });
    } catch (err) { next(err); }
  });

  // Delete relation
  router.delete('/relations', validateBody(createRelationSchema.pick({ fromId: true, toId: true, targetGraph: true })), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, targetGraph } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.knowledgeManager.deleteRelation(fromId, toId, targetGraph);
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
  router.get('/linked', (req, res, next) => {
    try {
      const p = getProject(req);
      const { targetGraph, targetNodeId, kind } = req.query as any;
      if (!targetGraph || !targetNodeId) {
        return res.status(400).json({ error: 'targetGraph and targetNodeId are required' });
      }
      const notes = p.knowledgeManager.findLinkedNotes(targetGraph, targetNodeId, kind);
      res.json({ results: notes });
    } catch (err) { next(err); }
  });

  // -- Attachments --

  // Upload attachment
  router.post('/notes/:noteId/attachments', upload.single('file'), async (req, res, next) => {
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
      fs.createReadStream(filePath).pipe(res);
    } catch (err) { next(err); }
  });

  // Delete attachment
  router.delete('/notes/:noteId/attachments/:filename', async (req, res, next) => {
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
