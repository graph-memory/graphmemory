import { request, qs, unwrapList, unwrapPaginated, type ListResponse, type PaginatedResponse } from '@/shared/api/client.ts';

export interface CodeFile {
  fileId: string;
  symbolCount: number;
}

export interface CodeSymbol {
  id: string;
  name: string;
  kind: string;
  fileId: string;
  signature: string;
  docComment: string;
  body: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  crossLinks?: Array<{ graph: string; nodeId: string; edgeKind: string }>;
  [key: string]: unknown;
}

export interface CodeSearchResult {
  id: string;
  name: string;
  kind: string;
  content: string;
  score: number;
}

export function listCodeFiles(projectId: string, params?: { filter?: string; limit?: number; offset?: number }) {
  return request<PaginatedResponse<CodeFile>>(`/projects/${projectId}/code/files${qs({ filter: params?.filter, limit: params?.limit, offset: params?.offset })}`).then(unwrapPaginated);
}

export function getFileSymbols(projectId: string, fileId: string) {
  return request<ListResponse<CodeSymbol>>(`/projects/${projectId}/code/files/${fileId}/symbols`).then(unwrapList);
}

export function getSymbol(projectId: string, symbolId: string) {
  return request<CodeSymbol>(`/projects/${projectId}/code/symbols/${symbolId}`);
}

export interface CodeEdge {
  source: string;
  target: string;
  kind: string;
}

export function getSymbolEdges(projectId: string, symbolId: string) {
  return request<ListResponse<CodeEdge>>(`/projects/${projectId}/code/symbols/${symbolId}/edges`).then(unwrapList);
}

export function searchCode(projectId: string, query: string, params?: { topK?: number; minScore?: number }) {
  return request<ListResponse<{ id: number; label: string; score: number }>>(`/projects/${projectId}/code/search${qs({ q: query, topK: params?.topK, minScore: params?.minScore })}`).then(unwrapList);
}
