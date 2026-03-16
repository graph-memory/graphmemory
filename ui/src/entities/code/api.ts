import { request, qs, unwrapList, type ListResponse } from '@/shared/api/client.ts';

export function searchCode(projectId: string, query: string, params?: { topK?: number; minScore?: number }) {
  return request<ListResponse<{ id: string; name: string; kind: string; content: string; score: number }>>(`/projects/${projectId}/code/search${qs({ q: query, topK: params?.topK, minScore: params?.minScore })}`).then(unwrapList);
}
