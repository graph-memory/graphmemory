import { request, requestUpload, qs, unwrapList, unwrapPaginated, type ListResponse, type PaginatedResponse } from '@/shared/api/client.ts';

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  order: number;
  dueDate: number | null;
  estimate: number | null;
  completedAt: number | null;
  assigneeId: number | null;
  createdAt: number;
  updatedAt: number;
  version: number;
  createdBy?: string;
  updatedBy?: string;
}

export function listTasks(projectId: string, params?: { status?: TaskStatus; priority?: TaskPriority; tag?: string; assigneeId?: number; limit?: number; offset?: number }) {
  return request<PaginatedResponse<Task>>(`/projects/${projectId}/tasks${qs({ status: params?.status, priority: params?.priority, tag: params?.tag, assigneeId: params?.assigneeId, limit: params?.limit, offset: params?.offset })}`).then(unwrapPaginated);
}

export function getTask(projectId: string, taskId: string) {
  return request<Task>(`/projects/${projectId}/tasks/${taskId}`);
}

export function createTask(projectId: string, data: { title: string; description?: string; status?: TaskStatus; priority?: TaskPriority; tags?: string[]; dueDate?: number | null; estimate?: number | null; assigneeId?: number | null }) {
  return request<Task>(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateTask(projectId: string, taskId: string, data: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'tags' | 'dueDate' | 'estimate' | 'assigneeId'>>) {
  return request<Task>(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function moveTask(projectId: string, taskId: string, status: TaskStatus, order?: number) {
  return request<Task>(`/projects/${projectId}/tasks/${taskId}/move`, {
    method: 'POST',
    body: JSON.stringify({ status, ...(order !== undefined ? { order } : {}) }),
  });
}

export function reorderTask(projectId: string, taskId: string, order: number, status?: TaskStatus) {
  return request<Task>(`/projects/${projectId}/tasks/${taskId}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ order, ...(status ? { status } : {}) }),
  });
}

// -- Bulk operations --

export function bulkMoveTasks(projectId: string, taskIds: string[], status: TaskStatus) {
  return request<{ moved: string[] }>(`/projects/${projectId}/tasks/bulk/move`, {
    method: 'POST',
    body: JSON.stringify({ taskIds, status }),
  });
}

export function bulkUpdatePriority(projectId: string, taskIds: string[], priority: TaskPriority) {
  return request<{ updated: string[] }>(`/projects/${projectId}/tasks/bulk/priority`, {
    method: 'POST',
    body: JSON.stringify({ taskIds, priority }),
  });
}

export function bulkDeleteTasks(projectId: string, taskIds: string[]) {
  return request<{ deleted: string[] }>(`/projects/${projectId}/tasks/bulk/delete`, {
    method: 'POST',
    body: JSON.stringify({ taskIds }),
  });
}

export function deleteTask(projectId: string, taskId: string) {
  return request<void>(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

export function searchTasks(projectId: string, query: string, params?: { topK?: number; minScore?: number }) {
  return request<ListResponse<{ id: number; label: string; score: number }>>(`/projects/${projectId}/tasks/search${qs({ q: query, topK: params?.topK, minScore: params?.minScore })}`).then(unwrapList);
}

export interface TaskRelation {
  fromGraph: string;
  fromId: number;
  toGraph: string;
  toId: number;
  kind: string;
  targetGraph: string;
  targetId: number;
  targetProjectSlug?: string;
  title: string;
  direction: 'out' | 'in';
}

export function listTaskRelations(projectId: string, taskId: string) {
  return request<ListResponse<TaskRelation>>(`/projects/${projectId}/tasks/${taskId}/relations`).then(unwrapList);
}

export function createTaskLink(projectId: string, data: { fromId: number; toId: number; kind: string; targetGraph?: string }) {
  return request<TaskRelation>(`/projects/${projectId}/tasks/links`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteTaskLink(projectId: string, data: { fromId: number; toId: number; kind: string; targetGraph?: string }) {
  return request<void>(`/projects/${projectId}/tasks/links`, {
    method: 'DELETE',
    body: JSON.stringify(data),
  });
}

export function findLinkedTasks(projectId: string, targetGraph: string, targetNodeId: string) {
  return request<ListResponse<Task & { kind: string }>>(`/projects/${projectId}/tasks/linked${qs({ targetGraph, targetNodeId })}`).then(unwrapList);
}

// -- Attachments --

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  addedAt: number;
}

export function listTaskAttachments(projectId: string, taskId: string) {
  return request<ListResponse<AttachmentMeta>>(`/projects/${projectId}/tasks/${taskId}/attachments`).then(unwrapList);
}

export async function uploadTaskAttachment(projectId: string, taskId: string, file: File): Promise<AttachmentMeta> {
  const form = new FormData();
  form.append('file', file);
  return requestUpload<AttachmentMeta>(`/projects/${projectId}/tasks/${taskId}/attachments`, form);
}

export function deleteTaskAttachment(projectId: string, taskId: string, filename: string) {
  return request<void>(`/projects/${projectId}/tasks/${taskId}/attachments/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}

export function taskAttachmentUrl(projectId: string, taskId: string, filename: string): string {
  return `/api/projects/${projectId}/tasks/${taskId}/attachments/${encodeURIComponent(filename)}`;
}
