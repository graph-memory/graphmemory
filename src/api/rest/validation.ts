import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import {
  MAX_TITLE_LEN,
  MAX_NOTE_CONTENT_LEN,
  MAX_TAG_LEN,
  MAX_TAGS_COUNT,
  MAX_SEARCH_QUERY_LEN,
  MAX_SEARCH_TOP_K,
  MAX_DESCRIPTION_LEN,
  MAX_ASSIGNEE_LEN,
  MAX_SKILL_STEP_LEN,
  MAX_SKILL_STEPS_COUNT,
  MAX_SKILL_TRIGGER_LEN,
  MAX_SKILL_TRIGGERS_COUNT,
  MAX_TARGET_NODE_ID_LEN,
  MAX_LINK_KIND_LEN,
  MAX_PROJECT_ID_LEN,
  MAX_ATTACHMENT_FILENAME_LEN,
} from '@/lib/defaults';

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
  title:   z.string().min(1).max(MAX_TITLE_LEN),
  content: z.string().max(MAX_NOTE_CONTENT_LEN),
  tags:    z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().default([]),
});

export const updateNoteSchema = z.object({
  title:   z.string().min(1).max(MAX_TITLE_LEN).optional(),
  content: z.string().max(MAX_NOTE_CONTENT_LEN).optional(),
  tags:    z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional(),
  version: z.number().int().positive().optional(),
});

export const createRelationSchema = z.object({
  fromId: z.string().min(1).max(MAX_TARGET_NODE_ID_LEN),
  toId:   z.string().min(1).max(MAX_TARGET_NODE_ID_LEN),
  kind:   z.string().min(1).max(MAX_LINK_KIND_LEN),
  targetGraph: z.enum(['docs', 'code', 'files', 'tasks', 'skills']).optional(),
  projectId: z.string().min(1).max(MAX_PROJECT_ID_LEN).optional(),
});

export const noteSearchSchema = z.object({
  q:          z.string().min(1).max(MAX_SEARCH_QUERY_LEN),
  topK:       z.coerce.number().int().positive().max(MAX_SEARCH_TOP_K).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
  bfsDepth:   z.coerce.number().int().min(0).max(10).optional(),
  maxResults: z.coerce.number().int().min(1).max(500).optional(),
  bfsDecay:   z.coerce.number().min(0).max(1).optional(),
});

export const noteListSchema = z.object({
  filter: z.string().max(500).optional(),
  tag:    z.string().max(MAX_TAG_LEN).optional(),
  limit:  z.coerce.number().int().positive().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Task schemas
// ---------------------------------------------------------------------------

export const createTaskSchema = z.object({
  title:       z.string().min(1).max(MAX_TITLE_LEN),
  description: z.string().max(MAX_DESCRIPTION_LEN).default(''),
  status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).default('todo'),
  priority:    z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  tags:        z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().default([]),
  dueDate:     z.number().nullable().optional(),
  estimate:    z.number().nullable().optional(),
  assignee:    z.string().max(MAX_ASSIGNEE_LEN).nullable().optional(),
  order:       z.number().int().optional(),
});

export const updateTaskSchema = z.object({
  title:       z.string().min(1).max(MAX_TITLE_LEN).optional(),
  description: z.string().max(MAX_DESCRIPTION_LEN).optional(),
  status:      z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  priority:    z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tags:        z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional(),
  order:       z.number().int().optional(),
  dueDate:     z.number().nullable().optional(),
  estimate:    z.number().nullable().optional(),
  assignee:    z.string().max(MAX_ASSIGNEE_LEN).nullable().optional(),
  version:     z.number().int().positive().optional(),
});

export const moveTaskSchema = z.object({
  status:  z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']),
  version: z.number().int().positive().optional(),
  order:   z.number().int().min(0).optional(),
});

export const reorderTaskSchema = z.object({
  order:  z.number().int(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
});

export const bulkMoveSchema = z.object({
  taskIds: z.array(z.string().min(1).max(500)).min(1).max(100),
  status:  z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']),
});

export const bulkPrioritySchema = z.object({
  taskIds:  z.array(z.string().min(1).max(500)).min(1).max(100),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
});

export const bulkDeleteSchema = z.object({
  taskIds: z.array(z.string().min(1).max(500)).min(1).max(100),
});

export const createTaskLinkSchema = z.object({
  fromId: z.string().min(1).max(MAX_TARGET_NODE_ID_LEN),
  toId:   z.string().min(1).max(MAX_TARGET_NODE_ID_LEN),
  kind:   z.string().min(1).max(MAX_LINK_KIND_LEN),
  targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills']).optional(),
  projectId: z.string().min(1).max(MAX_PROJECT_ID_LEN).optional(),
});

export const taskSearchSchema = z.object({
  q:          z.string().min(1).max(MAX_SEARCH_QUERY_LEN),
  topK:       z.coerce.number().int().positive().max(MAX_SEARCH_TOP_K).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
  bfsDepth:   z.coerce.number().int().min(0).max(10).optional(),
  maxResults: z.coerce.number().int().min(1).max(500).optional(),
  bfsDecay:   z.coerce.number().min(0).max(1).optional(),
});

export const taskListSchema = z.object({
  status:   z.enum(['backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tag:      z.string().max(MAX_TAG_LEN).optional(),
  filter:   z.string().max(500).optional(),
  assignee: z.string().max(MAX_ASSIGNEE_LEN).optional(),
  limit:    z.coerce.number().int().positive().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Search schemas (docs, code, files)
// ---------------------------------------------------------------------------

export const searchQuerySchema = z.object({
  q:          z.string().min(1).max(MAX_SEARCH_QUERY_LEN),
  topK:       z.coerce.number().int().positive().max(MAX_SEARCH_TOP_K).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
  bfsDepth:   z.coerce.number().int().min(0).max(10).optional(),
  maxResults: z.coerce.number().int().min(1).max(500).optional(),
  bfsDecay:   z.coerce.number().min(0).max(1).optional(),
  includeBody: z.coerce.boolean().optional(),
});

export const listQuerySchema = z.object({
  filter: z.string().max(500).optional(),
  limit:  z.coerce.number().int().positive().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// File index schemas
// ---------------------------------------------------------------------------

export const fileSearchSchema = z.object({
  q:          z.string().min(1).max(MAX_SEARCH_QUERY_LEN),
  topK:       z.coerce.number().int().positive().max(MAX_SEARCH_TOP_K).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
});

export const fileListSchema = z.object({
  directory: z.string().max(4096).optional(),
  extension: z.string().max(100).optional(),
  language:  z.string().max(100).optional(),
  filter:    z.string().max(500).optional(),
  limit:     z.coerce.number().int().positive().max(1000).optional().default(50),
});

// ---------------------------------------------------------------------------
// Skill schemas
// ---------------------------------------------------------------------------

export const createSkillSchema = z.object({
  title:        z.string().min(1).max(MAX_TITLE_LEN),
  description:  z.string().max(MAX_DESCRIPTION_LEN).default(''),
  steps:        z.array(z.string().max(MAX_SKILL_STEP_LEN)).max(MAX_SKILL_STEPS_COUNT).optional().default([]),
  triggers:     z.array(z.string().max(MAX_SKILL_TRIGGER_LEN)).max(MAX_SKILL_TRIGGERS_COUNT).optional().default([]),
  inputHints:   z.array(z.string().max(MAX_SKILL_TRIGGER_LEN)).max(MAX_SKILL_TRIGGERS_COUNT).optional().default([]),
  filePatterns: z.array(z.string().max(MAX_SKILL_TRIGGER_LEN)).max(MAX_SKILL_TRIGGERS_COUNT).optional().default([]),
  tags:         z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().default([]),
  source:       z.enum(['user', 'learned']).default('user'),
  confidence:   z.number().min(0).max(1).default(1),
});

export const updateSkillSchema = z.object({
  title:        z.string().min(1).max(MAX_TITLE_LEN).optional(),
  description:  z.string().max(MAX_DESCRIPTION_LEN).optional(),
  steps:        z.array(z.string().max(MAX_SKILL_STEP_LEN)).max(MAX_SKILL_STEPS_COUNT).optional(),
  triggers:     z.array(z.string().max(MAX_SKILL_TRIGGER_LEN)).max(MAX_SKILL_TRIGGERS_COUNT).optional(),
  inputHints:   z.array(z.string().max(MAX_SKILL_TRIGGER_LEN)).max(MAX_SKILL_TRIGGERS_COUNT).optional(),
  filePatterns: z.array(z.string().max(MAX_SKILL_TRIGGER_LEN)).max(MAX_SKILL_TRIGGERS_COUNT).optional(),
  tags:         z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional(),
  source:       z.enum(['user', 'learned']).optional(),
  confidence:   z.number().min(0).max(1).optional(),
  version:      z.number().int().positive().optional(),
});

export const createSkillLinkSchema = z.object({
  fromId:      z.string().min(1).max(MAX_TARGET_NODE_ID_LEN),
  toId:        z.string().min(1).max(MAX_TARGET_NODE_ID_LEN),
  kind:        z.string().min(1).max(MAX_LINK_KIND_LEN),
  targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'tasks']).optional(),
  projectId:   z.string().min(1).max(MAX_PROJECT_ID_LEN).optional(),
});

export const skillSearchSchema = z.object({
  q:          z.string().min(1).max(MAX_SEARCH_QUERY_LEN),
  topK:       z.coerce.number().int().positive().max(MAX_SEARCH_TOP_K).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
  bfsDepth:   z.coerce.number().int().min(0).max(10).optional(),
  maxResults: z.coerce.number().int().min(1).max(500).optional(),
  bfsDecay:   z.coerce.number().min(0).max(1).optional(),
});

export const skillListSchema = z.object({
  source: z.enum(['user', 'learned']).optional(),
  tag:    z.string().max(MAX_TAG_LEN).optional(),
  filter: z.string().max(500).optional(),
  limit:  z.coerce.number().int().positive().max(1000).optional(),
});


// ---------------------------------------------------------------------------
// Epic schemas
// ---------------------------------------------------------------------------

export const createEpicSchema = z.object({
  title:       z.string().min(1).max(MAX_TITLE_LEN),
  description: z.string().max(MAX_DESCRIPTION_LEN).default(''),
  status:      z.enum(['open', 'in_progress', 'done', 'cancelled']).default('open'),
  priority:    z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  tags:        z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional().default([]),
});

export const updateEpicSchema = z.object({
  title:       z.string().min(1).max(MAX_TITLE_LEN).optional(),
  description: z.string().max(MAX_DESCRIPTION_LEN).optional(),
  status:      z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  priority:    z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tags:        z.array(z.string().max(MAX_TAG_LEN)).max(MAX_TAGS_COUNT).optional(),
  version:     z.number().int().positive().optional(),
});

export const epicSearchSchema = z.object({
  q:          z.string().min(1).max(MAX_SEARCH_QUERY_LEN),
  topK:       z.coerce.number().int().positive().max(MAX_SEARCH_TOP_K).optional(),
  minScore:   z.coerce.number().min(0).max(1).optional(),
  searchMode: z.enum(['hybrid', 'vector', 'keyword']).optional(),
});

export const epicListSchema = z.object({
  status:   z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  tag:      z.string().max(MAX_TAG_LEN).optional(),
  filter:   z.string().max(500).optional(),
  limit:    z.coerce.number().int().positive().max(1000).optional(),
});

export const epicLinkSchema = z.object({
  taskId: z.string().min(1).max(500),
});

// ---------------------------------------------------------------------------
// Linked query schema (cross-graph reverse lookup)
// ---------------------------------------------------------------------------

export const linkedQuerySchema = z.object({
  targetGraph:  z.enum(['docs', 'code', 'files', 'knowledge', 'tasks', 'skills']),
  targetNodeId: z.string().min(1).max(MAX_TARGET_NODE_ID_LEN),
  kind:         z.string().max(MAX_LINK_KIND_LEN).optional(),
  projectId:    z.string().max(MAX_PROJECT_ID_LEN).optional(),
});

// ---------------------------------------------------------------------------
// Attachment schemas
// ---------------------------------------------------------------------------

/** Validates an attachment filename (path param). No path separators, no .., no dangerous chars. */
export const attachmentFilenameSchema = z.string()
  .min(1)
  .max(MAX_ATTACHMENT_FILENAME_LEN)
  .refine(s => !/[/\\]/.test(s), 'Filename must not contain path separators')
  .refine(s => !s.includes('..'), 'Filename must not contain ..')
  .refine(s => !s.includes('\0'), 'Filename must not contain null bytes')
  .refine(s => !/[\x00-\x1f\x7f"<>|?*]/.test(s), 'Filename contains invalid characters');
