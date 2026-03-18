import fs from 'fs';
import { getMimeType } from '@/lib/mime';
import { Router } from 'express';
import multer from 'multer';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateBody, validateQuery, createSkillSchema, updateSkillSchema, createSkillLinkSchema, skillSearchSchema, skillListSchema, linkedQuerySchema, attachmentFilenameSchema } from '@/api/rest/validation';
import { requireWriteAccess } from '@/api/rest/index';
import { VersionConflictError } from '@/graphs/manager-types';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export function createSkillsRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any) {
    return req.project as ProjectInstance & { skillManager: NonNullable<ProjectInstance['skillManager']> };
  }

  // List skills
  router.get('/', validateQuery(skillListSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const q = (req as any).validatedQuery;
      const skills = p.skillManager.listSkills(q);
      res.json({ results: skills });
    } catch (err) { next(err); }
  });

  // Search skills
  router.get('/search', validateQuery(skillSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = (req as any).validatedQuery;
      const results = await p.skillManager.searchSkills(q.q, {
        topK: q.topK,
        minScore: q.minScore,
        searchMode: q.searchMode,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Recall skills (higher recall search for task contexts)
  router.get('/recall', validateQuery(skillSearchSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const q = (req as any).validatedQuery;
      const results = await p.skillManager.searchSkills(q.q, {
        topK: q.topK,
        minScore: q.minScore ?? 0.3,
        searchMode: q.searchMode,
      });
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Find skills linked to an external entity
  router.get('/linked', validateQuery(linkedQuerySchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const { targetGraph, targetNodeId, kind, projectId } = (req as any).validatedQuery;
      const skills = p.skillManager.findLinkedSkills(targetGraph, targetNodeId, kind, projectId ?? (req.params as any).projectId);
      res.json({ results: skills });
    } catch (err) { next(err); }
  });

  // Get skill
  router.get('/:skillId', (req, res, next) => {
    try {
      const p = getProject(req);
      const skill = p.skillManager.getSkill(req.params.skillId as string);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      const relations = p.skillManager.listRelations(req.params.skillId as string);
      res.json({ ...skill, relations });
    } catch (err) { next(err); }
  });

  // Create skill
  router.post('/', requireWriteAccess, validateBody(createSkillSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { title, description, steps, triggers, inputHints, filePatterns, tags, source, confidence } = req.body;
      const created = await p.mutationQueue.enqueue(async () => {
        const skillId = await p.skillManager.createSkill(title, description, steps, triggers, inputHints, filePatterns, tags, source, confidence);
        return p.skillManager.getSkill(skillId);
      });
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  // Update skill
  router.put('/:skillId', requireWriteAccess, validateBody(updateSkillSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = req.params.skillId as string;
      const { version, ...patch } = req.body;
      const result = await p.mutationQueue.enqueue(async () => {
        const ok = await p.skillManager.updateSkill(skillId, patch, version);
        if (!ok) return null;
        return p.skillManager.getSkill(skillId);
      });
      if (!result) return res.status(404).json({ error: 'Skill not found' });
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
      const skillId = req.params.skillId as string;
      const result = await p.mutationQueue.enqueue(async () => {
        const ok = p.skillManager.bumpUsage(skillId);
        if (!ok) return null;
        return p.skillManager.getSkill(skillId);
      });
      if (!result) return res.status(404).json({ error: 'Skill not found' });
      res.json(result);
    } catch (err) { next(err); }
  });

  // Delete skill
  router.delete('/:skillId', requireWriteAccess, async (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = req.params.skillId as string;
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.skillManager.deleteSkill(skillId);
      });
      if (!ok) return res.status(404).json({ error: 'Skill not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // Create skill link (skill-to-skill or cross-graph)
  router.post('/links', requireWriteAccess, validateBody(createSkillLinkSchema), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, kind, targetGraph, projectId } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        if (targetGraph) {
          return p.skillManager.createCrossLink(fromId, toId, targetGraph, kind, projectId);
        } else {
          return p.skillManager.linkSkills(fromId, toId, kind);
        }
      });
      if (!ok) return res.status(400).json({ error: 'Failed to create link' });
      res.status(201).json({ fromId, toId, kind, targetGraph: targetGraph || undefined });
    } catch (err) { next(err); }
  });

  // Delete skill link
  router.delete('/links', requireWriteAccess, validateBody(createSkillLinkSchema.pick({ fromId: true, toId: true, targetGraph: true, projectId: true })), async (req, res, next) => {
    try {
      const p = getProject(req);
      const { fromId, toId, targetGraph, projectId } = req.body;
      const ok = await p.mutationQueue.enqueue(async () => {
        if (targetGraph) {
          return p.skillManager.deleteCrossLink(fromId, toId, targetGraph, projectId);
        } else {
          return p.skillManager.deleteSkillLink(fromId, toId);
        }
      });
      if (!ok) return res.status(404).json({ error: 'Link not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // List relations for a skill
  router.get('/:skillId/relations', (req, res, next) => {
    try {
      const p = getProject(req);
      const relations = p.skillManager.listRelations(req.params.skillId as string);
      res.json({ results: relations });
    } catch (err) { next(err); }
  });

  // -- Attachments --

  // Upload attachment
  router.post('/:skillId/attachments', requireWriteAccess, upload.single('file'), async (req, res, next) => {
    try {
      const p = getProject(req);
      const skillId = req.params.skillId as string;
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const meta = await p.mutationQueue.enqueue(async () => {
        return p.skillManager.addAttachment(skillId, file.originalname, file.buffer);
      });
      if (!meta) return res.status(404).json({ error: 'Skill not found' });
      res.status(201).json(meta);
    } catch (err) { next(err); }
  });

  // List attachments
  router.get('/:skillId/attachments', (req, res, next) => {
    try {
      const p = getProject(req);
      const attachments = p.skillManager.listAttachments(req.params.skillId as string);
      res.json({ results: attachments });
    } catch (err) { next(err); }
  });

  // Download attachment
  router.get('/:skillId/attachments/:filename', (req, res, next) => {
    try {
      const p = getProject(req);
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      const filePath = p.skillManager.getAttachmentPath(req.params.skillId as string, filename);
      if (!filePath) return res.status(404).json({ error: 'Attachment not found' });
      const mimeType = getMimeType(filePath) ?? 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
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
      const skillId = req.params.skillId as string;
      const filename = attachmentFilenameSchema.parse(req.params.filename);
      const ok = await p.mutationQueue.enqueue(async () => {
        return p.skillManager.removeAttachment(skillId, filename);
      });
      if (!ok) return res.status(404).json({ error: 'Attachment not found' });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
