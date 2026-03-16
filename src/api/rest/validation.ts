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
  title:   z.string().min(1),
  content: z.string(),
  tags:    z.array(z.string()).optional().default([]),
});

export const updateNoteSchema = z.object({
  title:   z.string().min(1).optional(),
  content: z.string().optional(),
  tags:    z.array(z.string()).optional(),
});

export const createRelationSchema = z.object({
  fromId: z.string().min(1),
  toId:   z.string().min(1),
  kind:   z.string().min(1),
  targetGraph: z.enum(['docs', 'code', 'files', 'tasks', 'skills']).optional(),
});

export const noteSearchSchema = z.object({
  q:          z.string().min(1),
  topK:       z.coerce.number().int().positive().optional(),
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
  title:       z.string().min(1),
  description: z.string().default(''),
  status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).default('todo'),
  priority:    z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  tags:        z.array(z.string()).optional().default([]),
  dueDate:     z.number().nullable().optional(),
  estimate:    z.number().nullable().optional(),
});

export const updateTaskSchema = z.object({
  title:       z.string().min(1).optional(),
  description: z.string().optional(),
  status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  priority:    z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tags:        z.array(z.string()).optional(),
  dueDate:     z.number().nullable().optional(),
  estimate:    z.number().nullable().optional(),
});

export const moveTaskSchema = z.object({
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']),
});

export const createTaskLinkSchema = z.object({
  fromId: z.string().min(1),
  toId:   z.string().min(1),
  kind:   z.string().min(1),
  targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills']).optional(),
});

export const taskSearchSchema = z.object({
  q:          z.string().min(1),
  topK:       z.coerce.number().int().positive().optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
});

export const taskListSchema = z.object({
  status:   z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tag:      z.string().optional(),
  filter:   z.string().optional(),
  limit:    z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Search schemas (docs, code, files)
// ---------------------------------------------------------------------------

export const searchQuerySchema = z.object({
  q:          z.string().min(1),
  topK:       z.coerce.number().int().positive().optional(),
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
  title:        z.string().min(1),
  description:  z.string().default(''),
  steps:        z.array(z.string()).optional().default([]),
  triggers:     z.array(z.string()).optional().default([]),
  inputHints:   z.array(z.string()).optional().default([]),
  filePatterns: z.array(z.string()).optional().default([]),
  tags:         z.array(z.string()).optional().default([]),
  source:       z.enum(['user', 'learned']).default('user'),
  confidence:   z.number().min(0).max(1).default(1),
});

export const updateSkillSchema = z.object({
  title:        z.string().min(1).optional(),
  description:  z.string().optional(),
  steps:        z.array(z.string()).optional(),
  triggers:     z.array(z.string()).optional(),
  inputHints:   z.array(z.string()).optional(),
  filePatterns: z.array(z.string()).optional(),
  tags:         z.array(z.string()).optional(),
  source:       z.enum(['user', 'learned']).optional(),
  confidence:   z.number().min(0).max(1).optional(),
});

export const createSkillLinkSchema = z.object({
  fromId:      z.string().min(1),
  toId:        z.string().min(1),
  kind:        z.string().min(1),
  targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks']).optional(),
});

export const skillSearchSchema = z.object({
  q:          z.string().min(1),
  topK:       z.coerce.number().int().positive().optional(),
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

/** Validates an attachment filename (path param). No path separators, no .., no null bytes. */
export const attachmentFilenameSchema = z.string()
  .min(1)
  .refine(s => !/[/\\]/.test(s), 'Filename must not contain path separators')
  .refine(s => !s.includes('..'), 'Filename must not contain ..')
  .refine(s => !s.includes('\0'), 'Filename must not contain null bytes');
