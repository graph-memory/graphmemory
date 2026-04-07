import { request, qs, unwrapList, unwrapPaginated, type ListResponse, type PaginatedResponse } from '@/shared/api/client.ts';

export interface FileInfo {
  id: number;
  filePath: string;
  kind: 'file' | 'directory';
  fileName: string;
  extension: string;
  language: string | null;
  mimeType: string | null;
  size: number;
}

export function listFiles(projectId: string, params?: { directory?: string; extension?: string; language?: string; filter?: string; limit?: number; offset?: number }) {
  return request<PaginatedResponse<FileInfo>>(`/projects/${projectId}/files${qs({
    directory: params?.directory, extension: params?.extension,
    language: params?.language, filter: params?.filter, limit: params?.limit, offset: params?.offset,
  })}`).then(unwrapPaginated);
}

export function searchFiles(projectId: string, query: string, params?: { topK?: number; minScore?: number }) {
  return request<ListResponse<FileInfo & { score: number }>>(`/projects/${projectId}/files/search${qs({ q: query, topK: params?.topK, minScore: params?.minScore })}`).then(unwrapList);
}

export function getFileInfo(projectId: string, path: string) {
  return request<FileInfo>(`/projects/${projectId}/files/info${qs({ path })}`);
}
