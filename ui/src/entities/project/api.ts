import { request, unwrapList, type ListResponse } from '@/shared/api/client.ts';

export interface ProjectInfo {
  id: string;
  projectDir: string;
  workspaceId: string | null;
  stats: { docs: number; code: number; knowledge: number; files: number; tasks: number };
}

export interface WorkspaceInfo {
  id: string;
  projects: string[];
}

export interface ProjectDetailedStats {
  docs: { nodes: number; edges: number } | null;
  code: { nodes: number; edges: number } | null;
  knowledge: { nodes: number; edges: number };
  fileIndex: { nodes: number; edges: number };
  tasks: { nodes: number; edges: number };
  skills: { nodes: number; edges: number };
}

export function listProjects(): Promise<ProjectInfo[]> {
  return request<ListResponse<ProjectInfo>>('/projects').then(unwrapList);
}

export function listWorkspaces(): Promise<WorkspaceInfo[]> {
  return request<ListResponse<WorkspaceInfo>>('/workspaces').then(unwrapList);
}

export function getProjectStats(projectId: string) {
  return request<ProjectDetailedStats>(`/projects/${projectId}/stats`);
}
