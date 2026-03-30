import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, CircularProgress,
  LinearProgress, alpha, useTheme, TextField, InputAdornment,
  IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FlagIcon from '@mui/icons-material/Flag';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { useFilters } from '@/shared/lib/useFilters.ts';
import { StatusBadge, Tags, PaginationBar, DateDisplay, FilterBar, FilterControl } from '@/shared/ui/index.ts';
import { listEpics, type Epic, type EpicStatus } from '@/entities/epic/index.ts';
import { PRIORITY_COLORS, PRIORITY_BADGE_COLOR, priorityLabel, type TaskPriority } from '@/entities/task/index.ts';
import { TasksTabs } from '@/pages/tasks/TasksTabs.tsx';

const EPIC_STATUS_COLOR: Record<EpicStatus, string> = {
  open: '#1976d2',
  in_progress: '#f57c00',
  done: '#388e3c',
  cancelled: '#d32f2f',
};

const EPIC_STATUS_BADGE: Record<EpicStatus, 'primary' | 'warning' | 'success' | 'error'> = {
  open: 'primary',
  in_progress: 'warning',
  done: 'success',
  cancelled: 'error',
};

function epicStatusLabel(s: EpicStatus): string {
  return { open: 'OPEN', in_progress: 'IN PROGRESS', done: 'DONE', cancelled: 'CANCELLED' }[s];
}

const STATUS_OPTIONS: EpicStatus[] = ['open', 'in_progress', 'done', 'cancelled'];
const PRIORITY_OPTIONS: TaskPriority[] = ['critical', 'high', 'medium', 'low'];
const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

type SortField = 'title' | 'status' | 'priority' | 'progress' | 'created';

type EpicFilterKey = 'q' | 'status' | 'priority' | 'sort' | 'dir';

const EPIC_FILTER_DEFS = [
  { key: 'q', defaultValue: '' },
  { key: 'status', defaultValue: '' },
  { key: 'priority', defaultValue: '' },
  { key: 'sort', defaultValue: '', persistent: true },
  { key: 'dir', defaultValue: '', persistent: true },
];

export default function EpicsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const canWrite = useCanWrite('tasks');
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, setFilter, setFilters, clearAll } = useFilters<EpicFilterKey>(EPIC_FILTER_DEFS);

  const sortField = (filters.sort || null) as SortField | null;
  const sortDir = (filters.dir || null) as 'asc' | 'desc' | null;
  const handleSort = useCallback((field: SortField) => {
    if (sortField !== field) { setFilters({ sort: field, dir: 'asc' }); return; }
    if (sortDir === 'asc') { setFilters({ sort: field, dir: 'desc' }); return; }
    setFilters({ sort: '', dir: '' });
  }, [sortField, sortDir, setFilters]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const { items } = await listEpics(projectId, { limit: 200 });
      setEpics(items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('epic:') || event.type.startsWith('task:')) refresh();
  }, [refresh]));

  const filtered = useMemo(() => {
    let result = epics;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      result = result.filter(e => e.title.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
    }
    if (filters.status) result = result.filter(e => e.status === filters.status);
    if (filters.priority) result = result.filter(e => e.priority === filters.priority);
    return result;
  }, [epics, filters.q, filters.status, filters.priority]);

  const sorted = useMemo(() => {
    if (!sortField || !sortDir) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title': cmp = a.title.localeCompare(b.title); break;
        case 'status': cmp = STATUS_OPTIONS.indexOf(a.status) - STATUS_OPTIONS.indexOf(b.status); break;
        case 'priority': cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]; break;
        case 'progress': {
          const pA = a.progress.total > 0 ? a.progress.done / a.progress.total : 0;
          const pB = b.progress.total > 0 ? b.progress.done / b.progress.total : 0;
          cmp = pA - pB;
          break;
        }
        case 'created': cmp = a.createdAt - b.createdAt; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  // Build active filters for chips
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; color?: string; onClear: () => void }> = [];
    if (filters.status) {
      chips.push({ key: 'status', label: epicStatusLabel(filters.status as EpicStatus), color: EPIC_STATUS_COLOR[filters.status as EpicStatus], onClear: () => setFilter('status', '') });
    }
    if (filters.priority) {
      chips.push({ key: 'priority', label: priorityLabel(filters.priority as TaskPriority), color: PRIORITY_COLORS[filters.priority as TaskPriority], onClear: () => setFilter('priority', '') });
    }
    return chips;
  }, [filters, setFilter]);

  const handleClearAll = () => { clearAll(); };

  const sortLabelProps = (field: SortField) => ({
    active: sortField === field,
    direction: (sortField === field && sortDir ? sortDir : 'asc') as 'asc' | 'desc',
    onClick: () => handleSort(field),
  });

  return (
    <Box>
      <TasksTabs />

      {/* Filter bar */}
      <FilterBar activeFilters={activeFilterChips} onClearAll={handleClearAll}>
        <TextField
          size="small" placeholder="Search epics..." value={filters.q}
          onChange={e => setFilter('q', e.target.value)}
          slotProps={{ input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: palette.custom.textMuted }} /></InputAdornment>,
            endAdornment: filters.q ? <InputAdornment position="end"><IconButton size="small" onClick={() => setFilter('q', '')}><CloseIcon fontSize="small" /></IconButton></InputAdornment> : undefined,
          }}}
          sx={{ minWidth: 200, flex: 1, maxWidth: 350 }}
        />
        <FilterControl
          name="filter-epic-status"
          value={filters.status}
          onChange={v => setFilter('status', v)}
          placeholder="Status"
          allLabel="All statuses"
          options={STATUS_OPTIONS.map(s => ({ value: s, label: epicStatusLabel(s), color: EPIC_STATUS_COLOR[s] }))}
        />
        <FilterControl
          name="filter-epic-priority"
          value={filters.priority}
          onChange={v => setFilter('priority', v)}
          placeholder="Priority"
          allLabel="All priorities"
          options={PRIORITY_OPTIONS.map(p => ({ value: p, label: priorityLabel(p), color: PRIORITY_COLORS[p] }))}
        />
      </FilterBar>

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ flex: 1 }} />
        {canWrite && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => navigate(`/${projectId}/tasks/epics/new`)} sx={{ mr: 1 }}>
            New Epic
          </Button>
        )}
        <PaginationBar page={1} totalPages={1} onPageChange={() => {}} onRefresh={refresh} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : sorted.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
          <FlagIcon sx={{ fontSize: 48, color: palette.custom.textMuted, mb: 2 }} />
          <Typography variant="h6" gutterBottom>{epics.length === 0 ? 'No epics yet' : 'No matching epics'}</Typography>
          <Typography variant="body2" sx={{ color: palette.custom.textMuted, mb: 2 }}>
            {epics.length === 0 && canWrite ? 'Create your first epic to group related tasks' : ''}
          </Typography>
          {epics.length === 0 && canWrite && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(`/${projectId}/tasks/epics/new`)}>New Epic</Button>
          )}
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><TableSortLabel {...sortLabelProps('title')}>Title</TableSortLabel></TableCell>
                <TableCell width={120}><TableSortLabel {...sortLabelProps('status')}>Status</TableSortLabel></TableCell>
                <TableCell width={110}><TableSortLabel {...sortLabelProps('priority')}>Priority</TableSortLabel></TableCell>
                <TableCell width={160}><TableSortLabel {...sortLabelProps('progress')}>Progress</TableSortLabel></TableCell>
                <TableCell>Tags</TableCell>
                <TableCell width={120}><TableSortLabel {...sortLabelProps('created')}>Created</TableSortLabel></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map(epic => {
                const pct = epic.progress.total > 0 ? (epic.progress.done / epic.progress.total) * 100 : 0;
                const color = EPIC_STATUS_COLOR[epic.status];
                return (
                  <TableRow
                    key={epic.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/${projectId}/tasks/epics/${epic.id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} noWrap>{epic.title}</Typography>
                      {epic.description && (
                        <Typography variant="caption" sx={{ color: palette.custom.textMuted }} noWrap>
                          {epic.description.length > 80 ? epic.description.slice(0, 80) + '...' : epic.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={epicStatusLabel(epic.status)} color={EPIC_STATUS_BADGE[epic.status]} size="small" />
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={priorityLabel(epic.priority)} color={PRIORITY_BADGE_COLOR[epic.priority]} size="small" />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
                            flex: 1, height: 6, borderRadius: 3,
                            bgcolor: alpha(color, 0.12),
                            '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
                          }}
                        />
                        <Typography variant="caption" fontWeight={600} sx={{ color: palette.custom.textMuted, minWidth: 40, textAlign: 'right' }}>
                          {epic.progress.done}/{epic.progress.total}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {epic.tags.length > 0 && <Tags tags={epic.tags} />}
                    </TableCell>
                    <TableCell>
                      <DateDisplay value={epic.createdAt} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Box sx={{ mt: 2 }}>
        <PaginationBar page={1} totalPages={1} onPageChange={() => {}} onRefresh={refresh} />
      </Box>
    </Box>
  );
}
