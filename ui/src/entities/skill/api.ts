import { request, requestUpload, qs, unwrapList, unwrapPaginated, type ListResponse, type PaginatedResponse } from '@/shared/api/client.ts';

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  addedAt: number;
}

export interface Skill {
  id: string;
  title: string;
  description: string;
  steps: string[];
  triggers: string[];
  inputHints: string[];
  filePatterns: string[];
  tags: string[];
  source: 'user' | 'learned';
  confidence: number;
  usageCount: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
  version: number;
  createdBy?: string;
  updatedBy?: string;
  attachments: AttachmentMeta[];
  // enriched fields from getSkill
  dependsOn?: Array<{ id: string; title: string }>;
  dependedBy?: Array<{ id: string; title: string }>;
  related?: Array<{ id: string; title: string }>;
  variants?: Array<{ id: string; title: string }>;
  crossLinks?: Array<{ nodeId: string; targetGraph: string; kind: string; direction: string }>;
  relations?: Array<{ fromId: string; toId: string; kind: string; targetGraph?: string; title?: string }>;
}

export interface SkillSearchResult {
  id: string;
  title: string;
  description: string;
  source: 'user' | 'learned';
  confidence: number;
  usageCount: number;
  tags: string[];
  score: number;
}

export interface SkillRelation {
  fromGraph: string;
  fromId: number;
  toGraph: string;
  toId: number;
  kind: string;
  targetGraph: string;
  targetId: number;
  title: string;
  direction: 'out' | 'in';
}

export function listSkills(projectId: string, params?: { source?: string; tag?: string; limit?: number; offset?: number }) {
  return request<PaginatedResponse<Skill>>(`/projects/${projectId}/skills${qs({ source: params?.source, tag: params?.tag, limit: params?.limit, offset: params?.offset })}`).then(unwrapPaginated);
}

export function getSkill(projectId: string, skillId: string) {
  return request<Skill>(`/projects/${projectId}/skills/${skillId}`);
}

export function createSkill(projectId: string, data: {
  title: string;
  description?: string;
  steps?: string[];
  triggers?: string[];
  inputHints?: string[];
  filePatterns?: string[];
  tags?: string[];
  source?: 'user' | 'learned';
  confidence?: number;
}) {
  return request<Skill>(`/projects/${projectId}/skills`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateSkill(projectId: string, skillId: string, data: Partial<Pick<Skill, 'title' | 'description' | 'steps' | 'triggers' | 'inputHints' | 'filePatterns' | 'tags' | 'source' | 'confidence'>>) {
  return request<Skill>(`/projects/${projectId}/skills/${skillId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteSkill(projectId: string, skillId: string) {
  return request<void>(`/projects/${projectId}/skills/${skillId}`, {
    method: 'DELETE',
  });
}

export function searchSkills(projectId: string, query: string, params?: { topK?: number; minScore?: number }) {
  return request<ListResponse<SkillSearchResult>>(`/projects/${projectId}/skills/search${qs({ q: query, topK: params?.topK, minScore: params?.minScore })}`).then(unwrapList);
}

export function bumpSkillUsage(projectId: string, skillId: string) {
  return request<Skill>(`/projects/${projectId}/skills/${skillId}/bump`, {
    method: 'POST',
  });
}

export function createSkillLink(projectId: string, data: { fromId: number; toId: number; kind: string; targetGraph?: string }) {
  return request<SkillRelation>(`/projects/${projectId}/skills/links`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteSkillLink(projectId: string, data: { fromId: number; toId: number; targetGraph?: string }) {
  return request<void>(`/projects/${projectId}/skills/links`, {
    method: 'DELETE',
    body: JSON.stringify(data),
  });
}

export function listSkillRelations(projectId: string, skillId: string) {
  return request<ListResponse<SkillRelation>>(`/projects/${projectId}/skills/${skillId}/relations`).then(unwrapList);
}

export function findLinkedSkills(projectId: string, targetGraph: string, targetNodeId: string) {
  return request<ListResponse<Skill & { kind: string }>>(`/projects/${projectId}/skills/linked${qs({ targetGraph, targetNodeId })}`).then(unwrapList);
}

// -- Attachments --

export function listSkillAttachments(projectId: string, skillId: string) {
  return request<ListResponse<AttachmentMeta>>(`/projects/${projectId}/skills/${skillId}/attachments`).then(unwrapList);
}

export async function uploadSkillAttachment(projectId: string, skillId: string, file: File): Promise<AttachmentMeta> {
  const form = new FormData();
  form.append('file', file);
  return requestUpload<AttachmentMeta>(`/projects/${projectId}/skills/${skillId}/attachments`, form);
}

export function deleteSkillAttachment(projectId: string, skillId: string, filename: string) {
  return request<void>(`/projects/${projectId}/skills/${skillId}/attachments/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}

export function skillAttachmentUrl(projectId: string, skillId: string, filename: string): string {
  return `/api/projects/${projectId}/skills/${skillId}/attachments/${encodeURIComponent(filename)}`;
}
