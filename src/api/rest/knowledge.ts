import fs from 'fs';
import mime from 'mime';
import { Router } from 'express';
import multer from 'multer';
import type { ProjectInstance } from '@/lib/project-manager';
import type { StoreManager } from '@/lib/store-manager';
import type { PromiseQueue } from '@/lib/promise-queue';
import { validateBody, validateQuery, createNoteSchema, updateNoteSchema, createRelationSchema, noteSearchSchema, noteListSchema, linkedQuerySchema, attachmentFilenameSchema } from '@/api/rest/validation';
import { requireWriteAccess } from '@/api/rest/index';
import { VersionConflictError } from '@/store/types/common';
import type { GraphName } from '@/store/types/common';
import { MAX_UPLOAD_SIZE } from '@/lib/defaults';
// TODO: uncomment when authorId support lands
// import { resolveRequestAuthor } from '@/lib/multi-config';
import type { UserConfig } from '@/lib/multi-config';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_SIZE } });

function parseNoteId(raw: string | string[]): number {
  if (Array.isArray(raw)) raw = raw[0];
  const id = Number(raw);
  if (!Number.isFinite(id) || id < 1 || id !== Math.floor(id)) {
    const err = new Error('Note not found');
    throw Object.assign(err, { status: 404 });
  }
  return id;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- will be wired when authorId support lands
export function createKnowledgeRouter(_users?: Record<string, UserConfig>): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: Express.Request): { storeManager: StoreManager; mutationQueue: PromiseQueue } {
    const p = req.project as ProjectInstance;
    return { storeManager: p.storeManager, mutationQueue: p.mutationQueue };
  }

  // List notes
  router.get('/notes', validateQuery(noteListSchema), (req, res, next) => {
    try {
      const { storeManager: mgr } = getProject(req);
      const q = req.validatedQuery;
      const { results, total } = mgr.listNotes({ filter: q.filter, tag: q.tag, limit: q.limit, offset: q.offset });
      res.json({ results, total });
    } catch (err) { next(err); }
  });

  // Search notes
  router.get('/search', validateQuery(noteSearchSchema), async (req, res, next) => {
    try {
      const { storeManager: mgr } = getProject(req);
      const q = req.validatedQuery;
      const results = await mgr.searchNotes({
        text: q.q,
        maxResults: q.maxResults,
        minScore: q.minScore,
        searchMode: q.searchMode,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Get note
  router.get('/notes/:noteId', (req, res, next) => {
    try {
      const { storeManager: mgr } = getProject(req);
      const noteId = parseNoteId(req.params.noteId);
      const note = mgr.getNote(noteId);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      const { embedding: _, ...rest } = note as unknown as Record<string, unknown>;
      res.json(rest);
    } catch (err) { next(err); }
  });

  // Create note
  router.post('/notes', requireWriteAccess, validateBody(createNoteSchema), async (req, res, next) => {
    try {
      const { storeManager: mgr, mutationQueue } = getProject(req);
      const { title, content, tags } = req.body;
      const created = await mutationQueue.enqueue(async () => {
        const record = await mgr.createNote({ title, content, tags });
        return record;
      });
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  // Update note
  router.put('/notes/:noteId', requireWriteAccess, validateBody(updateNoteSchema), async (req, res, next) => {
    try {
      const { storeManager: mgr, mutationQueue } = getProject(req);
      const noteId = parseNoteId(req.params.noteId);
      const { version, ...patch } = req.body;
      const result = await mutationQueue.enqueue(async () => {
        const updated = await mgr.updateNote(noteId, patch, undefined, version);
        return updated;
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
      const { storeManager: mgr, mutationQueue } = getProject(req);
      const noteId = parseNoteId(req.params.noteId);
      const note = mgr.getNote(noteId);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      await mutationQueue.enqueue(async () => {
        mgr.deleteNote(noteId);
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // Create edge (relation)
  router.post('/relations', requireWriteAccess, validateBody(createRelationSchema), async (req, res, next) => {
    try {
      const { storeManager: mgr, mutationQueue } = getProject(req);
      const { fromId, toId, kind, targetGraph } = req.body;
      const fromGraph: GraphName = 'knowledge';
      const toGraph: GraphName = targetGraph || 'knowledge';
      await mutationQueue.enqueue(async () => {
        mgr.createEdge({ fromGraph, fromId, toGraph, toId, kind });
      });
      res.status(201).json({ fromId, toId, kind, targetGraph: targetGraph || undefined });
    } catch (err) { next(err); }
  });

  // Delete edge (relation)
  router.delete('/relations', requireWriteAccess, validateBody(createRelationSchema.pick({ fromId: true, toId: true, targetGraph: true, projectId: true })), async (req, res, next) => {
    try {
      const { storeManager: mgr, mutationQueue } = getProject(req);
      const { fromId, toId, targetGraph } = req.body;
      const fromGraph: GraphName = 'knowledge';
      const toGraph: GraphName = targetGraph || 'knowledge';
      await mutationQueue.enqueue(async () => {
        mgr.deleteEdge({ fromGraph, fromId, toGraph, toId, kind: '' });
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // List edges for a note
  router.get('/notes/:noteId/relations', (req, res, next) => {
    try {
      const { storeManager: mgr } = getProject(req);
      const noteId = parseNoteId(req.params.noteId);
      const outgoing = mgr.findOutgoingEdges('knowledge', noteId);
      const incoming = mgr.findIncomingEdges('knowledge', noteId);
      const enriched = mgr.enrichRelations('knowledge', noteId, [...outgoing, ...incoming]);
      res.json({ results: enriched });
    } catch (err) { next(err); }
  });

  // Find notes linked to an external entity
  router.get('/linked', validateQuery(linkedQuerySchema), (req, res, next) => {
    try {
      const { storeManager: mgr } = getProject(req);
      const { targetGraph, targetNodeId } = req.validatedQuery;
      const edges = mgr.listEdges({ fromGraph: 'knowledge', toGraph: targetGraph as GraphName, toId: targetNodeId });
      const notes = edges
        .map(e => mgr.getNote(e.fromId))
        .filter((n): n is NonNullable<typeof n> => n != null);
      res.json({ results: notes });
    } catch (err) { next(err); }
  });

  // -- Attachments --

  // Upload attachment
  router.post('/notes/:noteId/attachments', requireWriteAccess, upload.single('file'), async (req, res, next) => {
    try {
      const { storeManager: mgr, mutationQueue } = getProject(req);
      const noteId = parseNoteId(req.params.noteId);
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
      const filename = attachmentFilenameSchema.parse(file.originalname);

      const note = mgr.getNote(noteId);
      if (!note) return res.status(404).json({ error: 'Note not found' });

      const meta = await mutationQueue.enqueue(async () => {
        return mgr.addAttachment('knowledge', noteId, note.slug, filename, file.buffer);
      });
      res.status(201).json(meta);
    } catch (err) { next(err); }
  });

  // List attachments
  router.get('/notes/:noteId/attachments', (req, res, next) => {
    try {
      const { storeManager: mgr } = getProject(req);
      const noteId = parseNoteId(req.params.noteId);
      const attachments = mgr.listAttachments('knowledge', noteId);
      res.json({ results: attachments });
    } catch (err) { next(err); }
  });

  // Download attachment
  router.get('/notes/:noteId/attachments/:filename', (req, res, next) => {
    try {
      const { storeManager: mgr } = getProject(req);
      const noteId = parseNoteId(req.params.noteId);
      const filename = attachmentFilenameSchema.parse(req.params.filename);

      const note = mgr.getNote(noteId);
      if (!note) return res.status(404).json({ error: 'Note not found' });

      const filePath = mgr.getAttachmentPath('knowledge', note.slug, filename);
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
      const { storeManager: mgr, mutationQueue } = getProject(req);
      const noteId = parseNoteId(req.params.noteId);
      const filename = attachmentFilenameSchema.parse(req.params.filename);

      const note = mgr.getNote(noteId);
      if (!note) return res.status(404).json({ error: 'Note not found' });

      await mutationQueue.enqueue(async () => {
        mgr.removeAttachment('knowledge', noteId, note.slug, filename);
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
