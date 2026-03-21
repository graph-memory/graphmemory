import { request, unwrapList, type ListResponse } from '@/shared/api/client.ts';

export interface GraphInfo {
  enabled: boolean;
  readonly: boolean;
  access: 'deny' | 'r' | 'rw' | null;
}

export interface ProjectInfo {
  id: string;
  projectDir: string;
  workspaceId: string | null;
  graphs: Record<string, GraphInfo>;
  stats: { docs: number; code: number; knowledge: number; files: number; tasks: number; skills: number };
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

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

export function listTeam(projectId: string): Promise<TeamMember[]> {
  return request<ListResponse<TeamMember>>(`/projects/${projectId}/team`).then(unwrapList);
}

export interface AuthStatus {
  required: boolean;
  authenticated: boolean;
  userId?: string;
  name?: string;
}

export async function checkAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status', { credentials: 'include' });
  return res.json();
}
