import type { TaskStatus, TaskPriority } from './api.ts';

export const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'backlog', label: 'Backlog', color: '#616161' },
  { status: 'todo', label: 'To Do', color: '#1976d2' },
  { status: 'in_progress', label: 'In Progress', color: '#f57c00' },
  { status: 'review', label: 'Review', color: '#7b1fa2' },
  { status: 'done', label: 'Done', color: '#388e3c' },
  { status: 'cancelled', label: 'Cancelled', color: '#d32f2f' },
];

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: '#d32f2f',
  high: '#f57c00',
  medium: '#1976d2',
  low: '#616161',
};

export const STATUS_BADGE_COLOR: Record<TaskStatus, 'neutral' | 'primary' | 'warning' | 'primary' | 'success' | 'error'> = {
  backlog: 'neutral',
  todo: 'primary',
  in_progress: 'warning',
  review: 'primary',
  done: 'success',
  cancelled: 'error',
};

export const PRIORITY_BADGE_COLOR: Record<TaskPriority, 'error' | 'warning' | 'primary' | 'neutral'> = {
  critical: 'error',
  high: 'warning',
  medium: 'primary',
  low: 'neutral',
};

export function statusLabel(status: TaskStatus): string {
  return COLUMNS.find(c => c.status === status)?.label ?? status;
}

export function priorityLabel(priority: TaskPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
