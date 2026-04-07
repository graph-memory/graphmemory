import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Stack, Chip,
  Alert, CircularProgress, useTheme, useMediaQuery, alpha,
  IconButton, TextField, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import FlagIcon from '@mui/icons-material/Flag';
import ScheduleIcon from '@mui/icons-material/Schedule';
import {
  DndContext, closestCenter, pointerWithin,
  PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { useFilters } from '@/shared/lib/useFilters.ts';
import { StatusBadge, ConfirmDialog, PaginationBar, FilterBar, FilterControl } from '@/shared/ui/index.ts';
import {
  listTasks, reorderTask, updateTask, deleteTask,
  COLUMNS, PRIORITY_COLORS, PRIORITY_BADGE_COLOR, priorityLabel,
  type Task, type TaskStatus, type TaskPriority,
} from '@/entities/task/index.ts';
import { listTeam, type TeamMember } from '@/entities/project/api.ts';
import { listEpics, listEpicTasks, type Epic } from '@/entities/epic/index.ts';
import { useColumnVisibility } from './useColumnVisibility.ts';
import { QuickCreateDialog } from '@/features/task-crud/QuickCreateDialog.tsx';
import { TasksTabs } from './TasksTabs.tsx';
import { Select, MenuItem } from '@mui/material';

const DONE_STATUSES: TaskStatus[] = ['done', 'cancelled'];
const DAY_MS = 86_400_000;

function dueDateInfo(dueDate: number | null, status: TaskStatus): { label: string; color: 'error' | 'warning' | 'default' } | null {
  if (!dueDate || DONE_STATUSES.includes(status)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - now.getTime()) / DAY_MS);
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, color: 'error' };
  if (days === 0) return { label: 'Due today', color: 'warning' };
  if (days <= 3) return { label: `Due in ${days}d`, color: 'warning' };
  return null;
}


// ---------------------------------------------------------------------------
// Sortable card wrapper
// ---------------------------------------------------------------------------

const SortableTaskCard = memo(function SortableTaskCard({
  task, teamMap, canWrite, onNavigate, onEdit, onDelete, palette, taskEpics, onTagClick, activeTag, onAssigneeClick, onPriorityChange, onEpicClick,
}: {
  task: Task; teamMap: Map<number, TeamMember>; canWrite: boolean;
  onNavigate: (id: string) => void; onEdit: (id: string) => void; onDelete: (t: Task) => void;
  palette: any; taskEpics?: Epic[]; onTagClick: (tag: string) => void; activeTag?: string; onAssigneeClick: (id: number) => void; onPriorityChange: (p: TaskPriority) => void; onEpicClick: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const due = dueDateInfo(task.dueDate, task.status);

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(canWrite ? listeners : {})}
      variant="outlined"
      onClick={() => onNavigate(task.id)}
      sx={{
        p: 1.5, cursor: 'pointer', position: 'relative',
        bgcolor: palette.custom.surface,
        '&:hover': { borderColor: 'primary.main' },
        '&:hover .task-actions': { opacity: 1 },
        touchAction: 'none',
      }}
    >
      {/* Quick actions overlay */}
      <Box
        className="task-actions"
        sx={{
          position: 'absolute', top: 4, right: 4,
          display: 'flex', gap: 0.25,
          opacity: 0, transition: 'opacity 0.15s',
          bgcolor: palette.custom.surface,
          borderRadius: 0.5,
        }}
      >
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onEdit(task.id); }}
          sx={{ p: 0.5 }}
        >
          <EditIcon sx={{ fontSize: 15 }} />
        </IconButton>
        {canWrite && (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onDelete(task); }}
            sx={{ p: 0.5, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: 15 }} />
          </IconButton>
        )}
      </Box>

      {/* Title */}
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, pr: 3 }}>
        {task.title}
      </Typography>

      {/* Badges row: priority, assignee, estimate, due date */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', mb: task.description ? 0.5 : 0 }}>
        <Select
          size="small"
          name={`bp-${task.id}`}
          value={task.priority}
          onChange={e => { e.stopPropagation(); onPriorityChange(e.target.value as TaskPriority); }}
          variant="standard"
          disableUnderline
          onClick={e => e.stopPropagation()}
          sx={{
            bgcolor: alpha(PRIORITY_COLORS[task.priority], 0.12),
            color: PRIORITY_COLORS[task.priority],
            fontWeight: 600, fontSize: '0.75rem', borderRadius: '999px',
            border: `1px solid ${alpha(PRIORITY_COLORS[task.priority], 0.3)}`,
            height: 24, minWidth: 60,
            '& .MuiSelect-select': { py: '2px', px: 1, display: 'flex', alignItems: 'center' },
            '& .MuiSelect-icon': { fontSize: '0.9rem', color: PRIORITY_COLORS[task.priority], right: 2 },
            '&:before, &:after': { display: 'none' },
          }}
        >
          {(['critical', 'high', 'medium', 'low'] as const).map(p => (
            <MenuItem key={p} value={p}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PRIORITY_COLORS[p] }} />
                {priorityLabel(p)}
              </Box>
            </MenuItem>
          ))}
        </Select>
        {task.assigneeId != null && (
          <Typography
            variant="caption"
            component="span"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onAssigneeClick(task.assigneeId!); }}
            sx={{ color: palette.custom.textMuted, cursor: 'pointer', '&:hover': { textDecoration: 'underline', color: palette.text.primary } }}
          >
            @{teamMap.get(task.assigneeId!)?.name ?? task.assigneeId}
          </Typography>
        )}
        {task.estimate != null && (
          <Chip
            icon={<ScheduleIcon sx={{ fontSize: '14px !important' }} />}
            label={`${task.estimate}h`}
            size="small"
            variant="outlined"
            sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' }, '& .MuiChip-icon': { ml: 0.5 } }}
          />
        )}
        {due && (
          <Chip
            label={due.label}
            size="small"
            color={due.color}
            sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' } }}
          />
        )}
      </Box>

      {task.description && (
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: palette.custom.textMuted }}>
          {task.description.length > 80 ? task.description.slice(0, 80) + '...' : task.description}
        </Typography>
      )}
      {(taskEpics?.length || task.tags?.length) ? (
        <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
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
    </Paper>
  );
});

// ---------------------------------------------------------------------------
// Droppable column wrapper — makes the entire column a valid drop target
// ---------------------------------------------------------------------------

function DroppableColumn({ status, children }: { status: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: status });
  return <Box ref={setNodeRef} sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>{children}</Box>;
}

// Custom collision detection: prefer task cards (closestCenter) over column droppables (pointerWithin)
const COLUMN_IDS = new Set<string>(COLUMNS.map(c => c.status));

const boardCollisionDetection: CollisionDetection = (args) => {
  // pointerWithin returns all droppables the pointer is inside of (cards + columns)
  const collisions = pointerWithin(args);

  // Prefer card over column (card is more specific)
  const cardHit = collisions.find(c => !COLUMN_IDS.has(c.id as string));
  if (cardHit) return [cardHit];

  // No card — return column (empty column or gap between cards)
  const columnHit = collisions.find(c => COLUMN_IDS.has(c.id as string));
  if (columnHit) return [columnHit];

  // Last resort — closest by center
  return closestCenter(args);
};

// ---------------------------------------------------------------------------
// Board page
// ---------------------------------------------------------------------------

type BoardFilterKey = 'q' | 'priority' | 'tag' | 'assignee' | 'epic';

const BOARD_FILTER_DEFS = [
  { key: 'q', defaultValue: '' },
  { key: 'priority', defaultValue: '' },
  { key: 'tag', defaultValue: '' },
  { key: 'assignee', defaultValue: '' },
  { key: 'epic', defaultValue: '' },
];

export default function TaskBoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { palette } = theme;
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const canWrite = useCanWrite('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [epicTaskIds, setEpicTaskIds] = useState<Set<string> | null>(null);
  const [taskEpicMap, setTaskEpicMap] = useState<Map<string, Epic[]>>(new Map());

  const { filters, setFilter, clearAll } = useFilters<BoardFilterKey>(BOARD_FILTER_DEFS);

  const teamMap = useMemo(() => new Map(team.map(m => [m.id, m])), [team]);

  // Stable callbacks for card props
  const handleCardNavigate = useCallback((id: string) => navigate(`/${projectId}/tasks/${id}?from=board`), [navigate, projectId]);
  const handleCardEdit = useCallback((id: string) => navigate(`/${projectId}/tasks/${id}/edit?from=board`), [navigate, projectId]);
  const handleTagClick = useCallback((t: string) => setFilter('tag', t), [setFilter]);
  const handleAssigneeClick = useCallback((id: number) => setFilter('assignee', String(id)), [setFilter]);
  const handleEpicClick = useCallback((id: string) => setFilter('epic', id), [setFilter]);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const dragStartSnapshot = useRef<Task | null>(null);

  // Column visibility
  const { visible, toggle: toggleColumn, visibleColumns } = useColumnVisibility();

  // Quick create dialog
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateStatus, setQuickCreateStatus] = useState<TaskStatus | undefined>(undefined);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  // DnD sensors — require 5px movement before activating to allow clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
    listTeam(projectId).then(setTeam).catch(e => console.error('Failed to load team', e));
    listEpics(projectId).then(async ({ items: list }) => {
      setEpics(list);
      // Build taskId → epic[] map
      const map = new Map<string, Epic[]>();
      await Promise.all(list.map(async (epic) => {
        const tasks = await listEpicTasks(projectId, epic.id).catch(e => { console.error('Failed to load epic tasks', e); return []; });
        for (const t of tasks) {
          const arr = map.get(t.id) ?? [];
          arr.push(epic);
          map.set(t.id, arr);
        }
      }));
      setTaskEpicMap(map);
    }).catch(e => console.error('Failed to load epics', e));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !filters.epic) { setEpicTaskIds(null); return; }
    listEpicTasks(projectId, filters.epic).then(tasks => setEpicTaskIds(new Set(tasks.map(t => t.id)))).catch(e => { console.error('Failed to filter epic tasks', e); setEpicTaskIds(null); });
  }, [projectId, filters.epic]);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('task:') && !activeId) refresh();
  }, [refresh, activeId]));

  // --- DnD handlers ---

  // Find which column an overId belongs to
  const findColumnForId = useCallback((id: string): TaskStatus | null => {
    if (COLUMN_IDS.has(id)) return id as TaskStatus;
    const task = tasks.find(t => t.id === id);
    return task?.status ?? null;
  }, [tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    dragStartSnapshot.current = task ? { ...task } : null;
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) { setOverColumn(null); return; }

    const activeColumn = findColumnForId(active.id as string);
    const overColumn_ = findColumnForId(over.id as string);
    setOverColumn(overColumn_);

    // Move task between columns live (so SortableContext updates)
    if (activeColumn && overColumn_ && activeColumn !== overColumn_) {
      setTasks(prev => prev.map(t =>
        t.id === active.id ? { ...t, status: overColumn_ } : t
      ));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const snapshot = dragStartSnapshot.current;
    setActiveId(null);
    setOverColumn(null);
    dragStartSnapshot.current = null;

    if (!over || !projectId || !canWrite || !snapshot) return;
    if (active.id === over.id) return;

    const overId = over.id as string;
    const activeTask = tasks.find(t => t.id === active.id);
    if (!activeTask) return;

    // Determine target status
    let targetStatus: TaskStatus = activeTask.status;
    const col = COLUMNS.find(c => c.status === overId);
    if (col) {
      targetStatus = col.status;
    } else {
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) targetStatus = overTask.status;
    }

    // Get sorted tasks in target column (including the dragged task)
    const columnTasks = tasks
      .filter(t => t.status === targetStatus)
      .sort((a, b) => a.order - b.order);

    // Compute new order
    let newOrder: number;
    if (col) {
      // Dropped on the column itself — append to end
      const others = columnTasks.filter(t => t.id !== activeTask.id);
      newOrder = others.length > 0 ? others[others.length - 1].order + 1000 : 0;
    } else {
      // Dropped on a specific card — use arrayMove to get final order
      const activeIdx = columnTasks.findIndex(t => t.id === active.id);
      const overIdx = columnTasks.findIndex(t => t.id === overId);
      if (activeIdx < 0 || overIdx < 0) {
        const others = columnTasks.filter(t => t.id !== activeTask.id);
        newOrder = others.length > 0 ? others[others.length - 1].order + 1000 : 0;
      } else {
        const reordered = arrayMove(columnTasks, activeIdx, overIdx);
        const newIdx = reordered.findIndex(t => t.id === active.id);
        // Compute order based on neighbors in the reordered list
        const prev = newIdx > 0 ? reordered[newIdx - 1].order : null;
        const next = newIdx < reordered.length - 1 ? reordered[newIdx + 1].order : null;
        if (prev == null && next == null) newOrder = 0;
        else if (prev == null) newOrder = next! - 1000;
        else if (next == null) newOrder = prev + 1000;
        else newOrder = Math.floor((prev + next) / 2);
      }
    }

    // Check if anything actually changed
    const statusChanged = targetStatus !== snapshot.status;
    const orderChanged = newOrder !== snapshot.order;
    if (!statusChanged && !orderChanged) return;

    // Optimistic update — apply final status + order
    setTasks(prev => prev.map(t =>
      t.id === activeTask.id ? { ...t, status: targetStatus, order: newOrder } : t
    ));

    try {
      await reorderTask(projectId, activeTask.id, newOrder, statusChanged ? targetStatus : undefined);
    } catch {
      refresh();
    }
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!deleteTarget || !projectId) return;
    setDeleting(true);
    try {
      setTasks(prev => prev.filter(t => t.id !== deleteTarget.id));
      await deleteTask(projectId, deleteTarget.id);
    } catch {
      refresh();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // --- Filtered & grouped tasks ---
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) t.tags?.forEach(tag => set.add(tag));
    return [...set].sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }
    if (filters.priority) {
      filtered = filtered.filter(t => t.priority === filters.priority);
    }
    if (filters.tag) {
      filtered = filtered.filter(t => t.tags?.includes(filters.tag));
    }
    if (filters.assignee) {
      const aid = Number(filters.assignee);
      filtered = filtered.filter(t => t.assigneeId === aid);
    }
    if (epicTaskIds) {
      filtered = filtered.filter(t => epicTaskIds.has(t.id));
    }
    return filtered;
  }, [tasks, filters.q, filters.priority, filters.tag, filters.assignee, epicTaskIds]);

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const col of COLUMNS) map.set(col.status, []);
    for (const t of filteredTasks) {
      const list = map.get(t.status);
      if (list) list.push(t);
    }
    // Sort each column by order
    for (const [, list] of map) {
      list.sort((a, b) => a.order - b.order);
    }
    return map;
  }, [filteredTasks]);

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
      const m = teamMap.get(Number(filters.assignee));
      chips.push({ key: 'assignee', label: `@${m?.name || filters.assignee}`, onClear: () => setFilter('assignee', '') });
    }
    if (filters.epic) {
      const ep = epics.find(e => e.id === filters.epic);
      chips.push({ key: 'epic', label: ep?.title || filters.epic, onClear: () => setFilter('epic', '') });
    }
    return chips;
  }, [filters, team, epics, setFilter]);

  const activeTask = useMemo(() => activeId ? tasks.find(t => t.id === activeId) : null, [activeId, tasks]);

  return (
    <Box>
      <TasksTabs />

      {/* Filter bar */}
      <FilterBar activeFilters={activeFilterChips} onClearAll={clearAll}>
        <TextField
          size="small"
          placeholder="Search tasks..."
          value={filters.q}
          onChange={e => setFilter('q', e.target.value)}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: palette.custom.textMuted }} /></InputAdornment>,
              endAdornment: filters.q ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setFilter('q', '')}><CloseIcon fontSize="small" /></IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
          sx={{ minWidth: 200, flex: 1, maxWidth: 350 }}
        />
        <FilterControl
          name="filter-priority"
          value={filters.priority}
          onChange={v => setFilter('priority', v)}
          placeholder="Priority"
          allLabel="All priorities"
          options={(['critical', 'high', 'medium', 'low'] as const).map(p => ({ value: p, label: priorityLabel(p), color: PRIORITY_COLORS[p] }))}
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
          options={team.map(m => ({ value: String(m.id), label: m.name || m.slug }))}
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

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          {COLUMNS.map(({ status, label, color }) => {
            const isOn = visible.has(status);
            return (
              <Chip
                key={status}
                label={label}
                size="small"
                onClick={() => toggleColumn(status)}
                disabled={isOn && visible.size === 1}
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
        <Box sx={{ flex: 1 }} />
        {canWrite && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => { setQuickCreateStatus(undefined); setQuickCreateOpen(true); }}>
            New Task
          </Button>
        )}
        <PaginationBar page={1} totalPages={1} onPageChange={() => {}} onRefresh={refresh} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : tasks.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
          <ViewKanbanIcon sx={{ fontSize: 48, color: palette.custom.textMuted, mb: 2 }} />
          <Typography variant="h6" gutterBottom>No tasks yet</Typography>
          <Typography variant="body2" sx={{ color: palette.custom.textMuted, mb: 2 }}>
            {canWrite ? 'Create your first task to get started' : 'No tasks yet'}
          </Typography>
          {canWrite && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(`/${projectId}/tasks/new?from=board`)}>
              New Task
            </Button>
          )}
        </Box>
      ) : isMobile ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" sx={{ mb: 2, color: palette.custom.textMuted }}>
            Kanban board works best on larger screens.
          </Typography>
          <Button variant="outlined" onClick={() => navigate(`/${projectId}/tasks`)}>
            Switch to List View
          </Button>
        </Box>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, alignItems: 'stretch', minHeight: 0 }}>
            {visibleColumns.map(({ status, label, color }) => {
              const columnTasks = grouped.get(status)!;
              const isDropTarget = overColumn === status && activeId !== null;
              return (
                <Paper
                  key={status}
                  variant="outlined"
                  sx={{
                    minWidth: 220, flex: 1,
                    display: 'flex', flexDirection: 'column',
                    borderTop: `3px solid ${color}`,
                    bgcolor: isDropTarget ? alpha(color, 0.06) : palette.custom.surfaceMuted,
                    borderColor: isDropTarget ? color : undefined,
                    borderStyle: isDropTarget ? 'dashed' : undefined,
                    transition: 'background-color 0.15s, border-color 0.15s',
                  }}
                >
                  <DroppableColumn status={status}>
                    {/* Column header */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, pt: 1.5, pb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography variant="subtitle2" fontWeight={700}>{label}</Typography>
                        <Box sx={{
                          bgcolor: alpha(color, 0.2), color, borderRadius: '10px',
                          px: 0.8, py: 0.1, fontSize: '0.7rem', fontWeight: 700,
                          lineHeight: 1.4, minWidth: 20, textAlign: 'center',
                        }}>{columnTasks.length}</Box>
                      </Box>
                      {canWrite && (
                        <IconButton
                          size="small"
                          onClick={() => { setQuickCreateStatus(status); setQuickCreateOpen(true); }}
                          sx={{ p: 0.25, color: palette.custom.textMuted }}
                        >
                          <AddIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      )}
                    </Box>

                    {/* Column body with sortable context */}
                    <SortableContext items={columnTasks.map(t => t.id)} strategy={verticalListSortingStrategy} id={status}>
                      <Stack spacing={1} sx={{
                        flex: 1, overflowY: 'auto', px: 1.5, pb: 1.5, minHeight: 120,
                        '&::-webkit-scrollbar': { width: 4 },
                        '&::-webkit-scrollbar-thumb': { bgcolor: alpha(palette.text.primary, 0.15), borderRadius: 2 },
                      }}>
                        {columnTasks.map(task => (
                          <SortableTaskCard
                            key={task.id}
                            task={task}
                            teamMap={teamMap}
                            canWrite={canWrite}
                            onNavigate={handleCardNavigate}
                            onEdit={handleCardEdit}
                            onDelete={setDeleteTarget}
                            palette={palette}
                            taskEpics={taskEpicMap.get(task.id)}
                            onTagClick={handleTagClick}
                            activeTag={filters.tag}
                            onAssigneeClick={handleAssigneeClick}
                            onEpicClick={handleEpicClick}
                            onPriorityChange={async (p) => {
                              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, priority: p } : t));
                              try { await updateTask(projectId!, task.id, { priority: p }); } catch { refresh(); }
                            }}
                          />
                        ))}
                      </Stack>
                    </SortableContext>
                  </DroppableColumn>
                </Paper>
              );
            })}
          </Box>

          {/* Drag overlay — shows a ghost of the dragged card */}
          <DragOverlay>
            {activeTask ? (
              <Paper variant="outlined" sx={{ p: 1.5, opacity: 0.85, bgcolor: palette.custom.surface, boxShadow: 4, maxWidth: 280 }}>
                <Typography variant="body2" fontWeight={600}>{activeTask.title}</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                  <StatusBadge label={priorityLabel(activeTask.priority)} color={PRIORITY_BADGE_COLOR[activeTask.priority]} size="small" />
                </Box>
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
        title="Delete Task"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />

      <QuickCreateDialog
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={refresh}
        defaultStatus={quickCreateStatus}
      />
    </Box>
  );
}
