import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Stack, Chip,
  Alert, CircularProgress, useTheme, alpha,
  IconButton, MenuItem, TextField, InputAdornment, FormControl, Select,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ScheduleIcon from '@mui/icons-material/Schedule';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, StatusBadge, Tags, ConfirmDialog } from '@/shared/ui/index.ts';
import {
  listTasks, reorderTask, createTask, deleteTask,
  COLUMNS, PRIORITY_COLORS, PRIORITY_BADGE_COLOR, priorityLabel,
  type Task, type TaskStatus, type TaskPriority,
} from '@/entities/task/index.ts';
import { listTeam, type TeamMember } from '@/entities/project/api.ts';
import { useColumnVisibility } from './useColumnVisibility.ts';

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

/** Compute a new order value for inserting at a given index in a sorted list. */
function computeOrderAt(items: Task[], index: number): number {
  if (items.length === 0) return 0;
  if (index <= 0) return (items[0]?.order ?? 0) - 1000;
  if (index >= items.length) return (items[items.length - 1]?.order ?? 0) + 1000;
  const before = items[index - 1]?.order ?? 0;
  const after = items[index]?.order ?? before + 2000;
  return Math.floor((before + after) / 2);
}

// ---------------------------------------------------------------------------
// Sortable card wrapper
// ---------------------------------------------------------------------------

function SortableTaskCard({
  task, team, canWrite, onNavigate, onEdit, onDelete, palette,
}: {
  task: Task; team: TeamMember[]; canWrite: boolean;
  onNavigate: (id: string) => void; onEdit: (id: string) => void; onDelete: (t: Task) => void;
  palette: any;
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

      {/* Title + assignee */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5, pr: 3 }}>
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
          {task.title}
        </Typography>
      </Box>
      {task.assignee && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          @{team.find(m => m.id === task.assignee)?.name ?? task.assignee}
        </Typography>
      )}

      {/* Badges row: priority, estimate, due date */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: task.description ? 0.5 : 0 }}>
        <StatusBadge
          label={priorityLabel(task.priority)}
          color={PRIORITY_BADGE_COLOR[task.priority]}
          size="small"
        />
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
      {task.tags?.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Tags tags={task.tags} />
        </Box>
      )}
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Board page
// ---------------------------------------------------------------------------

export default function TaskBoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const canWrite = useCanWrite('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);

  // Column visibility
  const { visible, toggle: toggleColumn, visibleColumns } = useColumnVisibility();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('');
  const [filterTag, setFilterTag] = useState('');

  // Inline create
  const [inlineCreateColumn, setInlineCreateColumn] = useState<TaskStatus | null>(null);
  const [inlineCreateTitle, setInlineCreateTitle] = useState('');
  const inlineInputRef = useRef<HTMLInputElement>(null);

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
  }, [projectId]);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('task:')) refresh();
  }, [refresh]));

  useEffect(() => {
    if (inlineCreateColumn) {
      setTimeout(() => inlineInputRef.current?.focus(), 50);
    }
  }, [inlineCreateColumn]);

  // --- DnD handlers ---
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) { setOverColumn(null); return; }

    // Determine which column we're over
    const overId = over.id as string;
    // Check if over a column droppable (status name)
    const col = COLUMNS.find(c => c.status === overId);
    if (col) { setOverColumn(col.status); return; }
    // Otherwise over a task card — find its column
    const overTask = tasks.find(t => t.id === overId);
    if (overTask) { setOverColumn(overTask.status); return; }
    setOverColumn(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumn(null);

    if (!over || !projectId || !canWrite) return;

    const activeTask = tasks.find(t => t.id === active.id);
    if (!activeTask) return;

    const overId = over.id as string;

    // Determine target status: either directly a column, or the column of the task we're over
    let targetStatus: TaskStatus = activeTask.status;
    const col = COLUMNS.find(c => c.status === overId);
    if (col) {
      targetStatus = col.status;
    } else {
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) targetStatus = overTask.status;
    }

    // Get sorted tasks in target column
    const columnTasks = tasks
      .filter(t => t.status === targetStatus && t.id !== activeTask.id)
      .sort((a, b) => a.order - b.order);

    // Compute new order
    let newOrder: number;
    if (col) {
      // Dropped on the column itself (not on a card) — append to end
      newOrder = columnTasks.length > 0 ? columnTasks[columnTasks.length - 1].order + 1000 : 0;
    } else {
      // Dropped on a specific card — insert before it
      const overIdx = columnTasks.findIndex(t => t.id === overId);
      newOrder = computeOrderAt(columnTasks, overIdx >= 0 ? overIdx : columnTasks.length);
    }

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === activeTask.id ? { ...t, status: targetStatus, order: newOrder } : t
    ));

    try {
      await reorderTask(projectId, activeTask.id, newOrder, targetStatus !== activeTask.status ? targetStatus : undefined);
    } catch {
      refresh();
    }
  };

  // --- Inline create ---
  const handleInlineCreate = async (status: TaskStatus) => {
    const title = inlineCreateTitle.trim();
    if (!title || !projectId) return;
    setInlineCreateTitle('');
    setInlineCreateColumn(null);
    try {
      await createTask(projectId, { title, status });
      refresh();
    } catch { /* refresh will sync */ }
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
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }
    if (filterPriority) {
      filtered = filtered.filter(t => t.priority === filterPriority);
    }
    if (filterTag) {
      filtered = filtered.filter(t => t.tags?.includes(filterTag));
    }
    if (assigneeFilter) {
      filtered = filtered.filter(t => t.assignee === assigneeFilter);
    }
    return filtered;
  }, [tasks, searchQuery, filterPriority, filterTag, assigneeFilter]);

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

  const hasFilters = searchQuery || filterPriority || filterTag || assigneeFilter;
  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[{ label: 'Tasks' }, { label: 'Board' }]}
        actions={
          <>
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
                      height: 26,
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      cursor: 'pointer',
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
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(`/${projectId}/tasks/new`)}>
                New Task
              </Button>
            )}
          </>
        }
      />

      {/* Filter bar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 2, py: 1, bgcolor: palette.custom.surfaceMuted,
        borderRadius: 1, mb: 2,
      }}>
        <TextField
          size="small"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: palette.custom.textMuted }} /></InputAdornment>,
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}><CloseIcon fontSize="small" /></IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
          sx={{ minWidth: 200, flex: 1, maxWidth: 350 }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value as TaskPriority | '')}
            displayEmpty
            renderValue={v => v ? priorityLabel(v as TaskPriority) : 'Priority'}
            sx={{ color: filterPriority ? undefined : palette.custom.textMuted }}
          >
            <MenuItem value="">All priorities</MenuItem>
            {(['critical', 'high', 'medium', 'low'] as const).map(p => (
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
            <Select
              value={filterTag}
              onChange={e => setFilterTag(e.target.value)}
              displayEmpty
              renderValue={v => v || 'Tag'}
              sx={{ color: filterTag ? undefined : palette.custom.textMuted }}
            >
              <MenuItem value="">All tags</MenuItem>
              {allTags.map(tag => <MenuItem key={tag} value={tag}>{tag}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        {team.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
              displayEmpty
              renderValue={v => {
                if (!v) return 'Assignee';
                const m = team.find(t => t.id === v);
                return m?.name || v;
              }}
              sx={{ color: assigneeFilter ? undefined : palette.custom.textMuted }}
            >
              <MenuItem value="">All</MenuItem>
              {team.map(m => <MenuItem key={m.id} value={m.id}>{m.name || m.id}</MenuItem>)}
            </Select>
          </FormControl>
        )}
        {hasFilters && (
          <Button size="small" onClick={() => { setSearchQuery(''); setFilterPriority(''); setFilterTag(''); setAssigneeFilter(''); }}>
            Clear
          </Button>
        )}
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
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(`/${projectId}/tasks/new`)}>
              New Task
            </Button>
          )}
        </Box>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, maxHeight: 'calc(100vh - 220px)' }}>
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
                        onClick={() => { setInlineCreateColumn(status); setInlineCreateTitle(''); }}
                        sx={{ p: 0.25, color: palette.custom.textMuted }}
                      >
                        <AddIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    )}
                  </Box>

                  {/* Inline create */}
                  {inlineCreateColumn === status && (
                    <Box sx={{ display: 'flex', gap: 0.5, px: 1.5, pb: 1 }}>
                      <TextField
                        inputRef={inlineInputRef}
                        size="small"
                        placeholder="Task title..."
                        value={inlineCreateTitle}
                        onChange={e => setInlineCreateTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleInlineCreate(status);
                          if (e.key === 'Escape') { setInlineCreateColumn(null); setInlineCreateTitle(''); }
                        }}
                        fullWidth
                        sx={{ '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
                      />
                      <IconButton size="small" onClick={() => { setInlineCreateColumn(null); setInlineCreateTitle(''); }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}

                  {/* Column body with sortable context */}
                  <SortableContext items={columnTasks.map(t => t.id)} strategy={verticalListSortingStrategy} id={status}>
                    <Stack spacing={1} sx={{
                      flex: 1, overflowY: 'auto', px: 1.5, pb: 1.5, minHeight: 50,
                      '&::-webkit-scrollbar': { width: 4 },
                      '&::-webkit-scrollbar-thumb': { bgcolor: alpha(palette.text.primary, 0.15), borderRadius: 2 },
                    }}>
                      {columnTasks.map(task => (
                        <SortableTaskCard
                          key={task.id}
                          task={task}
                          team={team}
                          canWrite={canWrite}
                          onNavigate={(id) => navigate(`/${projectId}/tasks/${id}`)}
                          onEdit={(id) => navigate(`/${projectId}/tasks/${id}/edit`)}
                          onDelete={setDeleteTarget}
                          palette={palette}
                        />
                      ))}
                    </Stack>
                  </SortableContext>
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
    </Box>
  );
}
