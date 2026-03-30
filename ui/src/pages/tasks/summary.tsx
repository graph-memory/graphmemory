import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, CircularProgress, Alert, useTheme, alpha, Chip,
} from '@mui/material';
import ScheduleIcon from '@mui/icons-material/Schedule';
import {
  listTasks,
  COLUMNS, PRIORITY_COLORS, priorityLabel,
  type Task, type TaskStatus, type TaskPriority,
} from '@/entities/task/index.ts';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { TasksTabs } from './TasksTabs.tsx';

const DAY_MS = 86_400_000;
const DONE_STATUSES: TaskStatus[] = ['done', 'cancelled'];

function StatCard({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 120, borderTop: `3px solid ${color}` }}>
      <Typography variant="h4" fontWeight={700} sx={{ color }}>{value}</Typography>
      <Typography variant="body2" fontWeight={600}>{label}</Typography>
      {sub && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{sub}</Typography>}
    </Paper>
  );
}

export default function TaskSummaryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const { items } = await listTasks(projectId, { limit: 1000 });
      setTasks(items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('task:')) refresh();
  }, [refresh]));

  const stats = useMemo(() => {
    const byStatus = new Map<TaskStatus, number>();
    const byPriority = new Map<TaskPriority, number>();
    const overdue: Task[] = [];

    const now = new Date(); now.setHours(0, 0, 0, 0);

    for (const t of tasks) {
      byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
      byPriority.set(t.priority, (byPriority.get(t.priority) ?? 0) + 1);

      if (t.dueDate && !DONE_STATUSES.includes(t.status)) {
        const due = new Date(t.dueDate); due.setHours(0, 0, 0, 0);
        if (due.getTime() < now.getTime()) overdue.push(t);
      }
    }

    const done = (byStatus.get('done') ?? 0) + (byStatus.get('cancelled') ?? 0);
    const active = tasks.length - done;

    return { byStatus, byPriority, overdue, done, active, total: tasks.length };
  }, [tasks]);

  if (loading) {
    return <Box><TasksTabs /><Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box></Box>;
  }

  if (error) {
    return <Box><TasksTabs /><Alert severity="error">{error}</Alert></Box>;
  }

  return (
    <Box>
      <TasksTabs />

      {/* Top stat cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <StatCard label="Total" value={stats.total} color={palette.primary.main} />
        <StatCard label="Active" value={stats.active} color="#f57c00" sub={`${stats.done} completed`} />
        <StatCard label="In Progress" value={stats.byStatus.get('in_progress') ?? 0} color="#f57c00" />
        <StatCard label="Overdue" value={stats.overdue.length} color="#d32f2f" />
      </Box>

      {/* Breakdowns */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}>
        {/* By status */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>By Status</Typography>
          {COLUMNS.map(col => {
            const count = stats.byStatus.get(col.status) ?? 0;
            const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
            return (
              <Box key={col.status} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: col.color, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>{col.label}</Typography>
                <Typography variant="body2" fontWeight={600} sx={{ width: 30, textAlign: 'right' }}>{count}</Typography>
                <Box sx={{ width: 80, height: 6, bgcolor: alpha(col.color, 0.15), borderRadius: 3, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: col.color, borderRadius: 3 }} />
                </Box>
              </Box>
            );
          })}
        </Paper>

        {/* By priority */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>By Priority</Typography>
          {(['critical', 'high', 'medium', 'low'] as const).map(p => {
            const count = stats.byPriority.get(p) ?? 0;
            const color = PRIORITY_COLORS[p];
            const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
            return (
              <Box key={p} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>{priorityLabel(p)}</Typography>
                <Typography variant="body2" fontWeight={600} sx={{ width: 30, textAlign: 'right' }}>{count}</Typography>
                <Box sx={{ width: 80, height: 6, bgcolor: alpha(color, 0.15), borderRadius: 3, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: color, borderRadius: 3 }} />
                </Box>
              </Box>
            );
          })}
        </Paper>
      </Box>

      {/* Overdue tasks */}
      {stats.overdue.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, borderColor: alpha('#d32f2f', 0.3) }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, color: '#d32f2f' }}>
            Overdue ({stats.overdue.length})
          </Typography>
          {stats.overdue.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0)).map(t => {
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const due = new Date(t.dueDate!); due.setHours(0, 0, 0, 0);
            const days = Math.round((now.getTime() - due.getTime()) / DAY_MS);
            return (
              <Box
                key={t.id}
                onClick={() => navigate(`/${projectId}/tasks/${t.id}`)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, py: 0.75, px: 1,
                  cursor: 'pointer', borderRadius: 0.5,
                  '&:hover': { bgcolor: alpha(palette.text.primary, 0.04) },
                }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PRIORITY_COLORS[t.priority], flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>{t.title}</Typography>
                <Chip
                  icon={<ScheduleIcon sx={{ fontSize: '14px !important' }} />}
                  label={`${days}d overdue`}
                  size="small"
                  color="error"
                  sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' } }}
                />
              </Box>
            );
          })}
        </Paper>
      )}
    </Box>
  );
}
