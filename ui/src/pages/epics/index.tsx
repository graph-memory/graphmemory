import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Paper, Alert, CircularProgress,
  LinearProgress, alpha, useTheme, TextField, InputAdornment,
  IconButton, FormControl, Select, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FlagIcon from '@mui/icons-material/Flag';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, StatusBadge, Tags } from '@/shared/ui/index.ts';
import { listEpics, type Epic, type EpicStatus } from '@/entities/epic/index.ts';
import { PRIORITY_COLORS, PRIORITY_BADGE_COLOR, priorityLabel, type TaskPriority } from '@/entities/task/index.ts';

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
  return { open: 'Open', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled' }[s];
}

const STATUS_OPTIONS: EpicStatus[] = ['open', 'in_progress', 'done', 'cancelled'];
const PRIORITY_OPTIONS: TaskPriority[] = ['critical', 'high', 'medium', 'low'];

export default function EpicsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const canWrite = useCanWrite('tasks');
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<EpicStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('');

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const result = await listEpics(projectId, { limit: 200 });
      setEpics(result);
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
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.title.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
    }
    if (filterStatus) result = result.filter(e => e.status === filterStatus);
    if (filterPriority) result = result.filter(e => e.priority === filterPriority);
    return result;
  }, [epics, searchQuery, filterStatus, filterPriority]);

  const hasFilters = searchQuery || filterStatus || filterPriority;

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[{ label: 'Epics' }]}
        actions={canWrite ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(`/${projectId}/epics/new`)}>
            New Epic
          </Button>
        ) : undefined}
      />

      {/* Filter bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, bgcolor: palette.custom.surfaceMuted, borderRadius: 1, mb: 2 }}>
        <TextField
          size="small" placeholder="Search epics..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          slotProps={{ input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: palette.custom.textMuted }} /></InputAdornment>,
            endAdornment: searchQuery ? <InputAdornment position="end"><IconButton size="small" onClick={() => setSearchQuery('')}><CloseIcon fontSize="small" /></IconButton></InputAdornment> : undefined,
          }}}
          sx={{ minWidth: 200, flex: 1, maxWidth: 350 }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <Select name="filter-epic-status" value={filterStatus} onChange={e => setFilterStatus(e.target.value as EpicStatus | '')} displayEmpty
            renderValue={v => v ? epicStatusLabel(v as EpicStatus) : 'Status'}
            sx={{ color: filterStatus ? undefined : palette.custom.textMuted }}>
            <MenuItem value="">All statuses</MenuItem>
            {STATUS_OPTIONS.map(s => (
              <MenuItem key={s} value={s}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: EPIC_STATUS_COLOR[s] }} />
                  {epicStatusLabel(s)}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select name="filter-epic-priority" value={filterPriority} onChange={e => setFilterPriority(e.target.value as TaskPriority | '')} displayEmpty
            renderValue={v => v ? priorityLabel(v as TaskPriority) : 'Priority'}
            sx={{ color: filterPriority ? undefined : palette.custom.textMuted }}>
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
        {hasFilters && <Button size="small" onClick={() => { setSearchQuery(''); setFilterStatus(''); setFilterPriority(''); }}>Clear</Button>}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
          <FlagIcon sx={{ fontSize: 48, color: palette.custom.textMuted, mb: 2 }} />
          <Typography variant="h6" gutterBottom>{epics.length === 0 ? 'No epics yet' : 'No matching epics'}</Typography>
          <Typography variant="body2" sx={{ color: palette.custom.textMuted, mb: 2 }}>
            {epics.length === 0 && canWrite ? 'Create your first epic to group related tasks' : ''}
          </Typography>
          {epics.length === 0 && canWrite && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(`/${projectId}/epics/new`)}>New Epic</Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filtered.map(epic => {
            const pct = epic.progress.total > 0 ? (epic.progress.done / epic.progress.total) * 100 : 0;
            const color = EPIC_STATUS_COLOR[epic.status];
            return (
              <Paper
                key={epic.id}
                variant="outlined"
                sx={{
                  p: 2, cursor: 'pointer',
                  borderLeft: `4px solid ${color}`,
                  '&:hover': { borderColor: color, bgcolor: alpha(color, 0.04) },
                }}
                onClick={() => navigate(`/${projectId}/epics/${epic.id}`)}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>{epic.title}</Typography>
                    {epic.description && (
                      <Typography variant="body2" sx={{ color: palette.custom.textMuted, mt: 0.25 }}>
                        {epic.description.length > 120 ? epic.description.slice(0, 120) + '...' : epic.description}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, ml: 2 }}>
                    <StatusBadge label={epicStatusLabel(epic.status)} color={EPIC_STATUS_BADGE[epic.status]} size="small" />
                    <StatusBadge label={priorityLabel(epic.priority)} color={PRIORITY_BADGE_COLOR[epic.priority]} size="small" />
                  </Box>
                </Box>

                {/* Progress */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: epic.tags.length > 0 ? 1 : 0 }}>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{
                      flex: 1, height: 6, borderRadius: 3,
                      bgcolor: alpha(color, 0.12),
                      '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
                    }}
                  />
                  <Typography variant="caption" fontWeight={600} sx={{ color: palette.custom.textMuted, minWidth: 55, textAlign: 'right' }}>
                    {epic.progress.done}/{epic.progress.total}
                  </Typography>
                </Box>

                {epic.tags.length > 0 && <Tags tags={epic.tags} />}
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
