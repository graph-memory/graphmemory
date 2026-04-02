import fs from 'fs';
import mime from 'mime';
import { Router } from 'express';
import multer from 'multer';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateBody, validateQuery, createSkillSchema, updateSkillSchema, createSkillLinkSchema, skillSearchSchema, skillListSchema, linkedQuerySchema, attachmentFilenameSchema } from '@/api/rest/validation';
import { requireWriteAccess } from '@/api/rest/index';
import { VersionConflictError } from '@/store/types';
import type { Edge } from '@/store/types';
import { MAX_UPLOAD_SIZE } from '@/lib/defaults';
import type { UserConfig } from '@/lib/multi-config';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_SIZE } });

export function createSkillsRouter(_users?: Record<string, UserConfig>): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any) {
    return req.project as ProjectInstance & { storeManager: NonNullable<ProjectInstance['storeManager']> };
  }

  // List skills
  router.get('/', validateQuery(skillListSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const { results, total } = p.storeManager.listSkills(q);
      res.json({ results, total });
    } catch (err) { next(err); }
  });

  // Search skills
  router.get('/search', validateQuery(skillSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const results = await p.storeManager.searchSkills({
        text: q.q,
        searchMode: q.searchMode,
        maxResults: q.maxResults,
        minScore: q.minScore,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Recall skills (higher recall search for task contexts)
  router.get('/recall', validateQuery(skillSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = req.validatedQuery;
      const results = await p.storeManager.searchSkills({
        text: q.q,
        searchMode: q.searchMode,
        maxResults: q.maxResults,
        minScore: q.minScore ?? 0.3,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Find skills linked to an external entity
  router.get('/linked', validateQuery(linkedQuerySchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const { targetGraph, targetNodeId, kind } = req.validatedQuery;
      const edges = p.storeManager.findIncomingEdges(targetGraph, Number(targetNodeId));
      const filtered = edges.filter((e: Edge) => e.fromGraph === 'skills' && (!kind || e.kind === kind));
      const results = filtered.map((e: Edge) => {
        const skill = p.storeManager.getSkill(e.fromId);
        return skill ? { ...skill, edgeKind: e.kind } : null;
      }).filter(Boolean);
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Get skill
  router.get('/:skillId', (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = Number(req.params.skillId);
      const skill = p.storeManager.getSkill(skillId);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      const edges = [
        ...p.storeManager.findOutgoingEdges('skills', skillId),
        ...p.storeManager.findIncomingEdges('skills', skillId),
      ];
      res.json({ ...skill, relations: edges });
    } catch (err) { next(err); }
  });

  // Create skill
  router.post('/', requireWriteAccess, validateBody(createSkillSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { title, description, steps, triggers, inputHints, filePatterns, tags, source, confidence } = req.body;
      const created = await p.mutationQueue.enqueue(async () => {
        const skill = await p.storeManager.createSkill({
          title, description, steps, triggers, inputHints, filePatterns, tags, source, confidence,
        });
        return p.storeManager.getSkill(skill.id);
      });
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  // Update skill
  router.put('/:skillId', requireWriteAccess, validateBody(updateSkillSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = Number(req.params.skillId);
      const { version, ...patch } = req.body;
      const result = await p.mutationQueue.enqueue(async () => {
        const updated = await p.storeManager.updateSkill(skillId, patch, undefined, version);
        return p.storeManager.getSkill(updated.id);
      });
      res.json(result);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return res.status(409).json({ error: 'version_conflict', current: err.current, expected: err.expected });
      }
      next(err);
    }
  });

  // Bump usage
  router.post('/:skillId/bump', requireWriteAccess, async (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = Number(req.params.skillId);
      const result = await p.mutationQueue.enqueue(async () => {
        p.storeManager.bumpSkillUsage(skillId);
        return p.storeManager.getSkill(skillId);
      });
      if (!result) return res.status(404).json({ error: 'Skill not found' });
      res.json(result);
    } catch (err) { next(err); }
  });

  // Delete skill
  router.delete('/:skillId', requireWriteAccess, async (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = Number(req.params.skillId);
      const existing = p.storeManager.getSkill(skillId);
      if (!existing) return res.status(404).json({ error: 'Skill not found' });
      await p.mutationQueue.enqueue(async () => {
        p.storeManager.deleteSkill(skillId);
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // Create skill link (skill-to-skill or cross-graph)
  router.post('/links', requireWriteAccess, validateBody(createSkillLinkSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, kind, targetGraph } = req.body;
      await p.mutationQueue.enqueue(async () => {
        p.storeManager.createEdge({
          fromGraph: 'skills',
          fromId: Number(fromId),
          toGraph: targetGraph ?? 'skills',
          toId: Number(toId),
          kind: kind ?? 'related',
        });
      });
      res.status(201).json({ fromId, toId, kind, targetGraph: targetGraph || undefined });
    } catch (err) { next(err); }
  });

  // Delete skill link
  router.delete('/links', requireWriteAccess, validateBody(createSkillLinkSchema.pick({ fromId: true, toId: true, targetGraph: true, projectId: true })), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, targetGraph } = req.body;
      await p.mutationQueue.enqueue(async () => {
        p.storeManager.deleteEdge({
          fromGraph: 'skills',
          fromId: Number(fromId),
          toGraph: targetGraph ?? 'skills',
          toId: Number(toId),
          kind: '',
        });
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // List relations for a skill
  router.get('/:skillId/relations', (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = Number(req.params.skillId);
      const edges = [
        ...p.storeManager.findOutgoingEdges('skills', skillId),
        ...p.storeManager.findIncomingEdges('skills', skillId),
      ];
      res.json({ results: edges });
    } catch (err) { next(err); }
  });

  // -- Attachments --

  // Upload attachment
  router.post('/:skillId/attachments', requireWriteAccess, upload.single('file'), async (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = Number(req.params.skillId);
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
      const filename = attachmentFilenameSchema.parse(file.originalname);

      const skill = p.storeManager.getSkill(skillId);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });

      const meta = await p.mutationQueue.enqueue(async () => {
        return p.storeManager.addAttachment('skills', skillId, skill.slug, filename, file.buffer);
      });
      res.status(201).json(meta);
    } catch (err) { next(err); }
  });

  // List attachments
  router.get('/:skillId/attachments', (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = Number(req.params.skillId);
      const attachments = p.storeManager.listAttachments('skills', skillId);
      res.json({ results: attachments });
    } catch (err) { next(err); }
  });

  // Download attachment
  router.get('/:skillId/attachments/:filename', (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = Number(req.params.skillId);
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      const skill = p.storeManager.getSkill(skillId);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      const filePath = p.storeManager.getAttachmentPath('skills', skill.slug, filename);
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
  router.delete('/:skillId/attachments/:filename', requireWriteAccess, async (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = Number(req.params.skillId);
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      const skill = p.storeManager.getSkill(skillId);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      await p.mutationQueue.enqueue(async () => {
        p.storeManager.removeAttachment('skills', skillId, skill.slug, filename);
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
