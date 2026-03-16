import { request, qs, unwrapList, type ListResponse } from '@/shared/api/client.ts';

export interface DocTopic {
  fileId: string;
  title: string;
  chunks: number;
}

export interface DocChunk {
  id: string;
  title: string;
  content: string;
  level: number;
  fileId: string;
  language?: string;
  symbols?: string[];
}

export interface DocNode {
  id: string;
  title: string;
  content: string;
  level: number;
  fileId: string;
  language?: string;
  symbols?: string[];
  [key: string]: unknown;
}

export function listTopics(projectId: string, params?: { filter?: string; limit?: number }) {
  return request<ListResponse<DocTopic>>(`/projects/${projectId}/docs/topics${qs({ filter: params?.filter, limit: params?.limit })}`).then(unwrapList);
}

export function getToc(projectId: string, fileId: string) {
  return request<ListResponse<DocChunk>>(`/projects/${projectId}/docs/toc/${fileId}`).then(unwrapList);
}

export function getDocNode(projectId: string, nodeId: string) {
  return request<DocNode>(`/projects/${projectId}/docs/nodes/${nodeId}`);
}

export function searchDocs(projectId: string, query: string, params?: { topK?: number; minScore?: number }) {
  return request<ListResponse<DocNode & { score: number }>>(`/projects/${projectId}/docs/search${qs({ q: query, topK: params?.topK, minScore: params?.minScore })}`).then(unwrapList);
}
