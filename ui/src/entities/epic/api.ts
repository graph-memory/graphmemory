import { request, qs, unwrapList, unwrapPaginated, type ListResponse, type PaginatedResponse } from '@/shared/api/client.ts';
import type { Task } from '@/entities/task/api.ts';

export type EpicStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export type EpicPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Epic {
  id: string;
  title: string;
  description: string;
  status: EpicStatus;
  priority: EpicPriority;
  tags: string[];
  order: number;
  createdAt: number;
  updatedAt: number;
  version: number;
  progress: { done: number; total: number };
}

export function listEpics(projectId: string, params?: { status?: EpicStatus; priority?: EpicPriority; tag?: string; limit?: number; offset?: number }) {
  return request<PaginatedResponse<Epic>>(`/projects/${projectId}/epics${qs({ status: params?.status, priority: params?.priority, tag: params?.tag, limit: params?.limit, offset: params?.offset })}`).then(unwrapPaginated);
}

export function getEpic(projectId: string, epicId: string) {
  return request<Epic>(`/projects/${projectId}/epics/${epicId}`);
}

export function createEpic(projectId: string, data: { title: string; description?: string; status?: EpicStatus; priority?: EpicPriority; tags?: string[] }) {
  return request<Epic>(`/projects/${projectId}/epics`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateEpic(projectId: string, epicId: string, data: Partial<Pick<Epic, 'title' | 'description' | 'status' | 'priority' | 'tags'>>) {
  return request<Epic>(`/projects/${projectId}/epics/${epicId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteEpic(projectId: string, epicId: string) {
  return request<void>(`/projects/${projectId}/epics/${epicId}`, {
    method: 'DELETE',
  });
}

export function searchEpics(projectId: string, query: string, params?: { topK?: number; minScore?: number }) {
  return request<ListResponse<Epic & { score: number }>>(`/projects/${projectId}/epics/search${qs({ q: query, topK: params?.topK, minScore: params?.minScore })}`).then(unwrapList);
}

export function linkTaskToEpic(projectId: string, epicId: string, taskId: string) {
  return request<void>(`/projects/${projectId}/epics/${epicId}/link`, {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });
}

export function unlinkTaskFromEpic(projectId: string, epicId: string, taskId: string) {
  return request<void>(`/projects/${projectId}/epics/${epicId}/link`, {
    method: 'DELETE',
    body: JSON.stringify({ taskId }),
  });
}

export function listEpicTasks(projectId: string, epicId: string) {
  return request<ListResponse<Task>>(`/projects/${projectId}/epics/${epicId}/tasks`).then(unwrapList);
}
