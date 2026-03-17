import { DirectedGraph } from 'graphology';
import type { AttachmentMeta } from './attachment-types';

export type TaskCrossGraphType = 'docs' | 'code' | 'files' | 'knowledge' | 'skills';

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface TaskNodeAttributes {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate: number | null;
  estimate: number | null;     // hours
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  version: number;         // incremented on every mutation (starts at 1)
  createdBy?: string;      // author from config at creation time
  updatedBy?: string;      // author from config at last update
  embedding: number[];
  attachments: AttachmentMeta[];
  proxyFor?: { graph: TaskCrossGraphType; nodeId: string; projectId?: string };
}

export interface TaskEdgeAttributes {
  kind: string;  // TaskEdgeKind for task↔task, free-form for cross-graph
}

export type TaskGraph = DirectedGraph<TaskNodeAttributes, TaskEdgeAttributes>;

export function createTaskGraph(): TaskGraph {
  return new DirectedGraph<TaskNodeAttributes, TaskEdgeAttributes>({
    multi: false,
    allowSelfLoops: false,
  });
}
