import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
import { PageTopBar, StatusBadge, ConfirmDialog } from '@/shared/ui/index.ts';
import {
  listTasks, updateTask, reorderTask, bulkMoveTasks, bulkUpdatePriority, bulkDeleteTasks,
  COLUMNS, PRIORITY_COLORS, PRIORITY_BADGE_COLOR, priorityLabel, statusLabel,
  type Task, type TaskStatus, type TaskPriority,
} from '@/entities/task/index.ts';
import { listTeam, type TeamMember } from '@/entities/project/api.ts';
import { listEpics, listEpicTasks, type Epic } from '@/entities/epic/index.ts';
import FlagIcon from '@mui/icons-material/Flag';
import { useColumnVisibility } from './useColumnVisibility.ts';
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
type SortDir = 'asc' | 'desc';

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
  status, label, color, count, isCollapsed, canWrite, groupSelected, groupTotal,
  onToggleCollapse, onToggleSelectGroup,
}: {
  status: TaskStatus; label: string; color: string; count: number;
  isCollapsed: boolean; canWrite: boolean; groupSelected: number; groupTotal: number;
  onToggleCollapse: () => void; onToggleSelectGroup: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${status}` });
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('');
  const [filterTag, setFilterTag] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [searchParams] = useSearchParams();
  const [epicFilter, setEpicFilter] = useState<string>(searchParams.get('epic') ?? '');
  const [epics, setEpics] = useState<Epic[]>([]);
  const [epicTaskIds, setEpicTaskIds] = useState<Set<string> | null>(null);
  const [taskEpicMap, setTaskEpicMap] = useState<Map<string, Epic[]>>(new Map());
  const [sortField, setSortField] = useState<SortField>('order');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overGroupStatus, setOverGroupStatus] = useState<TaskStatus | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const result = await listTasks(projectId, { limit: 500 });
      setTasks(result);
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
    listEpics(projectId).then(async (list) => {
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
    if (!projectId || !epicFilter) { setEpicTaskIds(null); return; }
    listEpicTasks(projectId, epicFilter).then(tasks => setEpicTaskIds(new Set(tasks.map(t => t.id)))).catch(() => setEpicTaskIds(null));
  }, [projectId, epicFilter]);
  useWebSocket(projectId ?? null, useCallback((event) => { if (event.type.startsWith('task:')) refresh(); }, [refresh]));

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) t.tags?.forEach(tag => set.add(tag));
    return [...set].sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
    }
    if (filterPriority) filtered = filtered.filter(t => t.priority === filterPriority);
    if (filterTag) filtered = filtered.filter(t => t.tags?.includes(filterTag));
    if (assigneeFilter) filtered = filtered.filter(t => t.assignee === assigneeFilter);
    if (epicTaskIds) filtered = filtered.filter(t => epicTaskIds.has(t.id));
    return filtered;
  }, [tasks, searchQuery, filterPriority, filterTag, assigneeFilter, epicTaskIds]);

  const compareTasks = useCallback((a: Task, b: Task): number => {
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

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const col of COLUMNS) map.set(col.status, []);
    for (const t of filteredTasks) { const list = map.get(t.status); if (list) list.push(t); }
    for (const [, list] of map) list.sort(compareTasks);
    return map;
  }, [filteredTasks, compareTasks]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const toggleCollapse = (status: TaskStatus) => {
    setCollapsed(prev => { const next = new Set(prev); if (next.has(status)) next.delete(status); else next.add(status); return next; });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    const allIds = filteredTasks.map(t => t.id);
    setSelected(selected.size === allIds.length ? new Set() : new Set(allIds));
  };
  const toggleSelectGroup = (status: TaskStatus) => {
    const groupIds = (grouped.get(status) ?? []).map(t => t.id);
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
    if (!over) { setOverGroupStatus(null); return; }
    const overId = over.id as string;
    if (overId.startsWith('group-')) { setOverGroupStatus(overId.replace('group-', '') as TaskStatus); return; }
    const overTask = tasks.find(t => t.id === overId);
    if (overTask) { setOverGroupStatus(overTask.status); return; }
    setOverGroupStatus(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverGroupStatus(null);
    if (!over || !projectId || !canWrite) return;

    const activeTask = tasks.find(t => t.id === active.id);
    if (!activeTask) return;

    const overId = over.id as string;

    // Determine target status
    let targetStatus: TaskStatus = activeTask.status;
    if (overId.startsWith('group-')) {
      targetStatus = overId.replace('group-', '') as TaskStatus;
    } else {
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) targetStatus = overTask.status;
    }

    const columnTasks = tasks
      .filter(t => t.status === targetStatus && t.id !== activeTask.id)
      .sort((a, b) => a.order - b.order);

    let newOrder: number;
    if (overId.startsWith('group-')) {
      newOrder = columnTasks.length > 0 ? columnTasks[columnTasks.length - 1].order + 1000 : 0;
    } else {
      const overIdx = columnTasks.findIndex(t => t.id === overId);
      newOrder = computeOrderAt(columnTasks, overIdx >= 0 ? overIdx : columnTasks.length);
    }

    setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, status: targetStatus, order: newOrder } : t));
    try {
      await reorderTask(projectId, activeTask.id, newOrder, targetStatus !== activeTask.status ? targetStatus : undefined);
    } catch { refresh(); }
  };

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const goToTask = (taskId: string) => navigate(`/${projectId}/tasks/${taskId}`);

  const hasFilters = searchQuery || filterPriority || filterTag || assigneeFilter || epicFilter;
  const totalFiltered = filteredTasks.length;
  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[{ label: 'Tasks' }, { label: 'List' }]}
        actions={
          <>
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
            {canWrite && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setQuickCreateOpen(true)}>New Task</Button>
            )}
          </>
        }
      />

      {/* Filter bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, bgcolor: palette.custom.surfaceMuted, borderRadius: 1, mb: 2 }}>
        <TextField
          size="small" placeholder="Search tasks..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          slotProps={{ input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: palette.custom.textMuted }} /></InputAdornment>,
            endAdornment: searchQuery ? <InputAdornment position="end"><IconButton size="small" onClick={() => setSearchQuery('')}><CloseIcon fontSize="small" /></IconButton></InputAdornment> : undefined,
          }}}
          sx={{ minWidth: 200, flex: 1, maxWidth: 350 }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select name="filter-priority" value={filterPriority} onChange={e => setFilterPriority(e.target.value as TaskPriority | '')} displayEmpty
            renderValue={v => v ? priorityLabel(v as TaskPriority) : 'Priority'} sx={{ color: filterPriority ? undefined : palette.custom.textMuted }}>
            <MenuItem value="">All priorities</MenuItem>
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
        {allTags.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select name="filter-tag" value={filterTag} onChange={e => setFilterTag(e.target.value)} displayEmpty
              renderValue={v => v || 'Tag'} sx={{ color: filterTag ? undefined : palette.custom.textMuted }}>
              <MenuItem value="">All tags</MenuItem>
              {allTags.map(tag => <MenuItem key={tag} value={tag}>{tag}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        {team.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select name="filter-assignee" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} displayEmpty
              renderValue={v => { if (!v) return 'Assignee'; const m = team.find(t => t.id === v); return m?.name || v; }}
              sx={{ color: assigneeFilter ? undefined : palette.custom.textMuted }}>
              <MenuItem value="">All</MenuItem>
              {team.map(m => <MenuItem key={m.id} value={m.id}>{m.name || m.id}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        {epics.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              name="filter-epic"
              value={epicFilter}
              onChange={e => setEpicFilter(e.target.value)}
              displayEmpty
              renderValue={v => {
                if (!v) return 'Epic';
                const ep = epics.find(e => e.id === v);
                return ep?.title || v;
              }}
              sx={{ color: epicFilter ? undefined : palette.custom.textMuted }}
            >
              <MenuItem value="">All epics</MenuItem>
              {epics.map(e => (
                <MenuItem key={e.id} value={e.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FlagIcon sx={{ fontSize: 14, color: e.status === 'open' ? '#1976d2' : e.status === 'in_progress' ? '#f57c00' : e.status === 'done' ? '#388e3c' : '#d32f2f' }} />
                    {e.title}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        {hasFilters && <Button size="small" onClick={() => { setSearchQuery(''); setFilterPriority(''); setFilterTag(''); setAssigneeFilter(''); setEpicFilter(''); }}>Clear</Button>}
      </Box>

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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  {canWrite && <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.size === totalFiltered && totalFiltered > 0}
                      indeterminate={selected.size > 0 && selected.size < totalFiltered} onChange={toggleSelectAll} />
                  </TableCell>}
                  <TableCell><TableSortLabel active={sortField === 'title'} direction={sortField === 'title' ? sortDir : 'asc'} onClick={() => handleSort('title')}>Title</TableSortLabel></TableCell>
                  <TableCell width={130}>Status</TableCell>
                  <TableCell width={120}><TableSortLabel active={sortField === 'priority'} direction={sortField === 'priority' ? sortDir : 'asc'} onClick={() => handleSort('priority')}>Priority</TableSortLabel></TableCell>
                  <TableCell width={120}><TableSortLabel active={sortField === 'assignee'} direction={sortField === 'assignee' ? sortDir : 'asc'} onClick={() => handleSort('assignee')}>Assignee</TableSortLabel></TableCell>
                  <TableCell width={80}><TableSortLabel active={sortField === 'estimate'} direction={sortField === 'estimate' ? sortDir : 'asc'} onClick={() => handleSort('estimate')}>Est.</TableSortLabel></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {COLUMNS.filter(c => visibleStatuses.has(c.status)).map(({ status, label, color }) => {
                  const groupTasks = grouped.get(status) ?? [];
                  if (groupTasks.length === 0 && !(activeId && overGroupStatus === status)) return null;
                  const isCollapsed = collapsed.has(status);
                  const groupSelected = groupTasks.filter(t => selected.has(t.id)).length;

                  return (
                    <Fragment key={status}>
                      <DroppableGroupHeader
                        status={status} label={label} color={color} count={groupTasks.length}
                        isCollapsed={isCollapsed} canWrite={canWrite}
                        groupSelected={groupSelected} groupTotal={groupTasks.length}
                        onToggleCollapse={() => toggleCollapse(status)}
                        onToggleSelectGroup={() => toggleSelectGroup(status)}
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
                          onTagClick={setFilterTag}
                          activeTag={filterTag}
                          onAssigneeClick={setAssigneeFilter}
                          onEpicClick={setEpicFilter}
                        />
                      ))}
                    </Fragment>
                  );
                })}
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
