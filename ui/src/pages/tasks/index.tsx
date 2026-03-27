import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Stack, Chip,
  Alert, CircularProgress, useTheme, alpha,
  IconButton, Menu, MenuItem, Checkbox, ListItemText,
  TextField, InputAdornment, FormControl, Select, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, StatusBadge, Tags, ConfirmDialog } from '@/shared/ui/index.ts';
import {
  listTasks, moveTask, createTask, deleteTask,
  COLUMNS, PRIORITY_BADGE_COLOR, priorityLabel,
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

export default function TasksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const canWrite = useCanWrite('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');

  // Column visibility
  const { visible, toggle: toggleColumn, visibleColumns } = useColumnVisibility();
  const [columnMenuAnchor, setColumnMenuAnchor] = useState<HTMLElement | null>(null);

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

  // Focus inline input when column changes
  useEffect(() => {
    if (inlineCreateColumn) {
      setTimeout(() => inlineInputRef.current?.focus(), 50);
    }
  }, [inlineCreateColumn]);

  // --- Drag & drop ---
  const handleDragStart = (taskId: string) => setDraggedTask(taskId);

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleDrop = async (targetStatus: TaskStatus) => {
    if (!draggedTask || !projectId) return;
    const task = tasks.find(t => t.id === draggedTask);
    if (!task || task.status === targetStatus) {
      handleDragEnd();
      return;
    }
    setTasks(prev => prev.map(t => t.id === draggedTask ? { ...t, status: targetStatus } : t));
    handleDragEnd();
    try {
      await moveTask(projectId, draggedTask, targetStatus);
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
    return map;
  }, [filteredTasks]);

  const hasFilters = searchQuery || filterPriority || filterTag || assigneeFilter;

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[{ label: 'Tasks' }]}
        actions={
          <>
            <Tooltip title="Column visibility">
              <IconButton onClick={(e) => setColumnMenuAnchor(e.currentTarget)} size="small">
                <ViewColumnIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={columnMenuAnchor}
              open={Boolean(columnMenuAnchor)}
              onClose={() => setColumnMenuAnchor(null)}
            >
              {COLUMNS.map(({ status, label }) => (
                <MenuItem key={status} onClick={() => toggleColumn(status)} dense>
                  <Checkbox
                    checked={visible.has(status)}
                    disabled={visible.has(status) && visible.size === 1}
                    size="small"
                    sx={{ p: 0, mr: 1 }}
                  />
                  <ListItemText primary={label} />
                </MenuItem>
              ))}
            </Menu>
            {canWrite && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('new')}>
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
            <MenuItem value="critical">Critical</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="low">Low</MenuItem>
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
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('new')}>
              New Task
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, maxHeight: 'calc(100vh - 220px)' }}>
          {visibleColumns.map(({ status, label, color }) => {
            const columnTasks = grouped.get(status)!;
            const isDropTarget = dragOverColumn === status && draggedTask !== null;
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
                onDragOver={(e) => { e.preventDefault(); setDragOverColumn(status); }}
                onDragEnter={() => setDragOverColumn(status)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverColumn(null);
                }}
                onDrop={() => handleDrop(status)}
              >
                {/* Column header — fixed */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, pt: 1.5, pb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography variant="subtitle2" fontWeight={700}>{label}</Typography>
                    <Typography variant="caption" sx={{ color: palette.custom.textMuted }}>
                      {columnTasks.length}
                    </Typography>
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

                {/* Inline create — right below header */}
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

                {/* Column body — scrollable */}
                <Stack spacing={1} sx={{
                  flex: 1, overflowY: 'auto', px: 1.5, pb: 1.5, minHeight: 50,
                  '&::-webkit-scrollbar': { width: 4 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: alpha(palette.text.primary, 0.15), borderRadius: 2 },
                }}>
                  {columnTasks.map(task => {
                    const due = dueDateInfo(task.dueDate, task.status);
                    return (
                      <Paper
                        key={task.id}
                        variant="outlined"
                        draggable={canWrite}
                        onDragStart={canWrite ? () => handleDragStart(task.id) : undefined}
                        onDragEnd={canWrite ? handleDragEnd : undefined}
                        onClick={() => navigate(task.id)}
                        sx={{
                          p: 1.5, cursor: 'pointer', position: 'relative',
                          bgcolor: palette.custom.surface,
                          '&:hover': { borderColor: 'primary.main' },
                          '&:hover .task-actions': { opacity: 1 },
                          opacity: draggedTask === task.id ? 0.5 : 1,
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
                            onClick={(e) => { e.stopPropagation(); navigate(`${task.id}/edit`); }}
                            sx={{ p: 0.5 }}
                          >
                            <EditIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                          {canWrite && (
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(task); }}
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
                  })}
                </Stack>

              </Paper>
            );
          })}
        </Box>
      )}

      {/* Delete confirmation */}
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
