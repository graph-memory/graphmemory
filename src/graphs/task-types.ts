import { DirectedGraph } from 'graphology';
import type { AttachmentMeta } from './attachment-types';

export type TaskCrossGraphType = 'docs' | 'code' | 'files' | 'knowledge' | 'skills';

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskNodeType = 'task' | 'epic';
export type EpicStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

// ---------------------------------------------------------------------------
// Status metadata — declarative flags instead of hardcoded checks
// ---------------------------------------------------------------------------

export interface StatusMeta {
  /** Task/epic in this status counts as finished (done, cancelled) */
  isTerminal: boolean;
  /** Task/epic in this status counts as started (in_progress, review, done, cancelled) */
  isStarted: boolean;
}

export const TASK_STATUS_META: Record<TaskStatus, StatusMeta> = {
  backlog:     { isTerminal: false, isStarted: false },
  todo:        { isTerminal: false, isStarted: false },
  in_progress: { isTerminal: false, isStarted: true },
  review:      { isTerminal: false, isStarted: true },
  done:        { isTerminal: true,  isStarted: true },
  cancelled:   { isTerminal: true,  isStarted: true },
};

export const EPIC_STATUS_META: Record<EpicStatus, StatusMeta> = {
  open:        { isTerminal: false, isStarted: false },
  in_progress: { isTerminal: false, isStarted: true },
  done:        { isTerminal: true,  isStarted: true },
  cancelled:   { isTerminal: true,  isStarted: true },
};

export function isTerminal(status: TaskStatus | EpicStatus): boolean {
  return (TASK_STATUS_META[status as TaskStatus] ?? EPIC_STATUS_META[status as EpicStatus]).isTerminal;
}

export function isStarted(status: TaskStatus | EpicStatus): boolean {
  return (TASK_STATUS_META[status as TaskStatus] ?? EPIC_STATUS_META[status as EpicStatus]).isStarted;
}

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
  order: number;            // position within status group (gap-based integer, multiples of 1000)
  assignee: string | null;  // team member ID
  nodeType?: TaskNodeType;  // 'task' (default/undefined) or 'epic'
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
