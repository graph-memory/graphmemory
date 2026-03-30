import type { Task, TaskStatus, TaskPriority } from './api.ts';
import type { TeamMember } from '@/entities/project/api.ts';
import type { Epic } from '@/entities/epic/api.ts';
import { COLUMNS, PRIORITY_COLORS, priorityLabel } from './config.ts';
import { updateTask } from './api.ts';

export type GroupByField = 'status' | 'priority' | 'assignee' | 'tag' | 'epic' | 'none';

export interface GroupDefinition {
  key: string;
  label: string;
  color: string;
  sortOrder: number;
}

export interface GroupContext {
  team: TeamMember[];
  epics: Epic[];
  taskEpicMap: Map<string, Epic[]>;
}

export interface GroupConfig {
  field: GroupByField;
  getKeys: (task: Task, context: GroupContext) => string[];
  buildGroups: (tasks: Task[], context: GroupContext) => GroupDefinition[];
  nullGroupLabel: string;
  nullGroupColor: string;
  dndEnabled: boolean;
  applyGroupChange?: (projectId: string, taskId: string, groupKey: string) => Promise<void>;
}

const PRIORITY_OPTIONS: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

export const GROUP_CONFIGS: Record<GroupByField, GroupConfig> = {
  status: {
    field: 'status',
    getKeys: (task) => [task.status],
    buildGroups: () =>
      COLUMNS.map((c, i) => ({
        key: c.status,
        label: c.label,
        color: c.color,
        sortOrder: i,
      })),
    nullGroupLabel: 'No status',
    nullGroupColor: '#616161',
    dndEnabled: true,
    applyGroupChange: async (projectId, taskId, groupKey) => {
      await updateTask(projectId, taskId, { status: groupKey as TaskStatus });
    },
  },

  priority: {
    field: 'priority',
    getKeys: (task) => [task.priority],
    buildGroups: () =>
      PRIORITY_OPTIONS.map((p, i) => ({
        key: p,
        label: priorityLabel(p),
        color: PRIORITY_COLORS[p],
        sortOrder: i,
      })),
    nullGroupLabel: 'No priority',
    nullGroupColor: '#616161',
    dndEnabled: true,
    applyGroupChange: async (projectId, taskId, groupKey) => {
      await updateTask(projectId, taskId, { priority: groupKey as TaskPriority });
    },
  },

  assignee: {
    field: 'assignee',
    getKeys: (task) => [task.assignee ?? '__none__'],
    buildGroups: (tasks, context) => {
      const seen = new Set<string>();
      const groups: GroupDefinition[] = [];
      // Add team members that have tasks assigned
      for (const t of tasks) {
        if (t.assignee && !seen.has(t.assignee)) {
          seen.add(t.assignee);
          const member = context.team.find(m => m.id === t.assignee);
          groups.push({
            key: t.assignee,
            label: member?.name ?? t.assignee,
            color: '#1976d2',
            sortOrder: groups.length,
          });
        }
      }
      return groups.sort((a, b) => a.label.localeCompare(b.label));
    },
    nullGroupLabel: 'Unassigned',
    nullGroupColor: '#616161',
    dndEnabled: true,
    applyGroupChange: async (projectId, taskId, groupKey) => {
      await updateTask(projectId, taskId, { assignee: groupKey === '__none__' ? null : groupKey });
    },
  },

  tag: {
    field: 'tag',
    getKeys: (task) => (task.tags && task.tags.length > 0 ? task.tags : []),
    buildGroups: (tasks) => {
      const tagSet = new Set<string>();
      for (const t of tasks) {
        if (t.tags) for (const tag of t.tags) tagSet.add(tag);
      }
      return [...tagSet].sort().map((tag, i) => ({
        key: tag,
        label: `#${tag}`,
        color: '#7b1fa2',
        sortOrder: i,
      }));
    },
    nullGroupLabel: 'No tags',
    nullGroupColor: '#616161',
    dndEnabled: false,
  },

  epic: {
    field: 'epic',
    getKeys: (_task, context) => {
      const epics = context.taskEpicMap.get(_task.id);
      return epics && epics.length > 0 ? epics.map(e => e.id) : [];
    },
    buildGroups: (_tasks, context) => {
      const epicIds = new Set<string>();
      for (const [, epics] of context.taskEpicMap) {
        for (const e of epics) epicIds.add(e.id);
      }
      return context.epics
        .filter(e => epicIds.has(e.id))
        .map((e, i) => ({
          key: e.id,
          label: e.title,
          color: e.status === 'open' ? '#1976d2' : e.status === 'in_progress' ? '#f57c00' : e.status === 'done' ? '#388e3c' : '#d32f2f',
          sortOrder: i,
        }));
    },
    nullGroupLabel: 'No epic',
    nullGroupColor: '#616161',
    dndEnabled: false,
  },

  none: {
    field: 'none',
    getKeys: () => ['__all__'],
    buildGroups: () => [{ key: '__all__', label: '', color: '', sortOrder: 0 }],
    nullGroupLabel: '',
    nullGroupColor: '',
    dndEnabled: false,
  },
};

export const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'tag', label: 'Tag' },
  { value: 'epic', label: 'Epic' },
  { value: 'none', label: 'None' },
];
