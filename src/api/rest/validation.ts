import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Validation middleware factory
// ---------------------------------------------------------------------------

type ZodSchema = z.ZodTypeAny;

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).validatedQuery = schema.parse(req.query);
    next();
  };
}

// ---------------------------------------------------------------------------
// Knowledge schemas
// ---------------------------------------------------------------------------

export const createNoteSchema = z.object({
  title:   z.string().min(1).max(500),
  content: z.string().max(1_000_000),
  tags:    z.array(z.string().max(100)).max(100).optional().default([]),
});

export const updateNoteSchema = z.object({
  title:   z.string().min(1).max(500).optional(),
  content: z.string().max(1_000_000).optional(),
  tags:    z.array(z.string().max(100)).max(100).optional(),
  version: z.number().int().positive().optional(),
});

export const createRelationSchema = z.object({
  fromId: z.string().min(1),
  toId:   z.string().min(1),
  kind:   z.string().min(1),
  targetGraph: z.enum(['docs', 'code', 'files', 'tasks', 'skills']).optional(),
  projectId: z.string().min(1).optional(),
});

export const noteSearchSchema = z.object({
  q:          z.string().min(1).max(2000),
  topK:       z.coerce.number().int().positive().max(500).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
});

export const noteListSchema = z.object({
  filter: z.string().optional(),
  tag:    z.string().optional(),
  limit:  z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Task schemas
// ---------------------------------------------------------------------------

export const createTaskSchema = z.object({
  title:       z.string().min(1).max(500),
  description: z.string().max(500_000).default(''),
  status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).default('todo'),
  priority:    z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  tags:        z.array(z.string().max(100)).max(100).optional().default([]),
  dueDate:     z.number().nullable().optional(),
  estimate:    z.number().nullable().optional(),
  assignee:    z.string().max(100).nullable().optional(),
});

export const updateTaskSchema = z.object({
  title:       z.string().min(1).max(500).optional(),
  description: z.string().max(500_000).optional(),
  status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  priority:    z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tags:        z.array(z.string().max(100)).max(100).optional(),
  dueDate:     z.number().nullable().optional(),
  estimate:    z.number().nullable().optional(),
  assignee:    z.string().max(100).nullable().optional(),
  version:     z.number().int().positive().optional(),
});

export const moveTaskSchema = z.object({
  status:  z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']),
  version: z.number().int().positive().optional(),
});

export const createTaskLinkSchema = z.object({
  fromId: z.string().min(1),
  toId:   z.string().min(1),
  kind:   z.string().min(1),
  targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills']).optional(),
  projectId: z.string().min(1).optional(),
});

export const taskSearchSchema = z.object({
  q:          z.string().min(1).max(2000),
  topK:       z.coerce.number().int().positive().max(500).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
});

export const taskListSchema = z.object({
  status:   z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tag:      z.string().optional(),
  filter:   z.string().optional(),
  assignee: z.string().optional(),
  limit:    z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Search schemas (docs, code, files)
// ---------------------------------------------------------------------------

export const searchQuerySchema = z.object({
  q:          z.string().min(1).max(2000),
  topK:       z.coerce.number().int().positive().max(500).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
});

export const listQuerySchema = z.object({
  filter: z.string().optional(),
  limit:  z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// File index schemas
// ---------------------------------------------------------------------------

export const fileListSchema = z.object({
  directory: z.string().optional(),
  extension: z.string().optional(),
  language:  z.string().optional(),
  filter:    z.string().optional(),
  limit:     z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Graph export schema
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Skill schemas
// ---------------------------------------------------------------------------

export const createSkillSchema = z.object({
  title:        z.string().min(1).max(500),
  description:  z.string().max(500_000).default(''),
  steps:        z.array(z.string().max(10_000)).max(100).optional().default([]),
  triggers:     z.array(z.string().max(500)).max(50).optional().default([]),
  inputHints:   z.array(z.string().max(500)).max(50).optional().default([]),
  filePatterns: z.array(z.string().max(500)).max(50).optional().default([]),
  tags:         z.array(z.string().max(100)).max(100).optional().default([]),
  source:       z.enum(['user', 'learned']).default('user'),
  confidence:   z.number().min(0).max(1).default(1),
});

export const updateSkillSchema = z.object({
  title:        z.string().min(1).max(500).optional(),
  description:  z.string().max(500_000).optional(),
  steps:        z.array(z.string().max(10_000)).max(100).optional(),
  triggers:     z.array(z.string().max(500)).max(50).optional(),
  inputHints:   z.array(z.string().max(500)).max(50).optional(),
  filePatterns: z.array(z.string().max(500)).max(50).optional(),
  tags:         z.array(z.string().max(100)).max(100).optional(),
  source:       z.enum(['user', 'learned']).optional(),
  confidence:   z.number().min(0).max(1).optional(),
  version:      z.number().int().positive().optional(),
});

export const createSkillLinkSchema = z.object({
  fromId:      z.string().min(1),
  toId:        z.string().min(1),
  kind:        z.string().min(1),
  targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks']).optional(),
  projectId:   z.string().min(1).optional(),
});

export const skillSearchSchema = z.object({
  q:          z.string().min(1).max(2000),
  topK:       z.coerce.number().int().positive().max(500).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
});

export const skillListSchema = z.object({
  source: z.enum(['user', 'learned']).optional(),
  tag:    z.string().optional(),
  filter: z.string().optional(),
  limit:  z.coerce.number().int().positive().optional(),
});

export const graphExportSchema = z.object({
  scope: z.enum(['all', 'docs', 'code', 'knowledge', 'tasks', 'files', 'skills']).default('all'),
});

// ---------------------------------------------------------------------------
// Attachment schemas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Linked query schema (cross-graph reverse lookup)
// ---------------------------------------------------------------------------

export const linkedQuerySchema = z.object({
  targetGraph:  z.enum(['docs', 'code', 'files', 'knowledge', 'tasks', 'skills']),
  targetNodeId: z.string().min(1).max(500),
  kind:         z.string().max(100).optional(),
  projectId:    z.string().max(200).optional(),
});

// ---------------------------------------------------------------------------
// Attachment schemas
// ---------------------------------------------------------------------------

/** Validates an attachment filename (path param). No path separators, no .., no dangerous chars. */
export const attachmentFilenameSchema = z.string()
  .min(1)
  .max(255)
  .refine(s => !/[/\\]/.test(s), 'Filename must not contain path separators')
  .refine(s => !s.includes('..'), 'Filename must not contain ..')
  .refine(s => !s.includes('\0'), 'Filename must not contain null bytes')
  .refine(s => !/[\x00-\x1f\x7f"<>|?*]/.test(s), 'Filename contains invalid characters');
