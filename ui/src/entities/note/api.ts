import { request, qs, unwrapList, type ListResponse } from '@/shared/api/client.ts';

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  version: number;
  createdBy?: string;
  updatedBy?: string;
}

export interface Relation {
  fromId: string;
  toId: string;
  kind: string;
  targetGraph?: string;
  title?: string;
}

export function listNotes(projectId: string, params?: { tag?: string; limit?: number }) {
  return request<ListResponse<Note>>(`/projects/${projectId}/knowledge/notes${qs({ tag: params?.tag, limit: params?.limit })}`).then(unwrapList);
}

export function getNote(projectId: string, noteId: string) {
  return request<Note>(`/projects/${projectId}/knowledge/notes/${noteId}`);
}

export function createNote(projectId: string, data: { title: string; content: string; tags?: string[] }) {
  return request<Note>(`/projects/${projectId}/knowledge/notes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateNote(projectId: string, noteId: string, data: { title?: string; content?: string; tags?: string[] }) {
  return request<Note>(`/projects/${projectId}/knowledge/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteNote(projectId: string, noteId: string) {
  return request<void>(`/projects/${projectId}/knowledge/notes/${noteId}`, {
    method: 'DELETE',
  });
}

export function searchNotes(projectId: string, query: string, params?: { topK?: number; minScore?: number }) {
  return request<ListResponse<Note & { score: number }>>(`/projects/${projectId}/knowledge/search${qs({ q: query, topK: params?.topK, minScore: params?.minScore })}`).then(unwrapList);
}

export function listRelations(projectId: string, noteId: string) {
  return request<ListResponse<Relation>>(`/projects/${projectId}/knowledge/notes/${noteId}/relations`).then(unwrapList);
}

export function createRelation(projectId: string, data: { fromId: string; toId: string; kind: string; targetGraph?: string }) {
  return request<Relation>(`/projects/${projectId}/knowledge/relations`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteRelation(projectId: string, data: { fromId: string; toId: string; targetGraph?: string }) {
  return request<void>(`/projects/${projectId}/knowledge/relations`, {
    method: 'DELETE',
    body: JSON.stringify(data),
  });
}

export function findLinkedNotes(projectId: string, targetGraph: string, targetNodeId: string) {
  return request<ListResponse<Note & { kind: string }>>(`/projects/${projectId}/knowledge/linked${qs({ targetGraph, targetNodeId })}`).then(unwrapList);
}

// -- Attachments --

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  addedAt: number;
}

export function listNoteAttachments(projectId: string, noteId: string) {
  return request<ListResponse<AttachmentMeta>>(`/projects/${projectId}/knowledge/notes/${noteId}/attachments`).then(unwrapList);
}

export async function uploadNoteAttachment(projectId: string, noteId: string, file: File): Promise<AttachmentMeta> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/projects/${projectId}/knowledge/notes/${noteId}/attachments`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export function deleteNoteAttachment(projectId: string, noteId: string, filename: string) {
  return request<void>(`/projects/${projectId}/knowledge/notes/${noteId}/attachments/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}

export function noteAttachmentUrl(projectId: string, noteId: string, filename: string): string {
  return `/api/projects/${projectId}/knowledge/notes/${noteId}/attachments/${encodeURIComponent(filename)}`;
}
