import { request, qs } from '@/shared/api/client.ts';

export type GraphScope = 'all' | 'docs' | 'code' | 'knowledge' | 'tasks' | 'skills' | 'files';

export interface GraphNode {
  id: string;
  graph: string;
  title?: string;
  name?: string;
  kind?: string;
  path?: string;
  status?: string;
  priority?: string;
  level?: number;
  type?: string;
  [k: string]: unknown;
}

export interface GraphEdge {
  source: string;
  target: string;
  graph: string;
  kind?: string;
  [k: string]: unknown;
}

export interface GraphExport {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function exportGraph(projectId: string, scope: GraphScope = 'all') {
  return request<GraphExport>(`/projects/${projectId}/graph${qs({ scope })}`);
}
