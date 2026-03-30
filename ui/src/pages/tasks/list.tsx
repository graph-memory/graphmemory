import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Chip, Alert, CircularProgress,
  useTheme, alpha, IconButton, Checkbox, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, Select, MenuItem, TextField, InputAdornment,
  FormControl,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ViewListIcon from '@mui/icons-material/ViewList';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ScheduleIcon from '@mui/icons-material/Schedule';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, StatusBadge, ConfirmDialog, PaginationBar, FilterBar, FilterControl } from '@/shared/ui/index.ts';
import type { SortDir } from '@/shared/lib/useTableSort.ts';
import { useFilters } from '@/shared/lib/useFilters.ts';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  listTasks, updateTask, reorderTask, bulkMoveTasks, bulkUpdatePriority, bulkDeleteTasks,
  COLUMNS, PRIORITY_COLORS, PRIORITY_BADGE_COLOR, priorityLabel, statusLabel,
  GROUP_CONFIGS, GROUP_BY_OPTIONS,
  type Task, type TaskStatus, type TaskPriority, type GroupByField, type GroupContext,
} from '@/entities/task/index.ts';
import { listTeam, type TeamMember } from '@/entities/project/api.ts';
import { listEpics, listEpicTasks, type Epic } from '@/entities/epic/index.ts';
import FlagIcon from '@mui/icons-material/Flag';
import { useColumnVisibility } from './useColumnVisibility.ts';
import { useGroupedTasks } from './useGroupedTasks.ts';
import { QuickCreateDialog } from '@/features/task-crud/QuickCreateDialog.tsx';

const STATUS_OPTIONS = COLUMNS.map(c => c.status);
const PRIORITY_OPTIONS: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
const STATUS_COLOR: Record<TaskStatus, string> = Object.fromEntries(COLUMNS.map(c => [c.status, c.color])) as Record<TaskStatus, string>;

function badgeSelectSx(c: string) {
  return {
    bgcolor: alpha(c, 0.12),
    color: c,
    fontWeight: 600,
    fontSize: '0.75rem',
    borderRadius: '999px',
    border: `1px solid ${alpha(c, 0.3)}`,
    height: 26,
    minWidth: 70,
    '& .MuiSelect-select': { py: '2px', px: 1.2, display: 'flex', alignItems: 'center' },
    '& .MuiSelect-icon': { fontSize: '1rem', color: c, right: 4 },
    '&:before, &:after': { display: 'none' },
  };
}

type SortField = 'title' | 'priority' | 'assignee' | 'dueDate' | 'estimate' | 'order';

const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };


function computeOrderAt(items: Task[], index: number): number {
  if (items.length === 0) return 0;
  if (index <= 0) return (items[0]?.order ?? 0) - 1000;
  if (index >= items.length) return (items[items.length - 1]?.order ?? 0) + 1000;
  const before = items[index - 1]?.order ?? 0;
  const after = items[index]?.order ?? before + 2000;
  return Math.floor((before + after) / 2);
}

// ---------------------------------------------------------------------------
// Droppable group header
// ---------------------------------------------------------------------------

function DroppableGroupHeader({
  groupKey, label, color, count, isCollapsed, canWrite, groupSelected, groupTotal,
  onToggleCollapse, onToggleSelectGroup, dndEnabled,
}: {
  groupKey: string; label: string; color: string; count: number;
  isCollapsed: boolean; canWrite: boolean; groupSelected: number; groupTotal: number;
  onToggleCollapse: () => void; onToggleSelectGroup: () => void; dndEnabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${groupKey}`, disabled: !dndEnabled });
  return (
    <TableRow
      ref={setNodeRef}
      sx={{
        bgcolor: isOver ? alpha(color, 0.18) : alpha(color, 0.1),
        cursor: 'pointer',
        '&:hover': { bgcolor: alpha(color, 0.14) },
        borderLeft: `3px solid ${color}`,
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
      onClick={onToggleCollapse}
    >
      {canWrite && (
        <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
          <Checkbox
            size="small"
            checked={groupSelected === groupTotal && groupTotal > 0}
            indeterminate={groupSelected > 0 && groupSelected < groupTotal}
            onChange={onToggleSelectGroup}
          />
        </TableCell>
      )}
      <TableCell colSpan={5}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isCollapsed ? <ExpandMore fontSize="small" /> : <ExpandLess fontSize="small" />}
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
          <Typography variant="subtitle2" fontWeight={700}>{label}</Typography>
          <Box sx={{
            bgcolor: alpha(color, 0.2), color, borderRadius: '10px',
            px: 0.8, py: 0.1, fontSize: '0.7rem', fontWeight: 700,
            lineHeight: 1.4, minWidth: 20, textAlign: 'center',
          }}>{count}</Box>
        </Box>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Tail drop zone — invisible row after last task in group for "drop to end"
// ---------------------------------------------------------------------------

function TailDropZone({ groupKey, color, dndEnabled }: { groupKey: string; color: string; dndEnabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tail-${groupKey}`, disabled: !dndEnabled });
  return (
    <TableRow ref={setNodeRef}>
      <TableCell
        colSpan={99}
        sx={{
          p: 0, height: isOver ? 4 : 2, border: 'none',
          bgcolor: isOver ? color : 'transparent',
          transition: 'height 0.1s, background-color 0.1s',
        }}
      />
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Draggable + droppable task row
// ---------------------------------------------------------------------------

function DraggableTaskRow({
  task, team, canWrite, selected, onToggleSelect, onNavigate, palette,
  onInlineStatus, onInlinePriority, isBeingDragged, groupColor, taskEpics, onTagClick, activeTag, onAssigneeClick, onEpicClick,
}: {
  task: Task; team: TeamMember[]; canWrite: boolean; selected: boolean;
  onToggleSelect: () => void; onNavigate: () => void; palette: any;
  onInlineStatus: (status: TaskStatus) => void; onInlinePriority: (priority: TaskPriority) => void;
  isBeingDragged: boolean; groupColor: string; taskEpics?: Epic[]; onTagClick: (tag: string) => void; activeTag?: string; onAssigneeClick: (id: string) => void; onEpicClick: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: task.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: task.id });

  // Merge drag + drop refs onto the same <tr>
  const mergedRef = useCallback((node: HTMLTableRowElement | null) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  return (
    <TableRow
      ref={mergedRef}
      hover
      sx={{
        cursor: canWrite ? 'grab' : 'pointer',
        opacity: isBeingDragged ? 0.35 : 1,
        borderTop: isOver ? `2px solid ${palette.primary.main}` : undefined,
        borderLeft: `3px solid ${alpha(groupColor, 0.5)}`,
        bgcolor: alpha(groupColor, 0.03),
        transition: 'opacity 0.15s',
        touchAction: 'none',
      }}
      onClick={onNavigate}
      {...(canWrite ? { ...attributes, ...listeners } : {})}
    >
      {canWrite && (
        <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
          <Checkbox size="small" checked={selected} onChange={onToggleSelect} />
        </TableCell>
      )}
      <TableCell sx={{ pl: 4 }}>
        <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 400 }}>
          {task.title}
        </Typography>
        {(taskEpics?.length || task.tags?.length) ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
            {taskEpics?.map(e => (
              <Chip
                key={e.id}
                icon={<FlagIcon sx={{ fontSize: '14px !important' }} />}
                label={e.title}
                size="small"
                onClick={(ev: React.MouseEvent) => { ev.stopPropagation(); onEpicClick(e.id); }}
                sx={{ height: 20, cursor: 'pointer', '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' }, '& .MuiChip-icon': { ml: 0.5, color: e.status === 'open' ? '#1976d2' : '#f57c00' } }}
              />
            ))}
            {task.tags?.map(t => (
              <Typography
                key={t}
                variant="caption"
                component="span"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onTagClick(t); }}
                sx={{ color: palette.primary.main, cursor: 'pointer', fontWeight: t === activeTag ? 700 : 400, '&:hover': { textDecoration: 'underline' } }}
              >
                #{t}
              </Typography>
            ))}
          </Box>
        ) : null}
      </TableCell>
      <TableCell onClick={e => e.stopPropagation()}>
        {canWrite ? (
          <Select
            size="small"
            name={`status-${task.id}`}
            value={task.status}
            onChange={e => onInlineStatus(e.target.value as TaskStatus)}
            variant="standard"
            disableUnderline
            sx={badgeSelectSx(STATUS_COLOR[task.status])}
          >
            {STATUS_OPTIONS.map(s => {
              const c = STATUS_COLOR[s];
              return (
                <MenuItem key={s} value={s}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c }} />
                    {statusLabel(s)}
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        ) : (
          <StatusBadge label={statusLabel(task.status)} color={
            ({ backlog: 'neutral', todo: 'primary', in_progress: 'warning', review: 'primary', done: 'success', cancelled: 'error' } as const)[task.status]
          } size="small" />
        )}
      </TableCell>
      <TableCell onClick={e => e.stopPropagation()}>
        {canWrite ? (
          <Select
            size="small"
            name={`priority-${task.id}`}
            value={task.priority}
            onChange={e => onInlinePriority(e.target.value as TaskPriority)}
            variant="standard"
            disableUnderline
            sx={badgeSelectSx(PRIORITY_COLORS[task.priority])}
          >
            {PRIORITY_OPTIONS.map(p => {
              const c = PRIORITY_COLORS[p];
              return (
                <MenuItem key={p} value={p}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c }} />
                    {priorityLabel(p)}
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        ) : (
          <StatusBadge label={priorityLabel(task.priority)} color={PRIORITY_BADGE_COLOR[task.priority]} size="small" />
        )}
      </TableCell>
      <TableCell>
        {task.assignee && (
          <Typography
            variant="body2"
            component="span"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onAssigneeClick(task.assignee!); }}
            sx={{ color: palette.custom.textMuted, cursor: 'pointer', '&:hover': { textDecoration: 'underline', color: palette.text.primary } }}
          >
            @{team.find(m => m.id === task.assignee)?.name ?? task.assignee}
          </Typography>
        )}
      </TableCell>
      <TableCell>
        {task.estimate != null && (
          <Chip
            icon={<ScheduleIcon sx={{ fontSize: '14px !important' }} />}
            label={`${task.estimate}h`}
            size="small"
            variant="outlined"
            sx={{ height: 22, '& .MuiChip-label': { px: 0.5, fontSize: '0.75rem' }, '& .MuiChip-icon': { ml: 0.5 } }}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type TaskFilterKey = 'q' | 'priority' | 'tag' | 'assignee' | 'epic' | 'groupBy' | 'sort' | 'dir';

const TASK_FILTER_DEFS = [
  { key: 'q', defaultValue: '' },
  { key: 'priority', defaultValue: '' },
  { key: 'tag', defaultValue: '' },
  { key: 'assignee', defaultValue: '' },
  { key: 'epic', defaultValue: '' },
  { key: 'sort', defaultValue: 'order' },
  { key: 'dir', defaultValue: 'asc' },
  { key: 'groupBy', defaultValue: 'status' },
];

export default function TaskListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const canWrite = useCanWrite('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);

  const { visible: visibleStatuses, toggle: toggleStatusVisibility } = useColumnVisibility();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { filters, setFilter, setFilters, clearAll } = useFilters<TaskFilterKey>(TASK_FILTER_DEFS);

  const [epics, setEpics] = useState<Epic[]>([]);
  const [epicTaskIds, setEpicTaskIds] = useState<Set<string> | null>(null);
  const [taskEpicMap, setTaskEpicMap] = useState<Map<string, Epic[]>>(new Map());

  const sortField = (filters.sort || null) as SortField | null;
  const sortDir = (filters.dir || null) as SortDir | null;
  const handleSort = useCallback((field: SortField) => {
    if (sortField !== field) { setFilters({ sort: field, dir: 'asc' }); return; }
    if (sortDir === 'asc') { setFilters({ sort: field, dir: 'desc' }); return; }
    setFilters({ sort: '', dir: '' });
  }, [sortField, sortDir, setFilters]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overGroupKey, setOverGroupKey] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const { items } = await listTasks(projectId, { limit: 500 });
      setTasks(items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!projectId) return;
    listTeam(projectId).then(setTeam).catch(() => {});
    listEpics(projectId).then(async ({ items: list }) => {
      setEpics(list);
      const map = new Map<string, Epic[]>();
      await Promise.all(list.map(async (epic) => {
        const tasks = await listEpicTasks(projectId, epic.id).catch(() => []);
        for (const t of tasks) {
          const arr = map.get(t.id) ?? [];
          arr.push(epic);
          map.set(t.id, arr);
        }
      }));
      setTaskEpicMap(map);
    }).catch(() => {});
  }, [projectId]);
  useEffect(() => {
    if (!projectId || !filters.epic) { setEpicTaskIds(null); return; }
    listEpicTasks(projectId, filters.epic).then(tasks => setEpicTaskIds(new Set(tasks.map(t => t.id)))).catch(() => setEpicTaskIds(null));
  }, [projectId, filters.epic]);
  useWebSocket(projectId ?? null, useCallback((event) => { if (event.type.startsWith('task:')) refresh(); }, [refresh]));

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) t.tags?.forEach(tag => set.add(tag));
    return [...set].sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
    }
    if (filters.priority) filtered = filtered.filter(t => t.priority === filters.priority);
    if (filters.tag) filtered = filtered.filter(t => t.tags?.includes(filters.tag));
    if (filters.assignee) filtered = filtered.filter(t => t.assignee === filters.assignee);
    if (epicTaskIds) filtered = filtered.filter(t => epicTaskIds.has(t.id));
    return filtered;
  }, [tasks, filters.q, filters.priority, filters.tag, filters.assignee, epicTaskIds]);

  const compareTasks = useCallback((a: Task, b: Task): number => {
    if (!sortField || !sortDir) return 0; // no sort — preserve default order
    let cmp = 0;
    switch (sortField) {
      case 'title': cmp = a.title.localeCompare(b.title); break;
      case 'priority': cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]; break;
      case 'assignee': cmp = (a.assignee ?? '').localeCompare(b.assignee ?? ''); break;
      case 'dueDate': cmp = (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity); break;
      case 'estimate': cmp = (a.estimate ?? Infinity) - (b.estimate ?? Infinity); break;
      case 'order': cmp = a.order - b.order; break;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  }, [sortField, sortDir]);

  const groupBy = (filters.groupBy || 'status') as GroupByField;
  const groupContext = useMemo<GroupContext>(() => ({ team, epics, taskEpicMap }), [team, epics, taskEpicMap]);
  const { groups, tasksByGroup } = useGroupedTasks(filteredTasks, groupBy, groupContext, compareTasks);
  const currentGroupConfig = GROUP_CONFIGS[groupBy];

  const handleSortClick = (field: SortField) => {
    handleSort(field);
  };

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    const allIds = filteredTasks.map(t => t.id);
    setSelected(selected.size === allIds.length ? new Set() : new Set(allIds));
  };
  const toggleSelectGroup = (groupKey: string) => {
    const groupIds = (tasksByGroup.get(groupKey) ?? []).map(t => t.id);
    const allSelected = groupIds.every(id => selected.has(id));
    setSelected(prev => { const next = new Set(prev); for (const id of groupIds) { if (allSelected) next.delete(id); else next.add(id); } return next; });
  };

  const handleInlineStatus = async (task: Task, status: TaskStatus) => {
    if (!projectId || status === task.status) return;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t));
    try { await updateTask(projectId, task.id, { status }); } catch { refresh(); }
  };
  const handleInlinePriority = async (task: Task, priority: TaskPriority) => {
    if (!projectId || priority === task.priority) return;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, priority } : t));
    try { await updateTask(projectId, task.id, { priority }); } catch { refresh(); }
  };

  const handleBulkMove = async (status: TaskStatus) => {
    if (!projectId || selected.size === 0) return;
    try { await bulkMoveTasks(projectId, [...selected], status); setSelected(new Set()); refresh(); } catch { refresh(); }
  };
  const handleBulkPriority = async (priority: TaskPriority) => {
    if (!projectId || selected.size === 0) return;
    try { await bulkUpdatePriority(projectId, [...selected], priority); setSelected(new Set()); refresh(); } catch { refresh(); }
  };
  const handleBulkDelete = async () => {
    if (!projectId || !deleteTarget) return;
    setDeleting(true);
    try { await bulkDeleteTasks(projectId, deleteTarget.ids); setSelected(new Set()); refresh(); }
    catch { refresh(); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  // --- DnD handlers ---
  const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) { setOverGroupKey(null); return; }
    const overId = over.id as string;
    if (overId.startsWith('group-')) { setOverGroupKey(overId.replace('group-', '')); return; }
    if (overId.startsWith('tail-')) { setOverGroupKey(overId.replace('tail-', '')); return; }
    // Find which group this task belongs to
    for (const [key, list] of tasksByGroup) {
      if (list.some(t => t.id === overId)) { setOverGroupKey(key); return; }
    }
    setOverGroupKey(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverGroupKey(null);
    if (!over || !projectId || !canWrite || !currentGroupConfig.dndEnabled) return;

    const activeTask = tasks.find(t => t.id === active.id);
    if (!activeTask) return;

    const overId = over.id as string;

    // Determine target group key
    const isGroupDrop = overId.startsWith('group-');
    const isTailDrop = overId.startsWith('tail-');
    let targetGroupKey: string | null = null;
    if (isGroupDrop) {
      targetGroupKey = overId.replace('group-', '');
    } else if (isTailDrop) {
      targetGroupKey = overId.replace('tail-', '');
    } else {
      // Find group key from the task being dropped on
      for (const [key, list] of tasksByGroup) {
        if (list.some(t => t.id === overId)) { targetGroupKey = key; break; }
      }
    }

    if (!targetGroupKey) return;

    // For status grouping, use reorder (preserves order semantics)
    if (groupBy === 'status') {
      const targetStatus = targetGroupKey as TaskStatus;
      const columnTasks = tasks
        .filter(t => t.status === targetStatus && t.id !== activeTask.id)
        .sort((a, b) => a.order - b.order);

      let newOrder: number;
      if (isGroupDrop || isTailDrop) {
        newOrder = columnTasks.length > 0 ? columnTasks[columnTasks.length - 1].order + 1000 : 0;
      } else {
        const overIdx = columnTasks.findIndex(t => t.id === overId);
        newOrder = computeOrderAt(columnTasks, overIdx >= 0 ? overIdx : columnTasks.length);
      }

      setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, status: targetStatus, order: newOrder } : t));
      try {
        await reorderTask(projectId, activeTask.id, newOrder, targetStatus !== activeTask.status ? targetStatus : undefined);
      } catch { refresh(); }
    } else if (currentGroupConfig.applyGroupChange) {
      // For other groupings with DnD, just change the field
      try {
        await currentGroupConfig.applyGroupChange(projectId, activeTask.id, targetGroupKey);
        refresh();
      } catch { refresh(); }
    }
  };

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const goToTask = (taskId: string) => navigate(`/${projectId}/tasks/${taskId}`);

  // Build active filters for chips
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; color?: string; onClear: () => void }> = [];
    if (filters.priority) {
      chips.push({ key: 'priority', label: priorityLabel(filters.priority as TaskPriority), color: PRIORITY_COLORS[filters.priority as TaskPriority], onClear: () => setFilter('priority', '') });
    }
    if (filters.tag) {
      chips.push({ key: 'tag', label: `#${filters.tag}`, onClear: () => setFilter('tag', '') });
    }
    if (filters.assignee) {
      const m = team.find(t => t.id === filters.assignee);
      chips.push({ key: 'assignee', label: `@${m?.name || filters.assignee}`, onClear: () => setFilter('assignee', '') });
    }
    if (filters.epic) {
      const ep = epics.find(e => e.id === filters.epic);
      chips.push({ key: 'epic', label: ep?.title || filters.epic, onClear: () => setFilter('epic', '') });
    }
    return chips;
  }, [filters, team, epics, setFilter]);

  const totalFiltered = filteredTasks.length;
  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  const handleClearAll = () => { clearAll(); };

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[{ label: 'Tasks' }, { label: 'List' }]}
        actions={
          <>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select
                name="group-by"
                value={groupBy}
                onChange={e => setFilter('groupBy', e.target.value)}
                variant="outlined"
                sx={{ fontSize: '0.8rem', height: 32, '& .MuiSelect-select': { py: '4px' } }}
                renderValue={v => `Group: ${GROUP_BY_OPTIONS.find(o => o.value === v)?.label ?? v}`}
              >
                {GROUP_BY_OPTIONS.map(o => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {groupBy === 'status' && (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {COLUMNS.map(({ status, label, color }) => {
                  const isOn = visibleStatuses.has(status);
                  return (
                    <Chip
                      key={status}
                      label={label}
                      size="small"
                      onClick={() => toggleStatusVisibility(status)}
                      disabled={isOn && visibleStatuses.size === 1}
                      sx={{
                        height: 26, fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer',
                        bgcolor: isOn ? alpha(color, 0.22) : 'transparent',
                        color: isOn ? color : palette.custom.textMuted,
                        border: isOn ? `1.5px solid ${alpha(color, 0.6)}` : '1.5px solid transparent',
                        textDecoration: isOn ? 'none' : 'line-through',
                        opacity: isOn ? 1 : 0.45,
                        '&:hover': { bgcolor: alpha(color, 0.1), opacity: 1 },
                        '& .MuiChip-label': { px: 1 },
                      }}
                    />
                  );
                })}
              </Box>
            )}
            {canWrite && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setQuickCreateOpen(true)}>New Task</Button>
            )}
          </>
        }
      />

      {/* Filter bar */}
      <FilterBar activeFilters={activeFilterChips} onClearAll={handleClearAll}>
        <TextField
          size="small" placeholder="Search tasks..." value={filters.q}
          onChange={e => setFilter('q', e.target.value)}
          slotProps={{ input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: palette.custom.textMuted }} /></InputAdornment>,
            endAdornment: filters.q ? <InputAdornment position="end"><IconButton size="small" onClick={() => setFilter('q', '')}><CloseIcon fontSize="small" /></IconButton></InputAdornment> : undefined,
          }}}
          sx={{ minWidth: 200, flex: 1, maxWidth: 350 }}
        />
        <FilterControl
          name="filter-priority"
          value={filters.priority}
          onChange={v => setFilter('priority', v)}
          placeholder="Priority"
          allLabel="All priorities"
          options={PRIORITY_OPTIONS.map(p => ({ value: p, label: priorityLabel(p), color: PRIORITY_COLORS[p] }))}
        />
        <FilterControl
          name="filter-tag"
          value={filters.tag}
          onChange={v => setFilter('tag', v)}
          placeholder="Tag"
          allLabel="All tags"
          options={allTags.map(tag => ({ value: tag, label: tag }))}
          visible={allTags.length > 0}
        />
        <FilterControl
          name="filter-assignee"
          value={filters.assignee}
          onChange={v => setFilter('assignee', v)}
          placeholder="Assignee"
          allLabel="All"
          options={team.map(m => ({ value: m.id, label: m.name || m.id }))}
          visible={team.length > 0}
        />
        <FilterControl
          name="filter-epic"
          value={filters.epic}
          onChange={v => setFilter('epic', v)}
          placeholder="Epic"
          allLabel="All epics"
          options={epics.map(e => ({
            value: e.id,
            label: e.title,
            icon: <FlagIcon sx={{ fontSize: 14, color: e.status === 'open' ? '#1976d2' : e.status === 'in_progress' ? '#f57c00' : e.status === 'done' ? '#388e3c' : '#d32f2f' }} />,
          }))}
          visible={epics.length > 0}
        />
      </FilterBar>

      {/* Bulk actions bar */}
      {selected.size > 0 && canWrite && (
        <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, mb: 2, bgcolor: alpha(palette.primary.main, 0.06), borderColor: palette.primary.main }}>
          <Typography variant="body2" fontWeight={600}>{selected.size} selected</Typography>
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select name="bulk-move" value="" displayEmpty renderValue={() => 'Move to...'} onChange={e => handleBulkMove(e.target.value as TaskStatus)} sx={{ fontSize: '0.85rem' }}>
              {STATUS_OPTIONS.map(s => (
                <MenuItem key={s} value={s}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: STATUS_COLOR[s] }} />
                    {statusLabel(s)}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select name="bulk-priority" value="" displayEmpty renderValue={() => 'Priority...'} onChange={e => handleBulkPriority(e.target.value as TaskPriority)} sx={{ fontSize: '0.85rem' }}>
              {PRIORITY_OPTIONS.map(p => (
                <MenuItem key={p} value={p}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PRIORITY_COLORS[p] }} />
                    {priorityLabel(p)}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title="Delete selected">
            <IconButton size="small" color="error" onClick={() => setDeleteTarget({ ids: [...selected], label: `${selected.size} tasks` })}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </Paper>
      )}

      <Box sx={{ mb: 2 }}>
        <PaginationBar page={1} totalPages={1} onPageChange={() => {}} onRefresh={refresh} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : tasks.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
          <ViewListIcon sx={{ fontSize: 48, color: palette.custom.textMuted, mb: 2 }} />
          <Typography variant="h6" gutterBottom>No tasks yet</Typography>
          <Typography variant="body2" sx={{ color: palette.custom.textMuted, mb: 2 }}>
            {canWrite ? 'Create your first task to get started' : 'No tasks yet'}
          </Typography>
          {canWrite && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setQuickCreateOpen(true)}>New Task</Button>}
        </Box>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={currentGroupConfig.dndEnabled ? handleDragStart : undefined} onDragOver={currentGroupConfig.dndEnabled ? handleDragOver : undefined} onDragEnd={currentGroupConfig.dndEnabled ? handleDragEnd : undefined}>
          {groupBy === 'tag' && (
            <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ mb: 1, py: 0 }}>
              Tasks may appear in multiple groups
            </Alert>
          )}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  {canWrite && <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.size === totalFiltered && totalFiltered > 0}
                      indeterminate={selected.size > 0 && selected.size < totalFiltered} onChange={toggleSelectAll} />
                  </TableCell>}
                  <TableCell><TableSortLabel active={sortField === 'title'} direction={sortField === 'title' && sortDir ? sortDir : 'asc'} onClick={() => handleSortClick('title')}>Title</TableSortLabel></TableCell>
                  <TableCell width={90}>Status</TableCell>
                  <TableCell width={110}><TableSortLabel active={sortField === 'priority'} direction={sortField === 'priority' && sortDir ? sortDir : 'asc'} onClick={() => handleSortClick('priority')}>Priority</TableSortLabel></TableCell>
                  <TableCell width={150}><TableSortLabel active={sortField === 'assignee'} direction={sortField === 'assignee' && sortDir ? sortDir : 'asc'} onClick={() => handleSortClick('assignee')}>Assignee</TableSortLabel></TableCell>
                  <TableCell width={80}><TableSortLabel active={sortField === 'estimate'} direction={sortField === 'estimate' && sortDir ? sortDir : 'asc'} onClick={() => handleSortClick('estimate')}>Est.</TableSortLabel></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupBy === 'none' ? (
                  // Flat list — no group headers
                  (tasksByGroup.get('__all__') ?? []).map(task => (
                    <DraggableTaskRow
                      key={task.id}
                      task={task}
                      team={team}
                      canWrite={canWrite}
                      selected={selected.has(task.id)}
                      isBeingDragged={activeId === task.id}
                      groupColor="transparent"
                      onToggleSelect={() => toggleSelect(task.id)}
                      onNavigate={() => goToTask(task.id)}
                      onInlineStatus={s => handleInlineStatus(task, s)}
                      onInlinePriority={p => handleInlinePriority(task, p)}
                      palette={palette}
                      taskEpics={taskEpicMap.get(task.id)}
                      onTagClick={t => setFilter('tag', t)}
                      activeTag={filters.tag}
                      onAssigneeClick={id => setFilter('assignee', id)}
                      onEpicClick={id => setFilter('epic', id)}
                    />
                  ))
                ) : (
                  // Grouped rendering
                  groups.filter(g => groupBy !== 'status' || visibleStatuses.has(g.key as TaskStatus)).map(({ key: groupKey, label, color }) => {
                    const groupTasks = tasksByGroup.get(groupKey) ?? [];
                    if (groupTasks.length === 0 && !(activeId && overGroupKey === groupKey)) return null;
                    const isCollapsed = collapsed.has(groupKey);
                    const groupSelected = groupTasks.filter(t => selected.has(t.id)).length;

                    return (
                      <Fragment key={groupKey}>
                        <DroppableGroupHeader
                          groupKey={groupKey} label={label} color={color} count={groupTasks.length}
                          isCollapsed={isCollapsed} canWrite={canWrite}
                          groupSelected={groupSelected} groupTotal={groupTasks.length}
                          onToggleCollapse={() => toggleCollapse(groupKey)}
                          onToggleSelectGroup={() => toggleSelectGroup(groupKey)}
                          dndEnabled={currentGroupConfig.dndEnabled}
                        />
                        {!isCollapsed && groupTasks.map(task => (
                          <DraggableTaskRow
                            key={task.id}
                            task={task}
                            team={team}
                            canWrite={canWrite}
                            selected={selected.has(task.id)}
                            isBeingDragged={activeId === task.id}
                            groupColor={color}
                            onToggleSelect={() => toggleSelect(task.id)}
                            onNavigate={() => goToTask(task.id)}
                            onInlineStatus={s => handleInlineStatus(task, s)}
                            onInlinePriority={p => handleInlinePriority(task, p)}
                            palette={palette}
                            taskEpics={taskEpicMap.get(task.id)}
                            onTagClick={t => setFilter('tag', t)}
                            activeTag={filters.tag}
                            onAssigneeClick={id => setFilter('assignee', id)}
                            onEpicClick={id => setFilter('epic', id)}
                          />
                        ))}
                        <TailDropZone groupKey={groupKey} color={color} dndEnabled={currentGroupConfig.dndEnabled} />
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <DragOverlay>
            {activeTask ? (
              <Paper variant="outlined" sx={{ px: 2, py: 1, opacity: 0.9, bgcolor: palette.custom.surface, boxShadow: 4, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600}>{activeTask.title}</Typography>
                <StatusBadge label={priorityLabel(activeTask.priority)} color={PRIORITY_BADGE_COLOR[activeTask.priority]} size="small" />
              </Paper>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Box sx={{ mt: 2 }}>
        <PaginationBar page={1} totalPages={1} onPageChange={() => {}} onRefresh={refresh} />
      </Box>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Tasks"
        message={`Are you sure you want to delete ${deleteTarget?.label}? This action cannot be undone.`}
        confirmLabel="Delete" confirmColor="error"
        onConfirm={handleBulkDelete} onCancel={() => setDeleteTarget(null)} loading={deleting}
      />

      <QuickCreateDialog
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={refresh}
      />
    </Box>
  );
}
